import * as FS from "node:fs";
import * as OS from "node:os";
import * as Path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  bundledTranscriptionArgs,
  createMeetingsTranscriptionManager,
  DEFAULT_TRANSCRIBE_ARGS,
  defaultMissiondeckTranscribeCommand,
  defaultMissiondeckTranscribePython,
  defaultMissiondeckTranscribeVenv,
  expandTranscriptionArgs,
  isBrokenTranscriptionCommandError,
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
  transcriptionFailureMessage,
  meetingTranscriptionConfigPath,
  meetingsSummaryPath,
  meetingsTranscriptDir,
  meetingsTranscriptTextPath,
} from "./meetingsTranscription";

const tempDirs = new Set<string>();

function makeTempDir(prefix: string): string {
  const directory = FS.mkdtempSync(Path.join(OS.tmpdir(), prefix));
  tempDirs.add(directory);
  return directory;
}

function makeExecutable(path: string): void {
  FS.mkdirSync(Path.dirname(path), { recursive: true });
  FS.writeFileSync(path, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
}

afterEach(() => {
  for (const directory of tempDirs) {
    FS.rmSync(directory, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe("transcriptionFailureMessage", () => {
  it("keeps the last error line from a verbose CUDA run", () => {
    expect(
      transcriptionFailureMessage(
        [
          "loading model: KBLab/kb-whisper-large (device=cuda, compute_type=float16)",
          "input path: /tmp/tape.webm",
          "error: Library libcublas.so.12 is not found or cannot be loaded",
        ].join("\n"),
      ),
    ).toBe("Library libcublas.so.12 is not found or cannot be loaded");
  });
});

describe("meetings transcription paths", () => {
  it("keeps config and transcripts under the Luminor home meetings tree", () => {
    expect(meetingTranscriptionConfigPath("/home/me/.luminor")).toBe(
      Path.join("/home/me/.luminor", "config", "meeting-transcription.json"),
    );
    expect(meetingsTranscriptDir("/home/me/.luminor", "pasted:abc-defg-hij")).toBe(
      Path.join("/home/me/.luminor", "meetings", "pasted_abc-defg-hij", "transcripts"),
    );
    expect(meetingsSummaryPath("/home/me/.luminor", "pasted:abc-defg-hij")).toBe(
      Path.join(
        "/home/me/.luminor",
        "meetings",
        "pasted_abc-defg-hij",
        "transcripts",
        "summary.md",
      ),
    );
    expect(
      expandTranscriptionArgs(DEFAULT_TRANSCRIBE_ARGS, {
        recordingPath: "/rec.webm",
        outputPath: "/out.json",
      }),
    ).toEqual(["--input", "/rec.webm", "--output", "/out.json"]);
  });
});

describe("createMeetingsTranscriptionManager", () => {
  it("seeds Luminor config from missiondeck-transcribe and venv when they exist", async () => {
    const homeDir = makeTempDir("luminor-transcribe-home-");
    const userHome = makeTempDir("luminor-transcribe-user-");
    const command = defaultMissiondeckTranscribeCommand(userHome);
    const venv = defaultMissiondeckTranscribeVenv(userHome);
    makeExecutable(command);
    FS.mkdirSync(venv, { recursive: true });

    const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
    const manager = createMeetingsTranscriptionManager({
      homeDir,
      homedir: () => userHome,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      spawn: async (spawnedCommand, args) => {
        spawnCalls.push({ command: spawnedCommand, args });
        const outputIndex = args.indexOf("--output");
        const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
        if (outputPath) {
          FS.mkdirSync(Path.dirname(outputPath), { recursive: true });
          FS.writeFileSync(
            outputPath,
            JSON.stringify([{ startMs: 0, endMs: 1200, text: "Hello from the meeting." }]),
          );
        }
        return { ok: true };
      },
    });

    const recordingPath = Path.join(
      homeDir,
      "meetings",
      "pasted_abc-defg-hij",
      "recordings",
      "tape.webm",
    );
    const result = await manager.transcribe({
      sessionId: "pasted:abc-defg-hij",
      recordingPath,
    });

    expect(result.status).toBe("ready");
    expect(result.text).toBe("Hello from the meeting.");
    expect(result.transcriptPath).toBe(meetingsTranscriptTextPath(homeDir, "pasted:abc-defg-hij"));
    expect(result.transcriptPath?.startsWith(Path.join(homeDir, "meetings"))).toBe(true);
    expect(result.transcriptPath).not.toMatch(/missiondeck|userData/i);
    expect(FS.readFileSync(meetingTranscriptionConfigPath(homeDir), "utf8")).toContain(command);
    expect(FS.readFileSync(meetingTranscriptionConfigPath(homeDir), "utf8")).toContain(venv);
    expect(spawnCalls).toEqual([
      {
        command,
        args: [
          "--input",
          recordingPath,
          "--output",
          Path.join(homeDir, "meetings", "pasted_abc-defg-hij", "transcripts", "transcript.json"),
        ],
      },
    ]);
    expect(FS.readFileSync(result.transcriptPath ?? "", "utf8").trim()).toBe(
      "Hello from the meeting.",
    );
  });

  it("asks the user to point at the environment when the seed targets are missing", async () => {
    const homeDir = makeTempDir("luminor-transcribe-missing-");
    const userHome = makeTempDir("luminor-transcribe-empty-");
    const manager = createMeetingsTranscriptionManager({
      homeDir,
      homedir: () => userHome,
      spawn: async () => {
        throw new Error("should not spawn");
      },
    });

    const result = await manager.transcribe({
      sessionId: "ended",
      recordingPath: "/tmp/missing.webm",
    });

    expect(result).toEqual({
      status: "needs-environment",
      sessionId: "ended",
      transcriptPath: null,
      text: null,
      error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
    });
    expect(FS.existsSync(meetingTranscriptionConfigPath(homeDir))).toBe(false);
  });

  it("seeds the bundled Luminor script through the transcription venv and replaces a stale wrapper", async () => {
    const homeDir = makeTempDir("luminor-transcribe-bundled-");
    const userHome = makeTempDir("luminor-transcribe-user-");
    const wrapper = defaultMissiondeckTranscribeCommand(userHome);
    const venvPython = defaultMissiondeckTranscribePython(userHome);
    const bundledScript = Path.join(homeDir, "transcribe-meeting-recording.py");
    makeExecutable(wrapper);
    makeExecutable(venvPython);
    FS.writeFileSync(bundledScript, "# luminor transcribe\n");
    FS.mkdirSync(Path.dirname(meetingTranscriptionConfigPath(homeDir)), { recursive: true });
    FS.writeFileSync(
      meetingTranscriptionConfigPath(homeDir),
      `${JSON.stringify({
        enabled: true,
        command: wrapper,
        args: [...DEFAULT_TRANSCRIBE_ARGS],
        updatedAt: "2026-08-12T00:00:00.000Z",
      })}\n`,
    );

    const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
    const manager = createMeetingsTranscriptionManager({
      homeDir,
      homedir: () => userHome,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      bundledScriptPath: bundledScript,
      spawn: async (command, args) => {
        spawnCalls.push({ command, args });
        const outputIndex = args.indexOf("--output");
        const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
        if (outputPath) {
          FS.mkdirSync(Path.dirname(outputPath), { recursive: true });
          FS.writeFileSync(outputPath, "Bundled script output.");
        }
        return { ok: true };
      },
    });

    const result = await manager.transcribe({
      sessionId: "ended",
      recordingPath: "/tmp/tape.webm",
    });

    expect(result.status).toBe("ready");
    expect(result.text).toBe("Bundled script output.");
    expect(spawnCalls).toEqual([
      {
        command: venvPython,
        args: expandTranscriptionArgs(bundledTranscriptionArgs(bundledScript), {
          recordingPath: "/tmp/tape.webm",
          outputPath: Path.join(homeDir, "meetings", "ended", "transcripts", "transcript.json"),
        }),
      },
    ]);
    expect(
      JSON.parse(FS.readFileSync(meetingTranscriptionConfigPath(homeDir), "utf8")),
    ).toMatchObject({
      command: venvPython,
      args: bundledTranscriptionArgs(bundledScript),
    });
  });

  it("asks the user to point at the environment when the seeded wrapper script is missing", async () => {
    const homeDir = makeTempDir("luminor-transcribe-broken-wrapper-");
    const userHome = makeTempDir("luminor-transcribe-user-");
    makeExecutable(defaultMissiondeckTranscribeCommand(userHome));
    const manager = createMeetingsTranscriptionManager({
      homeDir,
      homedir: () => userHome,
      spawn: async () => ({
        ok: false,
        error:
          "/home/me/.local/share/missiondeck/transcription-venv/bin/python: can't open file '/home/me/OneTUI/scripts/local/transcribe-onetui-recording.py': [Errno 2] No such file or directory",
      }),
    });

    await expect(
      manager.transcribe({
        sessionId: "ended",
        recordingPath: "/tmp/tape.webm",
      }),
    ).resolves.toEqual({
      status: "needs-environment",
      sessionId: "ended",
      transcriptPath: null,
      text: null,
      error: MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
    });
    expect(
      isBrokenTranscriptionCommandError(
        "python: can't open file '/tmp/transcribe-onetui-recording.py': [Errno 2] No such file or directory",
      ),
    ).toBe(true);
  });

  it("writes a pointed-at command into Luminor config and can then transcribe", async () => {
    const homeDir = makeTempDir("luminor-transcribe-point-");
    const userHome = makeTempDir("luminor-transcribe-user-");
    const picked = Path.join(userHome, "bin", "missiondeck-transcribe");
    makeExecutable(picked);

    const manager = createMeetingsTranscriptionManager({
      homeDir,
      homedir: () => userHome,
      now: () => new Date("2026-08-12T12:00:00.000Z"),
      pickEnvironmentPath: async () => picked,
      spawn: async (_command, args) => {
        const outputIndex = args.indexOf("--output");
        const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;
        if (outputPath) {
          FS.mkdirSync(Path.dirname(outputPath), { recursive: true });
          FS.writeFileSync(outputPath, "Spoken in the room.");
        }
        return { ok: true };
      },
    });

    await expect(manager.pointAtEnvironment()).resolves.toEqual({
      status: "configured",
      error: null,
    });
    const result = await manager.transcribe({
      sessionId: "ended",
      recordingPath: "/tmp/tape.webm",
    });
    expect(result.status).toBe("ready");
    expect(result.text).toBe("Spoken in the room.");
    expect(
      JSON.parse(FS.readFileSync(meetingTranscriptionConfigPath(homeDir), "utf8")).command,
    ).toBe(picked);
  });

  it("reads a previously written transcript for an ended meeting", async () => {
    const homeDir = makeTempDir("luminor-transcribe-read-");
    const textPath = meetingsTranscriptTextPath(homeDir, "ended");
    FS.mkdirSync(Path.dirname(textPath), { recursive: true });
    FS.writeFileSync(textPath, "Yesterday's notes.\n");

    const manager = createMeetingsTranscriptionManager({
      homeDir,
      spawn: async () => {
        throw new Error("should not spawn");
      },
    });

    await expect(manager.getTranscript("ended")).resolves.toEqual({
      status: "ready",
      sessionId: "ended",
      transcriptPath: textPath,
      text: "Yesterday's notes.",
      error: null,
    });
  });

  it("writes and reads summary.md beside the transcript", async () => {
    const homeDir = makeTempDir("luminor-summary-");
    const manager = createMeetingsTranscriptionManager({
      homeDir,
      spawn: async () => {
        throw new Error("should not spawn");
      },
    });

    const written = await manager.writeSummary({
      sessionId: "ended",
      text: "Decision: ship the join path.",
    });

    expect(written.summaryPath).toBe(meetingsSummaryPath(homeDir, "ended"));
    expect(written.summaryPath.startsWith(Path.join(homeDir, "meetings"))).toBe(true);
    expect(FS.readFileSync(written.summaryPath, "utf8").trim()).toBe(
      "Decision: ship the join path.",
    );
    await expect(manager.readSummary("ended")).resolves.toEqual({
      text: "Decision: ship the join path.",
      summaryPath: written.summaryPath,
    });
  });
});
