// FILE: desktopClipboard.ts
// Purpose: Renderer-side wrappers for desktop clipboard writes exposed by Electron
// preload. Browser-only clipboard fallbacks live with the calling feature.
// Layer: Web desktop bridge utility
// Exports: copyPngBlobToDesktopClipboard, copyTextToDesktopClipboard

export async function copyTextToDesktopClipboard(value: string): Promise<boolean> {
  const writeText =
    typeof window === "undefined" ? undefined : window.desktopBridge?.clipboard?.writeText;
  if (!writeText) {
    return false;
  }

  try {
    return (await writeText(value)) === true;
  } catch {
    return false;
  }
}

export async function copyPngBlobToDesktopClipboard(blob: Blob): Promise<boolean> {
  const writeImagePngDataUrl =
    typeof window === "undefined"
      ? undefined
      : window.desktopBridge?.clipboard?.writeImagePngDataUrl;
  if (!writeImagePngDataUrl) {
    return false;
  }

  const dataUrl = await blobToDataUrl(blob);
  if (!dataUrl?.startsWith("data:image/png;base64,")) {
    return false;
  }

  try {
    return await writeImagePngDataUrl(dataUrl);
  } catch {
    return false;
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  if (typeof FileReader === "undefined") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(blob);
  });
}
