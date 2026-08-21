import type { BrowserGenerationBumpReason, BrowserStreamLifecycleState } from "@luminor/contracts";

export type BrowserStreamLifecycleEvent =
  | { readonly type: "subscribe" }
  | { readonly type: "started" }
  | { readonly type: "unsubscribe" }
  | { readonly type: "stopped" }
  | { readonly type: "detach" }
  | { readonly type: "reattach" }
  | {
      readonly type: "reconfigure";
      readonly reason: Extract<
        BrowserGenerationBumpReason,
        "reconfigure" | "resize" | "tab-switch" | "thread-switch" | "desktop-restart"
      >;
    };

export interface BrowserStreamLifecycleSnapshot {
  readonly state: BrowserStreamLifecycleState;
  readonly generation: number;
  readonly reason: BrowserGenerationBumpReason | null;
}

export interface BrowserStreamLifecycleTransition extends BrowserStreamLifecycleSnapshot {
  readonly previousState: BrowserStreamLifecycleState;
  readonly invalidatedGeneration: number | null;
}

export class BrowserStreamLifecycle {
  private state: BrowserStreamLifecycleState = "stopped";
  private generation = 0;
  private reason: BrowserGenerationBumpReason | null = null;

  snapshot(): BrowserStreamLifecycleSnapshot {
    return { state: this.state, generation: this.generation, reason: this.reason };
  }

  transition(event: BrowserStreamLifecycleEvent): BrowserStreamLifecycleTransition {
    const previousState = this.state;
    let nextState = this.state;
    let bumpReason: BrowserGenerationBumpReason | null = null;
    switch (event.type) {
      case "subscribe":
        if (this.state === "stopped") {
          nextState = "starting";
          bumpReason = "start";
        }
        break;
      case "started":
        if (this.state === "starting") nextState = "streaming";
        break;
      case "unsubscribe":
        if (this.state === "starting" || this.state === "streaming" || this.state === "detached") {
          nextState = "stopping";
          bumpReason = "stop";
        }
        break;
      case "stopped":
        if (this.state === "stopping") nextState = "stopped";
        break;
      case "detach":
        if (this.state !== "stopped" && this.state !== "stopping") nextState = "detached";
        break;
      case "reattach":
        if (this.state === "detached") {
          nextState = "starting";
          bumpReason = "reattach";
        }
        break;
      case "reconfigure":
        if (this.state !== "stopped" && this.state !== "stopping") {
          nextState = "starting";
          bumpReason = event.reason;
        }
        break;
    }
    const invalidatedGeneration = bumpReason && this.generation > 0 ? this.generation : null;
    if (bumpReason) {
      this.generation += 1;
      this.reason = bumpReason;
    }
    this.state = nextState;
    return {
      state: this.state,
      generation: this.generation,
      reason: this.reason,
      previousState,
      invalidatedGeneration,
    };
  }
}
