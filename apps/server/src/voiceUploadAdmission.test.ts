// FILE: voiceUploadAdmission.test.ts
// Purpose: Verifies bounded, leak-free admission for buffered voice uploads.

import { describe, expect, it } from "vitest";

import { VoiceUploadAdmissionGate } from "./voiceUploadAdmission";

describe("VoiceUploadAdmissionGate", () => {
  it("rejects excess uploads until an active lease is released", () => {
    const gate = new VoiceUploadAdmissionGate(2);
    const releaseFirst = gate.tryAcquire();
    const releaseSecond = gate.tryAcquire();

    expect(releaseFirst).toBeTypeOf("function");
    expect(releaseSecond).toBeTypeOf("function");
    expect(gate.tryAcquire()).toBeNull();

    releaseFirst?.();
    expect(gate.tryAcquire()).toBeTypeOf("function");
  });

  it("makes lease release idempotent", () => {
    const gate = new VoiceUploadAdmissionGate(1);
    const release = gate.tryAcquire();

    release?.();
    release?.();

    expect(gate.tryAcquire()).toBeTypeOf("function");
    expect(gate.tryAcquire()).toBeNull();
  });
});
