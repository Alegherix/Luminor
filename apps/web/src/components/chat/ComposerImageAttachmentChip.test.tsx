import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ComposerImageSource } from "../../lib/composerImageSource";
import { ComposerImageAttachmentChip } from "./ComposerImageAttachmentChip";

describe("ComposerImageAttachmentChip", () => {
  it("renders a compact thumbnail with preview and remove actions", () => {
    const markup = renderToStaticMarkup(
      <ComposerImageAttachmentChip
        image={{
          id: "image-1",
          type: "image",
          name: "CleanShot 2026-04-11 at 20.00.33@2x.png",
          mimeType: "image/png",
          sizeBytes: 1024,
          previewUrl: "blob:image-1",
          file: new File(["image"], "CleanShot 2026-04-11 at 20.00.33@2x.png", {
            type: "image/png",
          }),
        }}
        images={[
          {
            id: "image-1",
            type: "image",
            name: "CleanShot 2026-04-11 at 20.00.33@2x.png",
            mimeType: "image/png",
            sizeBytes: 1024,
            previewUrl: "blob:image-1",
            file: new File(["image"], "CleanShot 2026-04-11 at 20.00.33@2x.png", {
              type: "image/png",
            }),
          },
        ]}
        nonPersisted={false}
        onExpandImage={() => {}}
        onRemoveImage={() => {}}
      />,
    );

    expect(markup).toContain("CleanShot 2026-04-11 at 20.00.33@2x.png");
    expect(markup).toContain("size-16");
    expect(markup).toContain("Preview CleanShot 2026-04-11 at 20.00.33@2x.png");
    expect(markup).toContain("Remove CleanShot 2026-04-11 at 20.00.33@2x.png");
    expect(markup).not.toContain("h-14 w-14");
  });

  it("renders legacy capture metadata as a compact media strip with contained framing", () => {
    const captureImage = {
      id: "capture-1",
      type: "image" as const,
      name: "capture.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      previewUrl: "blob:capture-1",
      file: new File(["image"], "capture.png", { type: "image/png" }),
      source: {
        kind: "appsnap" as const,
        captureId: "capture-1",
        capturedAt: "2026-07-12T19:59:33.000Z",
        appName: "Visual Studio Code",
        bundleIdentifier: "com.microsoft.VSCode",
        appIconDataUrl: "data:image/png;base64,aWNvbg==",
        windowTitle: "Composer.tsx — luminor",
      },
    };
    const markup = renderToStaticMarkup(
      <ComposerImageAttachmentChip
        image={captureImage}
        images={[captureImage]}
        nonPersisted={false}
        onExpandImage={() => {}}
        onRemoveImage={() => {}}
      />,
    );

    expect(markup).toContain("w-52");
    expect(markup).toContain("h-32");
    expect(markup).toContain("object-contain");
    expect(markup).not.toContain("object-cover");
    expect(markup).toContain("Composer.tsx — luminor / Visual Studio Code");
    expect(markup).toContain("data:image/png;base64,aWNvbg==");
    expect(markup).toContain("Preview capture from Visual Studio Code");
    expect(markup).toContain("Remove image from Visual Studio Code");
    expect(markup).not.toContain("Draft attachment may not persist");
  });

  it("deduplicates provenance when the window title echoes the app name", () => {
    const captureImage = {
      id: "capture-2",
      type: "image" as const,
      name: "capture.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      previewUrl: "blob:capture-2",
      file: new File(["image"], "capture.png", { type: "image/png" }),
      source: {
        kind: "appsnap" as const,
        captureId: "capture-2",
        capturedAt: "2026-07-12T19:59:33.000Z",
        appName: "ChatGPT",
        windowTitle: "ChatGPT",
      },
    };
    const markup = renderToStaticMarkup(
      <ComposerImageAttachmentChip
        image={captureImage}
        images={[captureImage]}
        nonPersisted={false}
        onExpandImage={() => {}}
        onRemoveImage={() => {}}
      />,
    );

    expect(markup).not.toContain("ChatGPT / ChatGPT");
    const provenanceMatches = markup.match(/ChatGPT/g) ?? [];
    expect(provenanceMatches.length).toBeGreaterThan(0);
  });

  it("renders the former capture discriminator as a source-aware card", () => {
    const captureImage = {
      id: "capture-legacy",
      type: "image" as const,
      name: "capture.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      previewUrl: "blob:capture-legacy",
      file: new File(["image"], "capture.png", { type: "image/png" }),
      source: {
        kind: "appshot",
        captureId: "capture-legacy",
        capturedAt: "2026-07-12T19:59:33.000Z",
        appName: "Safari",
        windowTitle: "Luminor",
      } as unknown as ComposerImageSource,
    };
    const markup = renderToStaticMarkup(
      <ComposerImageAttachmentChip
        image={captureImage}
        images={[captureImage]}
        nonPersisted={false}
        onExpandImage={() => {}}
        onRemoveImage={() => {}}
      />,
    );

    expect(markup).toContain("w-52");
    expect(markup).toContain("Preview capture from Safari");
    expect(markup).toContain("Luminor / Safari");
  });
});
