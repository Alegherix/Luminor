const MANAGED_ATTACHMENT_ID_PATTERN = /^att_v2_[0-9a-f]{32}$/iu;
const FILENAME_EXTENSION_PATTERN = /\.[a-z0-9]{2,8}$/iu;

function isInternalAttachmentLabel(name: string): boolean {
  return name.startsWith("attachment:") || MANAGED_ATTACHMENT_ID_PATTERN.test(name);
}

export function imageDownloadFileName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || isInternalAttachmentLabel(trimmed) || !FILENAME_EXTENSION_PATTERN.test(trimmed)) {
    return "image.png";
  }
  return trimmed;
}

export function imageAccessibleName(name: string | undefined): string {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || isInternalAttachmentLabel(trimmed)) {
    return "Image";
  }
  return trimmed;
}
