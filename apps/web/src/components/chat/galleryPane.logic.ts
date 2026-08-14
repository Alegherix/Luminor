// FILE: galleryPane.logic.ts
// Purpose: Pure derivation of a thread's image gallery from its chat messages.
// Layer: Chat right-dock UI state helpers
// Exports: gallery image model, stable key builders, collection, and grouping.

import type { MessageId } from "@luminor/contracts";

import { isLocalImageMarkdownSrc } from "~/lib/localImageUrls";
import type { ChatMessage } from "~/types";

export type GalleryImageKind = "attachment" | "local";

export interface GalleryImage {
  key: string;
  kind: GalleryImageKind;
  // Attachment images carry a ready preview URL; local images carry the raw
  // markdown src and are resolved against the workspace cwd at render time.
  src: string;
  name: string;
  messageId: MessageId;
  createdAt: string;
}

export interface GalleryImageGroup {
  messageId: MessageId;
  createdAt: string;
  images: GalleryImage[];
}

export function attachmentGalleryKey(attachmentId: string): string {
  return `attachment:${attachmentId}`;
}

export function localImageGalleryKey(src: string): string {
  return `local:${src}`;
}

const MARKDOWN_IMAGE_REGEX = /!\[([^\]]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g;

function markdownImageFileName(src: string): string {
  const normalized = src.replace(/\\/g, "/");
  const segment = normalized.slice(normalized.lastIndexOf("/") + 1);
  return segment || src;
}

function collectMessageGalleryImages(message: ChatMessage): GalleryImage[] {
  const images: GalleryImage[] = [];
  for (const attachment of message.attachments ?? []) {
    if (attachment.type !== "image" || !attachment.previewUrl) {
      continue;
    }
    images.push({
      key: attachmentGalleryKey(attachment.id),
      kind: "attachment",
      src: attachment.previewUrl,
      name: attachment.name,
      messageId: message.id,
      createdAt: message.createdAt,
    });
  }
  for (const match of message.text.matchAll(MARKDOWN_IMAGE_REGEX)) {
    const src = match[2];
    if (!isLocalImageMarkdownSrc(src)) {
      continue;
    }
    images.push({
      key: localImageGalleryKey(src),
      kind: "local",
      src,
      name: match[1]?.trim() || markdownImageFileName(src),
      messageId: message.id,
      createdAt: message.createdAt,
    });
  }
  return images;
}

// Chronological (oldest first) list of every previewable image in the thread:
// user image attachments plus local images embedded in message markdown.
// Re-referencing the same image later keeps the first occurrence only.
export function collectGalleryImages(messages: readonly ChatMessage[]): GalleryImage[] {
  const seenKeys = new Set<string>();
  const images: GalleryImage[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      continue;
    }
    for (const image of collectMessageGalleryImages(message)) {
      if (seenKeys.has(image.key)) {
        continue;
      }
      seenKeys.add(image.key);
      images.push(image);
    }
  }
  return images;
}

// Canvas view groups images per originating message, preserving thread order.
export function groupGalleryImagesByMessage(images: readonly GalleryImage[]): GalleryImageGroup[] {
  const groups: GalleryImageGroup[] = [];
  for (const image of images) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.messageId === image.messageId) {
      lastGroup.images.push(image);
      continue;
    }
    groups.push({ messageId: image.messageId, createdAt: image.createdAt, images: [image] });
  }
  return groups;
}

export function resolveSelectedGalleryImage(
  images: readonly GalleryImage[],
  selectedKey: string | null,
): GalleryImage | null {
  if (images.length === 0) {
    return null;
  }
  if (selectedKey) {
    const selected = images.find((image) => image.key === selectedKey);
    if (selected) {
      return selected;
    }
  }
  return images[images.length - 1] ?? null;
}
