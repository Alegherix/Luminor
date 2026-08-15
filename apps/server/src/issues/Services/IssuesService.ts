import type {
  IssuesListInput,
  IssuesListResult,
  IssuesViewInput,
  IssuesViewResult,
} from "@luminor/contracts";
import { ServiceMap } from "effect";
import type { Effect } from "effect";

export interface IssuesServiceShape {
  readonly list: (input: IssuesListInput) => Effect.Effect<IssuesListResult, unknown>;
  readonly view: (input: IssuesViewInput) => Effect.Effect<IssuesViewResult, unknown>;
}

export class IssuesService extends ServiceMap.Service<IssuesService, IssuesServiceShape>()(
  "luminor/issues/Services/IssuesService/IssuesService",
) {}
