export interface BinaryFrameSink {
  readonly send: (bytes: Uint8Array) => void | Promise<void>;
  readonly bufferedAmount: () => number;
  readonly isOpen: () => boolean;
}

export function makeBinaryFrameSink(options: {
  readonly send: (bytes: Uint8Array) => Promise<void> | void;
  readonly isOpen: () => boolean;
}): BinaryFrameSink {
  let inFlightBytes = 0;
  return {
    send: (bytes) => {
      inFlightBytes += bytes.byteLength;
      const settle = () => {
        inFlightBytes = Math.max(0, inFlightBytes - bytes.byteLength);
      };
      try {
        const result = options.send(bytes);
        if (result instanceof Promise) {
          return result.then(
            () => settle(),
            (error) => {
              settle();
              throw error;
            },
          );
        }
        settle();
      } catch (error) {
        settle();
        throw error;
      }
    },
    bufferedAmount: () => inFlightBytes,
    isOpen: options.isOpen,
  };
}

export type BinaryFrameOverflowPolicy = "replace-latest" | "drop-until-keyframe";

export interface BinaryFrameTransportFrame {
  readonly bytes: Uint8Array;
  readonly keyframe?: boolean;
  readonly bypassKeyframeGate?: boolean;
}

export interface BinaryFrameSubscriberStats<Principal> {
  readonly principal: Principal;
  readonly sent: number;
  readonly dropped: number;
  readonly awaitingKeyframe: boolean;
  readonly queued: number;
}

interface BinaryFrameSubscriber<Key, Principal> {
  readonly id: string;
  readonly key: Key;
  readonly principal: Principal;
  readonly sink: BinaryFrameSink;
  readonly queue: BinaryFrameTransportFrame[];
  awaitingKeyframe: boolean;
  sending: boolean;
  sent: number;
  dropped: number;
}

export interface BinaryFrameTransportOptions {
  readonly queueLimit: number;
  readonly socketBudgetBytes: number;
  readonly overflowPolicy: BinaryFrameOverflowPolicy;
}

export interface BinaryFrameSubscriptionOptions {
  readonly initialFrames?: readonly BinaryFrameTransportFrame[];
  readonly awaitingKeyframe?: boolean;
}

export class BinaryFrameTransport<Key, Principal> {
  private readonly subscribers = new Map<string, BinaryFrameSubscriber<Key, Principal>>();
  private readonly subscribersByKey = new Map<Key, Set<BinaryFrameSubscriber<Key, Principal>>>();
  private nextSubscriberId = 1;

  constructor(private readonly options: BinaryFrameTransportOptions) {}

  subscribe(
    key: Key,
    principal: Principal,
    sink: BinaryFrameSink,
    options: BinaryFrameSubscriptionOptions = {},
  ): string {
    const id = String(this.nextSubscriberId++);
    const subscriber: BinaryFrameSubscriber<Key, Principal> = {
      id,
      key,
      principal,
      sink,
      queue: [...(options.initialFrames ?? [])].slice(-this.options.queueLimit),
      awaitingKeyframe: options.awaitingKeyframe ?? false,
      sending: false,
      sent: 0,
      dropped: 0,
    };
    this.subscribers.set(id, subscriber);
    const keyed = this.subscribersByKey.get(key) ?? new Set();
    keyed.add(subscriber);
    this.subscribersByKey.set(key, keyed);
    this.flush(subscriber);
    return id;
  }

  unsubscribe(id: string): boolean {
    const subscriber = this.subscribers.get(id);
    if (!subscriber) return false;
    this.subscribers.delete(id);
    const keyed = this.subscribersByKey.get(subscriber.key);
    keyed?.delete(subscriber);
    if (keyed?.size === 0) this.subscribersByKey.delete(subscriber.key);
    subscriber.queue.length = 0;
    return true;
  }

  publish(key: Key, frame: BinaryFrameTransportFrame): void {
    for (const subscriber of [...(this.subscribersByKey.get(key) ?? [])]) {
      if (!subscriber.sink.isOpen()) {
        this.unsubscribe(subscriber.id);
        continue;
      }
      if (this.options.overflowPolicy === "drop-until-keyframe") this.flush(subscriber);
      this.enqueue(subscriber, frame);
      this.flush(subscriber);
    }
  }

  getStats(id: string): BinaryFrameSubscriberStats<Principal> | null {
    const subscriber = this.subscribers.get(id);
    return subscriber
      ? {
          principal: subscriber.principal,
          sent: subscriber.sent,
          dropped: subscriber.dropped,
          awaitingKeyframe: subscriber.awaitingKeyframe,
          queued: subscriber.queue.length,
        }
      : null;
  }

  subscriberCount(key?: Key): number {
    return key === undefined ? this.subscribers.size : (this.subscribersByKey.get(key)?.size ?? 0);
  }

  resetKey(key: Key, awaitingKeyframe = false): void {
    for (const subscriber of this.subscribersByKey.get(key) ?? []) {
      subscriber.queue.length = 0;
      subscriber.awaitingKeyframe = awaitingKeyframe;
    }
  }

  private enqueue(
    subscriber: BinaryFrameSubscriber<Key, Principal>,
    frame: BinaryFrameTransportFrame,
  ): void {
    const congested =
      subscriber.sending || subscriber.sink.bufferedAmount() > this.options.socketBudgetBytes;
    const queueFull = subscriber.queue.length >= this.options.queueLimit;
    if (this.options.overflowPolicy === "replace-latest") {
      if (congested || queueFull || subscriber.queue.length > 0) {
        subscriber.dropped += subscriber.queue.length;
        subscriber.queue.length = 0;
      }
      subscriber.queue.push(frame);
      return;
    }
    if (subscriber.awaitingKeyframe && !frame.keyframe && !frame.bypassKeyframeGate) {
      subscriber.dropped += 1;
      return;
    }
    if (queueFull) {
      subscriber.dropped += subscriber.queue.length + 1;
      subscriber.queue.length = 0;
      subscriber.awaitingKeyframe = true;
      if (!frame.keyframe && !frame.bypassKeyframeGate) return;
    }
    if (frame.keyframe) subscriber.awaitingKeyframe = false;
    subscriber.queue.push(frame);
  }

  private flush(subscriber: BinaryFrameSubscriber<Key, Principal>): void {
    if (subscriber.sending || !subscriber.sink.isOpen()) return;
    if (subscriber.sink.bufferedAmount() > this.options.socketBudgetBytes) return;
    const frame = subscriber.queue.shift();
    if (!frame) return;
    let result: void | Promise<void>;
    try {
      result = subscriber.sink.send(frame.bytes);
      subscriber.sent += 1;
    } catch {
      this.unsubscribe(subscriber.id);
      return;
    }
    if (result instanceof Promise) {
      subscriber.sending = true;
      void result.then(
        () => {
          subscriber.sending = false;
          this.flush(subscriber);
        },
        () => this.unsubscribe(subscriber.id),
      );
      return;
    }
    this.flush(subscriber);
  }
}
