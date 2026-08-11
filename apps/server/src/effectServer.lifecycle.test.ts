import { idleThreadPreview } from "@luminor/shared/preview/previewState";
import { Effect, Scope } from "effect";
import { describe, expect, it } from "vitest";

import { closeServerRuntimePipeline, stopAllThreadPreviews } from "./effectServer.ts";

describe("server runtime pipeline shutdown", () => {
  it("persists accepted provider terminal work before the engine stops", async () => {
    const order: string[] = [];
    let terminalAccepted = false;
    let terminalPersisted = false;
    let attachmentsDrained = false;
    const subscriptionsScope = await Effect.runPromise(Scope.make("sequential"));
    await Effect.runPromise(
      Scope.addFinalizer(
        subscriptionsScope,
        Effect.sync(() => {
          expect(terminalAccepted).toBe(true);
          terminalPersisted = true;
          order.push("reactors-drained-and-persisted");
        }),
      ),
    );

    await Effect.runPromise(
      closeServerRuntimePipeline({
        orchestrationEngine: {
          quiesce: Effect.sync(() => order.push("engine-quiesced")),
          drain: Effect.sync(() => order.push("admitted-commands-drained")),
          stop: Effect.sync(() => {
            expect(terminalPersisted).toBe(true);
            expect(attachmentsDrained).toBe(true);
            order.push("engine-stopped");
          }),
        },
        providerService: {
          closeRuntimeEvents: Effect.sync(() => {
            terminalAccepted = true;
            order.push("provider-terminal-events-fenced");
          }),
        },
        managedAttachmentCleanup: {
          drain: Effect.sync(() => {
            expect(terminalPersisted).toBe(true);
            attachmentsDrained = true;
            order.push("managed-attachments-drained");
          }),
        },
        threadPreviewManager: {
          list: Effect.succeed({ previews: [] }),
          stopPreview: () => Effect.succeed({ stopped: false }),
        },
        subscriptionsScope,
      }),
    );

    expect(order).toEqual([
      "engine-quiesced",
      "admitted-commands-drained",
      "provider-terminal-events-fenced",
      "reactors-drained-and-persisted",
      "managed-attachments-drained",
      "engine-stopped",
    ]);
  });

  it("sweeps every preview when one stop defects", async () => {
    const stopped: string[] = [];
    const previews = ["thread-1", "thread-2", "thread-3"].map(idleThreadPreview);

    await Effect.runPromise(
      stopAllThreadPreviews({
        list: Effect.succeed({ previews }),
        stopPreview: (threadId) =>
          Effect.sync(() => stopped.push(threadId)).pipe(
            Effect.andThen(
              threadId === "thread-2"
                ? Effect.die("stop defect")
                : Effect.succeed({ stopped: true }),
            ),
          ),
      }),
    );

    expect(stopped).toEqual(["thread-1", "thread-2", "thread-3"]);
  });
});
