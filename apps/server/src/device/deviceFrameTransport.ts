/**
 * Device frame transport - fan-out of encoded video frames to WebSocket clients.
 *
 * Video shares the one WebSocket with JSON RPC, so this module's whole job is
 * making sure a slow client can never hurt anything else:
 *
 * - Nothing is ever buffered unboundedly. Each subscriber has a bounded queue
 *   and a byte budget; exceeding either drops frames.
 * - Drops are keyframe-aligned. H.264 P-frames referencing a dropped frame
 *   decode into garbage, so once a subscriber falls behind it stays in a
 *   dropping state until the next keyframe, then resumes cleanly.
 * - A subscriber that is behind on the socket itself (`bufferedAmount` above
 *   the budget) is not written to at all, so video backlog cannot delay the RPC
 *   traffic queued behind it on the same connection.
 *
 * New subscribers are primed with the cached codec-config and the most recent
 * keyframe, so a pane opened mid-stream decodes its first frame rather than
 * waiting for the encoder's next IDR.
 *
 * @module device/deviceFrameTransport
 */
import { encodeDeviceFrame } from "@luminor/shared/deviceFrame";
import { BinaryFrameTransport, type BinaryFrameSink } from "@luminor/shared/frameTransport";

import type { DeviceStreamFrame } from "./DeviceBackend.ts";

/** Frames queued per subscriber before drop-until-keyframe engages. */
export const DEVICE_FRAME_QUEUE_LIMIT = 8;
/** Socket backlog above which a subscriber is considered too slow to write to. */
export const DEVICE_FRAME_SOCKET_BUDGET_BYTES = 2 * 1024 * 1024;

export interface DeviceFrameSink extends BinaryFrameSink {
  readonly send: (bytes: Uint8Array) => void;
}

export interface DeviceFrameSubscriberStats {
  readonly sent: number;
  readonly dropped: number;
  readonly awaitingKeyframe: boolean;
  readonly queued: number;
}

export interface DeviceFrameTransportOptions {
  readonly queueLimit?: number;
  readonly socketBudgetBytes?: number;
}

/**
 * Routes frames for many devices to many subscribers. One instance per server;
 * subscribers name the device they want.
 */
export class DeviceFrameTransport {
  private readonly transport: BinaryFrameTransport<string, null>;
  private readonly subscriberIdsByDevice = new Map<string, Set<string>>();
  private readonly latestKeyframe = new Map<string, Uint8Array>();
  private readonly codecConfig = new Map<string, Uint8Array>();

  constructor(options: DeviceFrameTransportOptions = {}) {
    this.transport = new BinaryFrameTransport({
      queueLimit: options.queueLimit ?? DEVICE_FRAME_QUEUE_LIMIT,
      socketBudgetBytes: options.socketBudgetBytes ?? DEVICE_FRAME_SOCKET_BUDGET_BYTES,
      overflowPolicy: "drop-until-keyframe",
    });
  }

  get subscriberCount(): number {
    return this.transport.subscriberCount();
  }

  deviceSubscriberCount(deviceId: string): number {
    return this.transport.subscriberCount(deviceId);
  }

  /**
   * Register a sink for one device's stream. Returns an unsubscribe function.
   * The subscriber is immediately primed with codec config and the last
   * keyframe when the stream has already produced them.
   */
  subscribe(deviceId: string, sink: DeviceFrameSink): () => void {
    const config = this.codecConfig.get(deviceId);
    const keyframe = this.latestKeyframe.get(deviceId);
    const initialFrames = [
      ...(config ? [{ bytes: config, bypassKeyframeGate: true }] : []),
      ...(keyframe ? [{ bytes: keyframe, keyframe: true }] : []),
    ];
    const id = this.transport.subscribe(deviceId, null, sink, {
      initialFrames,
      awaitingKeyframe: !keyframe,
    });
    const ids = this.subscriberIdsByDevice.get(deviceId) ?? new Set<string>();
    ids.add(id);
    this.subscriberIdsByDevice.set(deviceId, ids);
    return () => {
      this.transport.unsubscribe(id);
      ids.delete(id);
      if (ids.size === 0) this.subscriberIdsByDevice.delete(deviceId);
    };
  }

  /** Encode one frame and fan it out to every subscriber of that device. */
  publish(deviceId: string, frame: DeviceStreamFrame): void {
    const encoded = encodeDeviceFrame({
      header: {
        deviceId,
        sequence: frame.sequence,
        timestampMs: frame.timestampMs,
        keyframe: frame.keyframe,
        codecConfig: frame.codecConfig,
      },
      payload: frame.data,
    });

    // Cached for late subscribers. Codec config and keyframes are the only two
    // records a decoder needs to start, so nothing else is retained.
    if (frame.codecConfig) this.codecConfig.set(deviceId, encoded);
    else if (frame.keyframe) this.latestKeyframe.set(deviceId, encoded);

    this.transport.publish(deviceId, {
      bytes: encoded,
      keyframe: frame.keyframe,
      bypassKeyframeGate: frame.codecConfig,
    });
  }

  /** Forget cached keyframes for a device whose stream ended. */
  resetDevice(deviceId: string): void {
    this.latestKeyframe.delete(deviceId);
    this.codecConfig.delete(deviceId);
    this.transport.resetKey(deviceId, true);
  }

  statsFor(deviceId: string): readonly DeviceFrameSubscriberStats[] {
    const ids = this.subscriberIdsByDevice.get(deviceId) ?? [];
    return [...ids]
      .map((id) => this.transport.getStats(id))
      .filter((stats): stats is NonNullable<typeof stats> => stats !== null)
      .map(({ sent, dropped, awaitingKeyframe, queued }) => ({
        sent,
        dropped,
        awaitingKeyframe,
        queued,
      }));
  }
}
