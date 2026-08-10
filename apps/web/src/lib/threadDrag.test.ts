// FILE: threadDrag.test.ts
// Purpose: Cover thread drag payload serialization, including the multi-selection form.
// Layer: Web client helper test
// Targets: writeThreadDragPayload, readThreadDragPayload, hasThreadDrag, threadDragPayloadThreadIds.

import { ThreadId } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import {
  THREAD_DRAG_MIME,
  hasThreadDrag,
  readThreadDragPayload,
  threadDragPayloadThreadIds,
  writeThreadDragPayload,
} from "./threadDrag";

const THREAD_1 = ThreadId.makeUnsafe("thread-1");
const THREAD_2 = ThreadId.makeUnsafe("thread-2");

function fakeDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    effectAllowed: "none",
    dropEffect: "none",
    get types() {
      return [...data.keys()];
    },
    setData: (format: string, value: string) => data.set(format, value),
    getData: (format: string) => data.get(format) ?? "",
  } as unknown as DataTransfer;
}

describe("thread drag payload", () => {
  it("round-trips a single-row drag", () => {
    const dataTransfer = fakeDataTransfer();
    writeThreadDragPayload(dataTransfer, { threadId: THREAD_1 });

    expect(hasThreadDrag(dataTransfer.types)).toBe(true);
    expect(dataTransfer.effectAllowed).toBe("move");
    const payload = readThreadDragPayload(dataTransfer);
    expect(payload).toEqual({ threadId: THREAD_1 });
    expect(threadDragPayloadThreadIds(payload!)).toEqual([THREAD_1]);
  });

  it("round-trips a multi-selection drag", () => {
    const dataTransfer = fakeDataTransfer();
    writeThreadDragPayload(dataTransfer, {
      threadId: THREAD_1,
      threadIds: [THREAD_1, THREAD_2],
    });

    const payload = readThreadDragPayload(dataTransfer);
    expect(threadDragPayloadThreadIds(payload!)).toEqual([THREAD_1, THREAD_2]);
  });

  it("ignores drags without the thread MIME or with unusable data", () => {
    const empty = fakeDataTransfer();
    expect(hasThreadDrag(empty.types)).toBe(false);
    expect(readThreadDragPayload(empty)).toBeNull();

    const malformed = fakeDataTransfer();
    malformed.setData(THREAD_DRAG_MIME, "{not json");
    expect(readThreadDragPayload(malformed)).toBeNull();
  });
});
