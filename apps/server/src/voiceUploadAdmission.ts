// FILE: voiceUploadAdmission.ts
// Purpose: Bounds voice uploads before request bodies are buffered in server memory.
// Layer: Server transport utility
// Exports: VoiceUploadAdmissionGate, voiceUploadAdmissionGate

const MAX_CONCURRENT_VOICE_UPLOADS = 2;

export class VoiceUploadAdmissionGate {
  private active = 0;

  constructor(private readonly maxConcurrent: number) {
    if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("Voice upload concurrency must be a positive integer.");
    }
  }

  tryAcquire(): (() => void) | null {
    if (this.active >= this.maxConcurrent) {
      return null;
    }
    this.active += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.active -= 1;
    };
  }
}

export const voiceUploadAdmissionGate = new VoiceUploadAdmissionGate(
  MAX_CONCURRENT_VOICE_UPLOADS,
);
