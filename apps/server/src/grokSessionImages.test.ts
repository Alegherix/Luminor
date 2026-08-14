import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "vitest";

import {
  isGrokSessionRelativeImageSrc,
  resolveGrokSessionRelativeImage,
  resolveGrokSessionsRoot,
} from "./grokSessionImages.ts";

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
  delete process.env.GROK_HOME;
});

describe("isGrokSessionRelativeImageSrc", () => {
  it("accepts the session-relative markdown form Grok tells the model to emit", () => {
    assert.equal(isGrokSessionRelativeImageSrc("images/5.jpg"), true);
    assert.equal(isGrokSessionRelativeImageSrc("images/1.png"), true);
    assert.equal(isGrokSessionRelativeImageSrc(" images/8.webp "), true);
    assert.equal(isGrokSessionRelativeImageSrc("images/meetings-empty-panel-dark.png"), true);
  });

  it("rejects traversal and non-image names", () => {
    assert.equal(isGrokSessionRelativeImageSrc("images/../secret.jpg"), false);
    assert.equal(isGrokSessionRelativeImageSrc("images/nested/5.jpg"), false);
    assert.equal(isGrokSessionRelativeImageSrc("images/5.txt"), false);
    assert.equal(isGrokSessionRelativeImageSrc("preview.jpg"), false);
    assert.equal(isGrokSessionRelativeImageSrc("/tmp/images/5.jpg"), false);
  });
});

describe("resolveGrokSessionRelativeImage", () => {
  it("maps images/N.jpg onto the newest matching file for the encoded cwd", async () => {
    const grokHome = makeTempDir("luminor-grok-home-");
    const workspace = makeTempDir("luminor-grok-workspace-");
    process.env.GROK_HOME = grokHome;
    const olderDir = path.join(
      resolveGrokSessionsRoot(),
      encodeURIComponent(workspace),
      "session-old",
      "images",
    );
    const newerDir = path.join(
      resolveGrokSessionsRoot(),
      encodeURIComponent(workspace),
      "session-new",
      "images",
    );
    mkdirSync(olderDir, { recursive: true });
    mkdirSync(newerDir, { recursive: true });
    const olderPath = path.join(olderDir, "5.jpg");
    const newerPath = path.join(newerDir, "5.jpg");
    writeFileSync(olderPath, Buffer.from([0xff, 0xd8, 0xff]));
    writeFileSync(newerPath, Buffer.from([0xff, 0xd8, 0xff, 0xdb]));
    const now = Date.now() / 1000;
    utimesSync(olderPath, now - 20, now - 20);
    utimesSync(newerPath, now, now);

    const resolved = await resolveGrokSessionRelativeImage({
      requestedPath: "images/5.jpg",
      cwd: workspace,
    });

    assert.equal(resolved, newerPath);
  });

  it("maps named screenshot files under images/", async () => {
    const grokHome = makeTempDir("luminor-grok-home-named-");
    const workspace = makeTempDir("luminor-grok-workspace-named-");
    process.env.GROK_HOME = grokHome;
    const imageDir = path.join(
      resolveGrokSessionsRoot(),
      encodeURIComponent(workspace),
      "session-1",
      "images",
    );
    mkdirSync(imageDir, { recursive: true });
    const imagePath = path.join(imageDir, "meetings-empty-panel-dark.png");
    writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const resolved = await resolveGrokSessionRelativeImage({
      requestedPath: "images/meetings-empty-panel-dark.png",
      cwd: workspace,
    });

    assert.equal(resolved, imagePath);
  });

  it("does not leak an image from a different workspace cwd", async () => {
    const grokHome = makeTempDir("luminor-grok-home-");
    const workspace = makeTempDir("luminor-grok-workspace-");
    const otherWorkspace = makeTempDir("luminor-grok-other-");
    process.env.GROK_HOME = grokHome;
    const imageDir = path.join(
      resolveGrokSessionsRoot(),
      encodeURIComponent(otherWorkspace),
      "session-1",
      "images",
    );
    mkdirSync(imageDir, { recursive: true });
    writeFileSync(path.join(imageDir, "5.jpg"), Buffer.from([0xff, 0xd8, 0xff]));

    const resolved = await resolveGrokSessionRelativeImage({
      requestedPath: "images/5.jpg",
      cwd: workspace,
    });

    assert.equal(resolved, null);
  });
});
