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

  subscribe(threadId: ThreadId, principal: BrowserViewerPrincipal, sink: BinaryFrameSink): string {
    return this.transport.subscribe(threadId, principal, sink);
  }

  unsubscribe(subscriptionId: string): boolean {
    return this.transport.unsubscribe(subscriptionId);
  }

  publish(threadId: ThreadId, bytes: Uint8Array): void {
    this.transport.publish(threadId, { bytes });
  }

  stats(subscriptionId: string) {
    return this.transport.getStats(subscriptionId);
  }

  subscriberCount(threadId?: ThreadId): number {
    return this.transport.subscriberCount(threadId);
  }
}
