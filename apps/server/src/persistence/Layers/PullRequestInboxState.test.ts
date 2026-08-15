import { assert, it } from "@effect/vitest";
import { Effect, Layer } from "effect";

import { PullRequestInboxState } from "../Services/PullRequestInboxState.ts";
import { PullRequestInboxStateLive } from "./PullRequestInboxState.ts";
import { SqlitePersistenceMemory } from "./Sqlite.ts";

const layer = it.layer(PullRequestInboxStateLive.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

layer("PullRequestInboxState", (it) => {
  it.effect("baselines first-run initialization and preserves viewed versus notified fields", () =>
    Effect.gen(function* () {
      const inbox = yield* PullRequestInboxState;

      assert.strictEqual(yield* inbox.initializedAt(), null);
      yield* inbox.markInitialized("2026-08-13T12:00:00.000Z");
      yield* inbox.markInitialized("2026-08-13T13:00:00.000Z");
      assert.strictEqual(yield* inbox.initializedAt(), "2026-08-13T12:00:00.000Z");

      yield* inbox.markNotified({
        repositoryKey: "acme/luminor",
        number: 42,
        commentId: "comment-1",
      });
      yield* inbox.markViewed({
        repositoryKey: "acme/luminor",
        number: 42,
        viewedAt: "2026-08-13T12:05:00.000Z",
      });
      yield* inbox.markNotified({
        repositoryKey: "acme/luminor",
        number: 42,
        commentId: "comment-2",
      });

      assert.deepStrictEqual(yield* inbox.list(), [
        {
          repositoryKey: "acme/luminor",
          number: 42,
          lastViewedAt: "2026-08-13T12:05:00.000Z",
          lastNotifiedCommentId: "comment-2",
        },
      ]);
    }),
  );
});
