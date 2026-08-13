import type {
  PullRequestActionInput,
  PullRequestActionResult,
  PullRequestCommentInput,
  PullRequestDetail,
  PullRequestDetailInput,
  PullRequestDiffResult,
  PullRequestInboxInput,
  PullRequestInboxMarkNotifiedInput,
  PullRequestInboxMarkViewedInput,
  PullRequestInboxResult,
  PullRequestReviewRequestCountInput,
  PullRequestReviewRequestCountResult,
  PullRequestSetPinnedInput,
  PullRequestSetPinnedResult,
  PullRequestsListInput,
  PullRequestsListResult,
} from "@luminor/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface PullRequestServiceShape {
  readonly list: (input: PullRequestsListInput) => Effect.Effect<PullRequestsListResult, unknown>;
  readonly reviewRequestCount: (
    input: PullRequestReviewRequestCountInput,
  ) => Effect.Effect<PullRequestReviewRequestCountResult, unknown>;
  readonly inbox: (input: PullRequestInboxInput) => Effect.Effect<PullRequestInboxResult, unknown>;
  readonly markInboxViewed: (
    input: PullRequestInboxMarkViewedInput,
  ) => Effect.Effect<void, unknown>;
  readonly markInboxNotified: (
    input: PullRequestInboxMarkNotifiedInput,
  ) => Effect.Effect<void, unknown>;
  readonly detail: (input: PullRequestDetailInput) => Effect.Effect<PullRequestDetail, unknown>;
  readonly diff: (input: PullRequestDetailInput) => Effect.Effect<PullRequestDiffResult, unknown>;
  readonly action: (
    input: PullRequestActionInput,
  ) => Effect.Effect<PullRequestActionResult, unknown>;
  readonly comment: (
    input: PullRequestCommentInput,
  ) => Effect.Effect<PullRequestActionResult, unknown>;
  readonly setPinned: (
    input: PullRequestSetPinnedInput,
  ) => Effect.Effect<PullRequestSetPinnedResult, unknown>;
}

export class PullRequestService extends ServiceMap.Service<
  PullRequestService,
  PullRequestServiceShape
>()("luminor/pullRequests/Services/PullRequestService/PullRequestService") {}
