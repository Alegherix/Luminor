// FILE: useVisibleDiffFilePath.ts
// Purpose: Track which diff file the viewport is scrolled to.
// Layer: Diff panel hooks

import type { FileDiffMetadata } from "@pierre/diffs/react";
import { useEffect, useState, type RefObject } from "react";

import { resolveActiveDiffFilePath } from "../components/DiffPanel.logic";

export function useVisibleDiffFilePath(input: {
  viewportRef: RefObject<HTMLElement | null>;
  files: ReadonlyArray<FileDiffMetadata>;
}): string | null {
  const { viewportRef, files } = input;
  const [visibleFilePath, setVisibleFilePath] = useState<string | null>(null);

  useEffect(() => {
    const surface = viewportRef.current?.querySelector<HTMLElement>(".diff-render-surface") ?? null;
    if (files.length === 0 || !surface) {
      setVisibleFilePath(null);
      return;
    }

    let frame = 0;
    const update = () => {
      if (surface.clientHeight === 0) {
        return;
      }
      const surfaceTop = surface.getBoundingClientRect().top;
      const anchors = Array.from(
        surface.querySelectorAll<HTMLElement>("[data-diff-file-path]"),
        (anchor) => ({
          filePath: anchor.dataset.diffFilePath ?? "",
          top: anchor.getBoundingClientRect().top,
        }),
      );
      setVisibleFilePath(resolveActiveDiffFilePath(anchors, surfaceTop));
    };
    const handleScroll = () => {
      if (frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    surface.addEventListener("scroll", handleScroll, { passive: true });
    update();
    return () => {
      surface.removeEventListener("scroll", handleScroll);
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [files, viewportRef]);

  return visibleFilePath;
}
