import { describe, expect, it } from "vitest";

import type { MessageId } from "@luminor/contracts";

import type { ChatMessage } from "~/types";
import {
  attachmentGalleryKey,
  collectGalleryImages,
  groupGalleryImagesByMessage,
  localImageGalleryKey,
  resolveSelectedGalleryImage,
} from "./galleryPane.logic";

function makeMessage(input: Omit<Partial<ChatMessage>, "id"> & { id: string }): ChatMessage {
  return {
    id: input.id as MessageId,
    role: input.role ?? "assistant",
    text: input.text ?? "",
    createdAt: input.createdAt ?? "2026-08-14T10:00:00.000Z",
    streaming: false,
    ...(input.attachments ? { attachments: input.attachments } : {}),
  };
}

describe("collectGalleryImages", () => {
  it("collects user image attachments with preview URLs", () => {
    const messages = [
      makeMessage({
        id: "m1",
        role: "user",
        attachments: [
          {
            type: "image",
            id: "att-1",
            name: "screen.png",
            mimeType: "image/png",
            sizeBytes: 10,
            previewUrl: "blob:one",
          },
          {
            type: "image",
            id: "att-2",
            name: "no-preview.png",
            mimeType: "image/png",
            sizeBytes: 10,
          },
          {
            type: "file",
            id: "file-1",
            name: "notes.txt",
            mimeType: "text/plain",
            sizeBytes: 10,
          },
        ],
      }),
    ];

    const images = collectGalleryImages(messages);
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({
      key: attachmentGalleryKey("att-1"),
      kind: "attachment",
      src: "blob:one",
      name: "screen.png",
      messageId: "m1",
    });
  });

  it("collects local markdown images from assistant text and skips remote ones", () => {
    const messages = [
      makeMessage({
        id: "m2",
        text: [
          "Here you go:",
          "![Mock A](/tmp/generated/mock-a.png)",
          "![](./assets/mock-b.png)",
          "![remote](https://example.com/image.png)",
        ].join("\n"),
      }),
    ];

    const images = collectGalleryImages(messages);
    expect(images.map((image) => image.key)).toEqual([
      localImageGalleryKey("/tmp/generated/mock-a.png"),
      localImageGalleryKey("./assets/mock-b.png"),
    ]);
    expect(images[0]?.name).toBe("Mock A");
    expect(images[1]?.name).toBe("mock-b.png");
  });

  it("dedupes repeated references and skips system messages", () => {
    const messages = [
      makeMessage({ id: "m3", text: "![a](/tmp/a.png)" }),
      makeMessage({ id: "m4", text: "again ![a](/tmp/a.png) and ![b](/tmp/b.png)" }),
      makeMessage({ id: "m5", role: "system", text: "![sys](/tmp/sys.png)" }),
    ];

    const images = collectGalleryImages(messages);
    expect(images.map((image) => image.src)).toEqual(["/tmp/a.png", "/tmp/b.png"]);
    expect(images[0]?.messageId).toBe("m3");
  });
});

describe("groupGalleryImagesByMessage", () => {
  it("groups consecutive images per originating message in thread order", () => {
    const messages = [
      makeMessage({ id: "m1", text: "![a](/tmp/a.png) ![b](/tmp/b.png)" }),
      makeMessage({ id: "m2", text: "![c](/tmp/c.png)" }),
    ];
    const groups = groupGalleryImagesByMessage(collectGalleryImages(messages));
    expect(groups.map((group) => group.messageId)).toEqual(["m1", "m2"]);
    expect(groups[0]?.images).toHaveLength(2);
    expect(groups[1]?.images).toHaveLength(1);
  });
});

describe("resolveSelectedGalleryImage", () => {
  const images = collectGalleryImages([
    makeMessage({ id: "m1", text: "![a](/tmp/a.png) ![b](/tmp/b.png)" }),
  ]);

  it("returns the matching image for a known key", () => {
    const selected = resolveSelectedGalleryImage(images, localImageGalleryKey("/tmp/a.png"));
    expect(selected?.src).toBe("/tmp/a.png");
  });

  it("falls back to the newest image for unknown or missing keys", () => {
    expect(resolveSelectedGalleryImage(images, "local:/tmp/gone.png")?.src).toBe("/tmp/b.png");
    expect(resolveSelectedGalleryImage(images, null)?.src).toBe("/tmp/b.png");
  });

  it("returns null when the thread has no images", () => {
    expect(resolveSelectedGalleryImage([], null)).toBeNull();
  });
});
