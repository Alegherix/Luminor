import { Worker } from "node:worker_threads";

import type {
  BrowserDesktopInstanceId,
  BrowserFrameHeader,
  BrowserGeneration,
  BrowserTabId,
} from "@luminor/contracts";
import type { NativeImage } from "electron";

import type { BrowserRemoteRuntime } from "../browserManager";
import { ensureDialogSuppression } from "../browserAutomation/dialogHandling";
import { getCdpSessionCoordinator } from "../browserAutomation/cdpRuntime";

interface PendingBitmap {
  readonly id: number;
  readonly seq: number;
  readonly width: number;
  readonly height: number;
  readonly bitmap: ArrayBuffer;
  readonly captureTs: number;
}

interface WorkerSuccess {
  readonly id: number;
  readonly ok: true;
  readonly jpeg: ArrayBuffer;
}

interface WorkerFailure {
  readonly id: number;
  readonly ok: false;
  readonly error: string;
}

type WorkerResult = WorkerSuccess | WorkerFailure;

interface LayoutMetrics {
  readonly visualViewport?: {
    readonly clientWidth?: number;
    readonly clientHeight?: number;
    readonly pageX?: number;
    readonly pageY?: number;
    readonly offsetX?: number;
    readonly offsetY?: number;
    readonly scale?: number;
  };
  readonly cssVisualViewport?: {
    readonly clientWidth?: number;
    readonly clientHeight?: number;
    readonly pageX?: number;
    readonly pageY?: number;
    readonly offsetX?: number;
    readonly offsetY?: number;
    readonly scale?: number;
  };
}

interface FrameMetadata {
  readonly deviceWidth: number;
  readonly deviceHeight: number;
  readonly pageScaleFactor: number;
  readonly offsetTop: number;
  readonly scrollOffsetX: number;
  readonly scrollOffsetY: number;
  readonly timestamp: number;
}

export interface AcquiredBrowserFrame {
  readonly header: BrowserFrameHeader;
  readonly jpeg: Uint8Array;
}

export interface BrowserFrameAcquisitionOptions {
  readonly desktopInstanceId: BrowserDesktopInstanceId;
  readonly generation: BrowserGeneration;
  readonly runtime: BrowserRemoteRuntime;
  readonly workerPath: string;
  readonly onFrame: (frame: AcquiredBrowserFrame) => void;
  readonly onDetach: (reason: string) => void;
}

export class BrowserFrameAcquisition {
  private readonly worker: Worker;
  private readonly coordinator;
  private pending: PendingBitmap | null = null;
  private latest: PendingBitmap | null = null;
  private nextId = 1;
  private nextSeq = 0;
  private stopped = false;
  private metadata: FrameMetadata | null = null;
  private metadataRefresh: Promise<void> | null = null;
  private lastMetadataRefreshAt = 0;
  private unsubscribeDetach: () => void = () => undefined;

  constructor(private readonly options: BrowserFrameAcquisitionOptions) {
    this.worker = new Worker(options.workerPath);
    this.coordinator = getCdpSessionCoordinator(options.runtime.webContents);
    this.worker.on("message", this.handleWorkerMessage);
    this.worker.on("error", this.handleWorkerError);
  }

  async start(): Promise<void> {
    this.coordinator.ensureAttached();
    this.unsubscribeDetach = this.coordinator.subscribeDetach(this.handleDetach);
    this.options.runtime.webContents.on("paint", this.handlePaint);
    await this.coordinator.sendCommand("Emulation.setDeviceMetricsOverride", {
      width: this.options.runtime.viewport.width,
      height: this.options.runtime.viewport.height,
      deviceScaleFactor: this.options.runtime.viewport.deviceScaleFactor,
      mobile: false,
      screenWidth: this.options.runtime.viewport.width,
      screenHeight: this.options.runtime.viewport.height,
    });
    await Promise.all([
      this.coordinator.sendCommand("Page.enable"),
      ensureDialogSuppression(this.options.runtime),
      this.refreshMetadata(true),
    ]);
    if (!this.options.runtime.webContents.isDestroyed()) {
      this.options.runtime.webContents.invalidate();
    }
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribeDetach();
    if (!this.options.runtime.webContents.isDestroyed()) {
      this.options.runtime.webContents.removeListener("paint", this.handlePaint);
    }
    this.worker.removeListener("message", this.handleWorkerMessage);
    this.worker.removeListener("error", this.handleWorkerError);
    void this.worker.terminate();
    this.pending = null;
    this.latest = null;
  }

  private readonly handlePaint = (
    _event: Electron.Event,
    _dirtyRect: Electron.Rectangle,
    image: NativeImage,
  ): void => {
    if (this.stopped || image.isEmpty()) return;
    const { width, height } = image.getSize();
    if (width <= 0 || height <= 0) return;
    const bitmap = new Uint8Array(image.toBitmap()).slice().buffer;
    const capture: PendingBitmap = {
      id: this.nextId++,
      seq: this.nextSeq++,
      width,
      height,
      bitmap,
      captureTs: Date.now(),
    };
    void this.refreshMetadata(false);
    if (this.pending) {
      this.latest = capture;
      return;
    }
    this.encode(capture);
  };

  private encode(capture: PendingBitmap): void {
    this.pending = capture;
    this.worker.postMessage(
      {
        id: capture.id,
        width: capture.width,
        height: capture.height,
        bitmap: capture.bitmap,
      },
      [capture.bitmap],
    );
  }

  private readonly handleWorkerMessage = (result: WorkerResult): void => {
    const capture = this.pending;
    this.pending = null;
    if (!this.stopped && capture?.id === result.id && result.ok) {
      const metadata = this.metadata ?? this.defaultMetadata(capture.width, capture.height);
      this.options.onFrame({
        header: {
          desktopInstanceId: this.options.desktopInstanceId,
          threadId: this.options.runtime.threadId,
          tabId: this.options.runtime.tabId as BrowserTabId,
          generation: this.options.generation,
          seq: capture.seq as BrowserFrameHeader["seq"],
          jpegW: capture.width,
          jpegH: capture.height,
          ...metadata,
          captureTs: capture.captureTs,
        },
        jpeg: new Uint8Array(result.jpeg),
      });
    }
    const latest = this.latest;
    this.latest = null;
    if (!this.stopped && latest) this.encode(latest);
  };

  private readonly handleWorkerError = (): void => {
    this.pending = null;
    if (!this.stopped) this.options.onDetach("jpeg-worker-failed");
  };

  private readonly handleDetach = (reason: string): void => {
    if (!this.stopped) this.options.onDetach(reason);
  };

  private async refreshMetadata(force: boolean): Promise<void> {
    const now = Date.now();
    if (!force && (this.metadataRefresh || now - this.lastMetadataRefreshAt < 250)) return;
    const refresh = this.coordinator
      .sendCommand<LayoutMetrics>("Page.getLayoutMetrics")
      .then((result) => {
        const viewport = result.cssVisualViewport ?? result.visualViewport;
        if (!viewport) return;
        this.metadata = {
          deviceWidth: Math.max(1, viewport.clientWidth ?? 1),
          deviceHeight: Math.max(1, viewport.clientHeight ?? 1),
          pageScaleFactor: Math.max(0.01, viewport.scale ?? 1),
          offsetTop: viewport.offsetY ?? 0,
          scrollOffsetX: viewport.pageX ?? viewport.offsetX ?? 0,
          scrollOffsetY: viewport.pageY ?? viewport.offsetY ?? 0,
          timestamp: Date.now() / 1_000,
        };
        this.lastMetadataRefreshAt = Date.now();
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.metadataRefresh === refresh) this.metadataRefresh = null;
      });
    this.metadataRefresh = refresh;
    await refresh;
  }

  private defaultMetadata(width: number, height: number): FrameMetadata {
    return {
      deviceWidth: width,
      deviceHeight: height,
      pageScaleFactor: 1,
      offsetTop: 0,
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      timestamp: Date.now() / 1_000,
    };
  }
}
