import { afterEach, describe, expect, it, vi } from "vitest";

import { createDebouncedAutosave } from "./useDebouncedAutosave";

afterEach(() => {
  vi.useRealTimers();
});

describe("createDebouncedAutosave", () => {
  it("debounces edits and saves only the latest value", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const autosave = createDebouncedAutosave({ initialValue: "", save, debounceMs: 500 });

    autosave.schedule("first");
    autosave.schedule("latest");
    expect(autosave.getStatus()).toBe("saving");
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("latest");
    expect(autosave.getStatus()).toBe("saved");
  });

  it("serializes an edit queued while a write is in flight", async () => {
    vi.useFakeTimers();
    let finishFirst: (() => void) | undefined;
    const save = vi.fn((value: string) =>
      value === "first"
        ? new Promise<void>((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve(),
    );
    const autosave = createDebouncedAutosave({ initialValue: "", save, debounceMs: 500 });

    autosave.schedule("first");
    await vi.advanceTimersByTimeAsync(500);
    autosave.schedule("second");
    expect(save).toHaveBeenCalledTimes(1);

    finishFirst?.();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenNthCalledWith(2, "second");
  });

  it("keeps a failed value pending and retries it after another schedule", async () => {
    vi.useFakeTimers();
    const statuses: string[] = [];
    const save = vi
      .fn<(value: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce();
    const autosave = createDebouncedAutosave({
      initialValue: "",
      save,
      debounceMs: 500,
      onStatusChange: (status) => statuses.push(status),
    });

    autosave.schedule("draft");
    await vi.advanceTimersByTimeAsync(500);
    expect(autosave.getStatus()).toBe("error");

    autosave.schedule("draft");
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.getStatus()).toBe("saved");
    expect(statuses).toEqual(["saving", "error", "saving", "saved"]);
  });

  it("flushes the latest value when disposed before the debounce expires", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const autosave = createDebouncedAutosave({ initialValue: "", save, debounceMs: 500 });

    autosave.schedule("last keystroke");
    await autosave.dispose();

    expect(save).toHaveBeenCalledWith("last keystroke");
  });
});
