export type MeetingsAudioMixSource = {
  readonly id: "system" | "mic";
  readonly stream: MediaStream;
};

export type MeetingsMixedAudio = {
  readonly stream: MediaStream;
  stop(): void;
};

type MixerAudioContext = {
  createMediaStreamSource(stream: MediaStream): {
    connect(target: unknown): void;
    disconnect(): void;
  };
  createMediaStreamDestination(): { stream: MediaStream };
  createGain(): { gain: { value: number }; connect(target: unknown): void; disconnect(): void };
  close(): Promise<void> | void;
};

export function createMeetingsMixedAudioStream(
  sources: readonly MeetingsAudioMixSource[],
  audioContextCtor?: new (opts?: { sampleRate?: number }) => MixerAudioContext,
): MeetingsMixedAudio {
  if (sources.length === 0) {
    throw new Error("createMeetingsMixedAudioStream: no sources");
  }
  const Ctor =
    audioContextCtor ??
    (typeof AudioContext === "undefined"
      ? undefined
      : (AudioContext as unknown as new (opts?: { sampleRate?: number }) => MixerAudioContext));
  if (!Ctor) {
    throw new Error("AudioContext unavailable");
  }
  const ctx = new Ctor({ sampleRate: 48_000 });
  const destination = ctx.createMediaStreamDestination();
  const nodes: Array<{ disconnect(): void }> = [];
  for (const source of sources) {
    const sourceNode = ctx.createMediaStreamSource(source.stream);
    const gainNode = ctx.createGain();
    gainNode.gain.value = 1;
    sourceNode.connect(gainNode);
    gainNode.connect(destination);
    nodes.push(sourceNode, gainNode);
  }
  let stopped = false;
  return {
    stream: destination.stream,
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          void 0;
        }
      }
      try {
        void ctx.close();
      } catch {
        void 0;
      }
    },
  };
}
