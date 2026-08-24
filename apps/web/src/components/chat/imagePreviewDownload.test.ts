import { describe, expect, it } from "vitest";

import { imageAccessibleName, imageDownloadFileName } from "./imagePreviewDownload";

describe("imageDownloadFileName", () => {
  it("keeps a real filename", () => {
    expect(imageDownloadFileName("screen.png")).toBe("screen.png");
  });

  it("does not download gallery keys or managed attachment ids as the filename", () => {
    expect(imageDownloadFileName("attachment:att_v2_73b1149b75ed46d698a64420b93d0353")).toBe(
      "image.png",
    );
    expect(imageDownloadFileName("att_v2_73b1149b75ed46d698a64420b93d0353")).toBe("image.png");
  });

  it("falls back when the label has no extension", () => {
    expect(imageDownloadFileName("Generated image")).toBe("image.png");
    expect(imageDownloadFileName("")).toBe("image.png");
  });
});

describe("imageAccessibleName", () => {
  it("hides gallery keys from visible and accessible labels", () => {
    expect(imageAccessibleName("attachment:att_v2_73b1149b75ed46d698a64420b93d0353")).toBe("Image");
    expect(imageAccessibleName("att_v2_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBe("Image");
  });

  it("keeps a human filename", () => {
    expect(imageAccessibleName("screen.png")).toBe("screen.png");
  });
});
