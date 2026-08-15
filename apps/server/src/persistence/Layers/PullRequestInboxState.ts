import { Effect, Layer, Option, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import { toPersistenceSqlOrDecodeError } from "../Errors.ts";
import {
  MarkPullRequestInboxNotifiedInput,
  MarkPullRequestInboxViewedInput,
  PullRequestInboxState,
  PullRequestInboxStateRow,
  type PullRequestInboxStateShape,
} from "../Services/PullRequestInboxState.ts";

const InboxMetaRow = Schema.Struct({
  initializedAt: Schema.String,
});

const makePullRequestInboxState = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const readMeta = SqlSchema.findOneOption({
    Request: Schema.Void,
    Result: InboxMetaRow,
    execute: () => sql`
      SELECT initialized_at AS "initializedAt"
      FROM pull_request_inbox_meta
      WHERE id = 1
    `,
  });

  const writeMeta = SqlSchema.void({
    Request: InboxMetaRow,
    execute: ({ initializedAt }) => sql`
      INSERT INTO pull_request_inbox_meta (id, initialized_at)
      VALUES (1, ${initializedAt})
      ON CONFLICT (id) DO NOTHING
    `,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.Void,
    Result: PullRequestInboxStateRow,
    execute: () => sql`
      SELECT
        repository_key AS "repositoryKey",
        pull_request_number AS "number",
        last_viewed_at AS "lastViewedAt",
        last_notified_comment_id AS "lastNotifiedCommentId"
      FROM pull_request_inbox_state
      ORDER BY repository_key ASC, pull_request_number ASC
    `,
  });

  const upsertViewed = SqlSchema.void({
    Request: MarkPullRequestInboxViewedInput,
    execute: ({ repositoryKey, number, viewedAt }) => sql`
      INSERT INTO pull_request_inbox_state (
        repository_key,
        pull_request_number,
        last_viewed_at,
        last_notified_comment_id
      )
      VALUES (${repositoryKey}, ${number}, ${viewedAt}, NULL)
      ON CONFLICT (repository_key, pull_request_number) DO UPDATE SET
        last_viewed_at = excluded.last_viewed_at
    `,
  });

  const upsertNotified = SqlSchema.void({
    Request: MarkPullRequestInboxNotifiedInput,
    execute: ({ repositoryKey, number, commentId }) => sql`
      INSERT INTO pull_request_inbox_state (
        repository_key,
        pull_request_number,
        last_viewed_at,
        last_notified_comment_id
      )
      VALUES (${repositoryKey}, ${number}, NULL, ${commentId})
      ON CONFLICT (repository_key, pull_request_number) DO UPDATE SET
        last_notified_comment_id = excluded.last_notified_comment_id
    `,
  });

  const initializedAt: PullRequestInboxStateShape["initializedAt"] = () =>
    readMeta(undefined).pipe(
      Effect.map((row) => Option.getOrNull(row)?.initializedAt ?? null),
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "PullRequestInboxState.initializedAt:query",
          "PullRequestInboxState.initializedAt:decode",
        ),
      ),
    );

  const markInitialized: PullRequestInboxStateShape["markInitialized"] = (initializedAtValue) =>
    writeMeta({ initializedAt: initializedAtValue }).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "PullRequestInboxState.markInitialized:query",
          "PullRequestInboxState.markInitialized:encode",
        ),
      ),
    );

  const list: PullRequestInboxStateShape["list"] = () =>
    listRows(undefined).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "PullRequestInboxState.list:query",
          "PullRequestInboxState.list:decode",
        ),
      ),
    );

  const markViewed: PullRequestInboxStateShape["markViewed"] = (input) =>
    upsertViewed(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "PullRequestInboxState.markViewed:query",
          "PullRequestInboxState.markViewed:encode",
        ),
      ),
    );

  const markNotified: PullRequestInboxStateShape["markNotified"] = (input) =>
    upsertNotified(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "PullRequestInboxState.markNotified:query",
          "PullRequestInboxState.markNotified:encode",
        ),
      ),
    );

  return {
    initializedAt,
    markInitialized,
    list,
    markViewed,
    markNotified,
  } satisfies PullRequestInboxStateShape;
});

export const PullRequestInboxStateLive = Layer.effect(
  PullRequestInboxState,
  makePullRequestInboxState,
);
