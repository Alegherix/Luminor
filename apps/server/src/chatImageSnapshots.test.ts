import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";

import {
  chatImageSnapshotFileName,
  extractLocalImageSrcsFromMarkdown,
  resolveChatImageSnapshot,
  snapshotChatImageSources,
  snapshotChatImageSourcesWithRetry,
} from "./chatImageSnapshots.ts";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("extractLocalImageSrcsFromMarkdown", () => {
  it("extracts absolute and relative local image references", () => {
    const text = [
      "Report body.",
      "![Screenshot](/home/user/project/docs/ui-refs/01-overview.jpg)",
      "![Relative](images/2.png)",
    ].join("\n\n");

    assert.deepEqual(extractLocalImageSrcsFromMarkdown(text), [
      "/home/user/project/docs/ui-refs/01-overview.jpg",
      "images/2.png",
    ]);
  });

  it("unwraps angle-bracket targets and decodes percent escapes", () => {
    const text = "![Generated image](</home/user/My%20Files/shot%251.png>)";
    assert.deepEqual(extractLocalImageSrcsFromMarkdown(text), ["/home/user/My Files/shot%1.png"]);
  });

  it("ignores remote urls, non-images, and duplicates", () => {
    const text = [
      "![Remote](https://example.com/image.png)",
      "![Doc](/home/user/report.pdf)",
      "![Same](/home/user/a.png)",
      "![Same again](/home/user/a.png)",
    ].join("\n");

    assert.deepEqual(extractLocalImageSrcsFromMarkdown(text), ["/home/user/a.png"]);
  });

  it("strips markdown titles from image targets", () => {
    const text = '![Shot](/home/user/a.png "the title")';
    assert.deepEqual(extractLocalImageSrcsFromMarkdown(text), ["/home/user/a.png"]);
  });
});

describe("chatImageSnapshotFileName", () => {
  it("is deterministic and cwd-independent for absolute paths", () => {
    const absolute = chatImageSnapshotFileName({ src: "/home/user/a.png", cwd: "/workspace" });
    assert.equal(
      absolute,
      chatImageSnapshotFileName({ src: "/home/user/a.png", cwd: "/elsewhere" }),
    );
    assert.match(absolute ?? "", /^[0-9a-f]{64}\.png$/);
  });

  it("keys relative paths against the cwd", () => {
    const fromWorkspace = chatImageSnapshotFileName({ src: "images/1.jpg", cwd: "/workspace" });
    const fromOther = chatImageSnapshotFileName({ src: "images/1.jpg", cwd: "/other" });
    assert.notEqual(fromWorkspace, fromOther);
    assert.equal(
      fromWorkspace,
      chatImageSnapshotFileName({ src: "images/1.jpg", cwd: "/workspace" }),
    );
  });

  it("rejects unsupported and remote references", () => {
    assert.equal(chatImageSnapshotFileName({ src: "/home/user/a.pdf", cwd: null }), null);
    assert.equal(chatImageSnapshotFileName({ src: "https://x.test/a.png", cwd: null }), null);
  });
});

describe("snapshotChatImageSources", () => {
  it("captures an absolute reference and serves it back by (src, cwd) key", async () => {
    const luminorHome = makeTempDir("luminor-snapshot-home-");
    const sourceDir = makeTempDir("luminor-snapshot-source-");
    const env = { LUMINOR_HOME: luminorHome } as NodeJS.ProcessEnv;
    const sourcePath = path.join(sourceDir, "screenshot.jpg");
    writeFileSync(sourcePath, Buffer.from("jpg-bytes"));

    const outcome = await snapshotChatImageSources({
      sources: [sourcePath],
      cwd: "/unrelated/workspace",
      env,
    });
    assert.deepEqual(outcome.copied, [sourcePath]);

    rmSync(sourcePath);
    const served = await resolveChatImageSnapshot({
      requestedPath: sourcePath,
      cwd: "/a/completely/different/cwd",
      env,
    });
    assert.equal(served?.fileName, "screenshot.jpg");
    assert.equal(served?.sizeBytes, "jpg-bytes".length);
  });

  it("resolves Grok session-relative references at capture time", async () => {
    const luminorHome = makeTempDir("luminor-snapshot-home-");
    const grokHome = makeTempDir("luminor-snapshot-grok-");
    const cwd = makeTempDir("luminor-snapshot-cwd-");
    const env = { LUMINOR_HOME: luminorHome } as NodeJS.ProcessEnv;
    const previousGrokHome = process.env.GROK_HOME;
    process.env.GROK_HOME = grokHome;
    try {
      const sessionImagesDir = path.join(
        grokHome,
        "sessions",
        encodeURIComponent(cwd),
        "session-1",
        "images",
      );
      mkdirSync(sessionImagesDir, { recursive: true });
      writeFileSync(path.join(sessionImagesDir, "1.jpg"), Buffer.from("grok-bytes"));

      const outcome = await snapshotChatImageSources({
        sources: ["images/1.jpg"],
        cwd,
        env,
      });
      assert.deepEqual(outcome.copied, ["images/1.jpg"]);

      const served = await resolveChatImageSnapshot({ requestedPath: "images/1.jpg", cwd, env });
      assert.equal(served?.fileName, "1.jpg");
      assert.equal(served?.sizeBytes, "grok-bytes".length);
    } finally {
      if (previousGrokHome === undefined) {
        delete process.env.GROK_HOME;
      } else {
        process.env.GROK_HOME = previousGrokHome;
      }
    }
  });

  it("keeps the first captured snapshot when the source later changes", async () => {
    const luminorHome = makeTempDir("luminor-snapshot-home-");
    const sourceDir = makeTempDir("luminor-snapshot-source-");
    const env = { LUMINOR_HOME: luminorHome } as NodeJS.ProcessEnv;
    const sourcePath = path.join(sourceDir, "pinned.png");
    writeFileSync(sourcePath, Buffer.from("original"));

    await snapshotChatImageSources({ sources: [sourcePath], cwd: null, env });
    writeFileSync(sourcePath, Buffer.from("mutated-afterwards"));
    const second = await snapshotChatImageSources({ sources: [sourcePath], cwd: null, env });

    assert.deepEqual(second.alreadySnapshotted, [sourcePath]);
    const served = await resolveChatImageSnapshot({ requestedPath: sourcePath, cwd: null, env });
    assert.equal(served?.sizeBytes, "original".length);
  });

  it("reports missing sources as unavailable", async () => {
    const luminorHome = makeTempDir("luminor-snapshot-home-");
    const env = { LUMINOR_HOME: luminorHome } as NodeJS.ProcessEnv;

    const outcome = await snapshotChatImageSources({
      sources: ["/nowhere/to/be/found.png"],
      cwd: null,
      env,
    });
    assert.deepEqual(outcome.unavailable, ["/nowhere/to/be/found.png"]);
  });
});

describe("snapshotChatImageSourcesWithRetry", () => {
  it("captures a source that appears after the first attempt", async () => {
    const luminorHome = makeTempDir("luminor-snapshot-home-");
    const sourceDir = makeTempDir("luminor-snapshot-source-");
    const env = { LUMINOR_HOME: luminorHome } as NodeJS.ProcessEnv;
    const sourcePath = path.join(sourceDir, "late.png");

    const timer = setTimeout(() => {
      writeFileSync(sourcePath, Buffer.from("late-bytes"));
    }, 30);
    try {
      const outcome = await snapshotChatImageSourcesWithRetry({
        sources: [sourcePath],
        cwd: null,
        env,
        retry: { attempts: 10, delayMs: 20 },
      });
      assert.deepEqual(outcome.copied, [sourcePath]);
      assert.deepEqual(outcome.unavailable, []);
    } finally {
      clearTimeout(timer);
    }
  });

  it("gives up after the configured attempts", async () => {
    const luminorHome = makeTempDir("luminor-snapshot-home-");
    const env = { LUMINOR_HOME: luminorHome } as NodeJS.ProcessEnv;

    const outcome = await snapshotChatImageSourcesWithRetry({
      sources: ["/never/appears.png"],
      cwd: null,
      env,
      retry: { attempts: 2, delayMs: 5 },
    });
    assert.deepEqual(outcome.unavailable, ["/never/appears.png"]);
  });
});
