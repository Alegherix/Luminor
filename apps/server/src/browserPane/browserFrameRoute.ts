import {
  BROWSER_FRAME_WS_PATH,
  BROWSER_FRAME_WS_THREAD_ID_PARAM,
  type BrowserViewerPrincipal,
  type ThreadId,
} from "@luminor/contracts";
import { makeBinaryFrameSink } from "@luminor/shared/frameTransport";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { browserPaneManager, type BrowserPaneManager } from "./browserPaneManager.ts";

export function makeBrowserFrameRouteLayer<R = never>(options: {
  readonly authorizeUpgrade: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<BrowserViewerPrincipal | null, never, R>;
  readonly manager?: BrowserPaneManager;
}) {
  const manager = options.manager ?? browserPaneManager;
  return Layer.effectDiscard(
    Effect.gen(function* () {
      const router = yield* HttpRouter.HttpRouter;
      yield* router.add(
        "GET",
        BROWSER_FRAME_WS_PATH,
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const url = HttpServerRequest.toURL(request);
          const threadId = url?.searchParams.get(BROWSER_FRAME_WS_THREAD_ID_PARAM)?.trim();
          if (!threadId) return HttpServerResponse.text("Missing threadId", { status: 400 });
          const principal = yield* options.authorizeUpgrade(request);
          if (!principal || !manager.isPrincipalAuthorized(threadId as ThreadId, principal)) {
            return HttpServerResponse.text("Forbidden", { status: 403 });
          }
          const socket = yield* request.upgrade;
          const writer = yield* socket.writer;
          let open = true;
          const subscriptionId = manager.frames.subscribe(
            threadId as ThreadId,
            principal,
            makeBinaryFrameSink({
              send: (bytes) => Effect.runPromise(writer(bytes)).catch(() => undefined),
              isOpen: () => open,
            }),
          );
          yield* Effect.logInfo("browser-frame-subscribed", {
            threadId,
            ownerKind: principal.ownerKind,
            ownerId: principal.ownerId,
          });
          yield* Effect.addFinalizer(() =>
            Effect.sync(() => {
              open = false;
              manager.frames.unsubscribe(subscriptionId);
            }).pipe(
              Effect.andThen(
                Effect.logInfo("browser-frame-unsubscribed", {
                  threadId,
                  ownerKind: principal.ownerKind,
                  ownerId: principal.ownerId,
                }),
              ),
            ),
          );
          yield* socket.run(() => undefined);
          return HttpServerResponse.empty();
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.as(
              Effect.logDebug("browser frame socket closed", { cause: String(cause) }),
              HttpServerResponse.empty(),
            ),
          ),
        ),
      );
    }),
  );
}
