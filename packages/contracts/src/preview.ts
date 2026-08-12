import { Schema } from "effect";
import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas";

// Reserved terminal id for the preview process of a thread. The preview process
// is a managed terminal, so it occupies one fixed terminal slot per thread and
// can be attached to by a regular terminal pane for its logs.
export const PREVIEW_TERMINAL_ID = "preview";

export const ThreadPreviewStatus = Schema.Literals(["idle", "starting", "running", "failed"]);
export type ThreadPreviewStatus = typeof ThreadPreviewStatus.Type;

export const ThreadPreviewState = Schema.Struct({
  threadId: TrimmedNonEmptyString,
  status: ThreadPreviewStatus,
  terminalId: TrimmedNonEmptyString,
  url: Schema.NullOr(TrimmedNonEmptyString),
  port: Schema.NullOr(PositiveInt),
  message: Schema.NullOr(TrimmedNonEmptyString),
  scriptId: Schema.NullOr(TrimmedNonEmptyString),
  command: Schema.NullOr(TrimmedNonEmptyString),
  cwd: Schema.NullOr(TrimmedNonEmptyString),
  startedAt: Schema.NullOr(TrimmedNonEmptyString),
});
export type ThreadPreviewState = typeof ThreadPreviewState.Type;

export const ThreadPreviewStartInput = Schema.Struct({
  threadId: TrimmedNonEmptyString,
});
export type ThreadPreviewStartInput = typeof ThreadPreviewStartInput.Type;

export const ThreadPreviewStartResult = Schema.Struct({
  preview: ThreadPreviewState,
});
export type ThreadPreviewStartResult = typeof ThreadPreviewStartResult.Type;

export const ThreadPreviewStopInput = Schema.Struct({
  threadId: TrimmedNonEmptyString,
});
export type ThreadPreviewStopInput = typeof ThreadPreviewStopInput.Type;

export const ThreadPreviewStopResult = Schema.Struct({
  stopped: Schema.Boolean,
});
export type ThreadPreviewStopResult = typeof ThreadPreviewStopResult.Type;

export const ThreadPreviewSetUrlInput = Schema.Struct({
  threadId: TrimmedNonEmptyString,
  url: TrimmedNonEmptyString,
});
export type ThreadPreviewSetUrlInput = typeof ThreadPreviewSetUrlInput.Type;

export const ThreadPreviewSetUrlResult = Schema.Struct({
  preview: ThreadPreviewState,
});
export type ThreadPreviewSetUrlResult = typeof ThreadPreviewSetUrlResult.Type;

export const ThreadPreviewListResult = Schema.Struct({
  previews: Schema.Array(ThreadPreviewState),
});
export type ThreadPreviewListResult = typeof ThreadPreviewListResult.Type;

export const ThreadPreviewEvent = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("snapshot"),
    previews: Schema.Array(ThreadPreviewState),
  }),
  Schema.Struct({
    type: Schema.Literal("status"),
    preview: ThreadPreviewState,
  }),
]);
export type ThreadPreviewEvent = typeof ThreadPreviewEvent.Type;
