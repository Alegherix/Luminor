import { IsoDateTime, PositiveInt, TrimmedNonEmptyString } from "@luminor/contracts";
import { Schema, ServiceMap } from "effect";
import type { Effect } from "effect";

import type { PersistenceDecodeError, PersistenceSqlError } from "../Errors.ts";

export type PullRequestInboxStateError = PersistenceSqlError | PersistenceDecodeError;

export const PullRequestInboxStateRow = Schema.Struct({
  repositoryKey: TrimmedNonEmptyString,
  number: PositiveInt,
  lastViewedAt: Schema.NullOr(IsoDateTime),
  lastNotifiedCommentId: Schema.NullOr(TrimmedNonEmptyString),
});
export type PullRequestInboxStateRow = typeof PullRequestInboxStateRow.Type;

export const PullRequestInboxStateIdentity = Schema.Struct({
  repositoryKey: TrimmedNonEmptyString,
  number: PositiveInt,
});
export type PullRequestInboxStateIdentity = typeof PullRequestInboxStateIdentity.Type;

export const MarkPullRequestInboxViewedInput = Schema.Struct({
  repositoryKey: TrimmedNonEmptyString,
  number: PositiveInt,
  viewedAt: IsoDateTime,
});
export type MarkPullRequestInboxViewedInput = typeof MarkPullRequestInboxViewedInput.Type;

export const MarkPullRequestInboxNotifiedInput = Schema.Struct({
  repositoryKey: TrimmedNonEmptyString,
  number: PositiveInt,
  commentId: TrimmedNonEmptyString,
});
export type MarkPullRequestInboxNotifiedInput = typeof MarkPullRequestInboxNotifiedInput.Type;

export interface PullRequestInboxStateShape {
  readonly initializedAt: () => Effect.Effect<string | null, PullRequestInboxStateError>;
  readonly markInitialized: (
    initializedAt: string,
  ) => Effect.Effect<void, PullRequestInboxStateError>;
  readonly list: () => Effect.Effect<
    ReadonlyArray<PullRequestInboxStateRow>,
    PullRequestInboxStateError
  >;
  readonly markViewed: (
    input: MarkPullRequestInboxViewedInput,
  ) => Effect.Effect<void, PullRequestInboxStateError>;
  readonly markNotified: (
    input: MarkPullRequestInboxNotifiedInput,
  ) => Effect.Effect<void, PullRequestInboxStateError>;
}

export class PullRequestInboxState extends ServiceMap.Service<
  PullRequestInboxState,
  PullRequestInboxStateShape
>()("luminor/persistence/Services/PullRequestInboxState/PullRequestInboxState") {}
