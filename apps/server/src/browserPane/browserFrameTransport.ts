import type { BrowserViewerPrincipal, ThreadId } from "@luminor/contracts";
import { BinaryFrameTransport, type BinaryFrameSink } from "@luminor/shared/frameTransport";

export const BROWSER_FRAME_QUEUE_LIMIT = 1;
export const BROWSER_FRAME_SOCKET_BUDGET_BYTES = 2 * 1024 * 1024;

export class BrowserFrameTransport {
  private readonly transport = new BinaryFrameTransport<ThreadId, BrowserViewerPrincipal>({
    queueLimit: BROWSER_FRAME_QUEUE_LIMIT,
    socketBudgetBytes: BROWSER_FRAME_SOCKET_BUDGET_BYTES,
    overflowPolicy: "replace-latest",
  });
  private readonly latestEnvelope = new Map<ThreadId, Uint8Array>();

  subscribe(threadId: ThreadId, principal: BrowserViewerPrincipal, sink: BinaryFrameSink): string {
    const latest = this.latestEnvelope.get(threadId);
    return this.transport.subscribe(threadId, principal, sink, {
      initialFrames: latest ? [{ bytes: latest }] : [],
    });
  }

  unsubscribe(subscriptionId: string): boolean {
    return this.transport.unsubscribe(subscriptionId);
  }

  publish(threadId: ThreadId, bytes: Uint8Array): void {
    this.latestEnvelope.set(threadId, bytes);
    this.transport.publish(threadId, { bytes });
  }

  invalidate(threadId: ThreadId): void {
    this.latestEnvelope.delete(threadId);
    this.transport.resetKey(threadId);
  }

  stats(subscriptionId: string) {
    return this.transport.getStats(subscriptionId);
  }

  subscriberCount(threadId?: ThreadId): number {
    return this.transport.subscriberCount(threadId);
  }
}
