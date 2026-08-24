// FILE: DockGalleryPane.tsx
// Purpose: Right-dock image gallery for a thread — a focused single-image view
//          with a thumbnail rail, and a canvas view showing every image grouped
//          by originating message.
// Layer: Chat right-dock pane component
// Exports: DockGalleryPane

import { memo, useEffect, useMemo, useState, type KeyboardEvent } from "react";

import type { ThreadId } from "@luminor/contracts";

import { LayoutGridIcon, PhotoIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";
import type { RightDockPane } from "~/rightDockStore.logic";
import { useStore } from "~/store";
import { createThreadSelector } from "~/storeSelectors";
import type { ChatMessage } from "~/types";

import { useLocalImagePreview } from "../LocalImagePreview";
import { IconButton } from "../ui/icon-button";
import {
  collectGalleryImages,
  groupGalleryImagesByMessage,
  resolveSelectedGalleryImage,
  type GalleryImage,
} from "./galleryPane.logic";
import { ImageCornerDownload } from "./ImageCornerDownload";
import { imageAccessibleName } from "./imagePreviewDownload";

type GalleryViewMode = "focus" | "canvas";

const EMPTY_MESSAGES: readonly ChatMessage[] = [];

function formatGalleryGroupTimestamp(createdAt: string): string {
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function LocalGalleryImage(props: { image: GalleryImage; cwd: string | null; className?: string }) {
  const { imgProps, status } = useLocalImagePreview({ src: props.image.src, cwd: props.cwd });
  if (status === "error") {
    return (
      <div className="flex size-full items-center justify-center">
        <PhotoIcon className="size-4 opacity-50" />
      </div>
    );
  }
  return (
    <img {...imgProps} alt={imageAccessibleName(props.image.name)} className={props.className} />
  );
}

function GalleryImageView(props: { image: GalleryImage; cwd: string | null; className?: string }) {
  if (props.image.kind === "local") {
    return (
      <LocalGalleryImage
        image={props.image}
        cwd={props.cwd}
        {...(props.className ? { className: props.className } : {})}
      />
    );
  }
  return (
    <img
      src={props.image.src}
      alt={imageAccessibleName(props.image.name)}
      loading="lazy"
      decoding="async"
      draggable={false}
      {...(props.className ? { className: props.className } : {})}
    />
  );
}

const GALLERY_TILE_CLASS_NAME =
  "group flex items-center justify-center overflow-hidden rounded-xl border bg-background/70 transition-colors hover:bg-background";

function GalleryThumbnail(props: {
  image: GalleryImage;
  cwd: string | null;
  selected: boolean;
  className?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      title={imageAccessibleName(props.image.name)}
      aria-label={`View ${imageAccessibleName(props.image.name)}`}
      aria-current={props.selected ? "true" : undefined}
      onClick={props.onSelect}
      className={cn(
        GALLERY_TILE_CLASS_NAME,
        props.selected ? "border-primary/70 ring-1 ring-primary/50" : "border-border/70",
        props.className,
      )}
    >
      <GalleryImageView
        image={props.image}
        cwd={props.cwd}
        className="max-h-full max-w-full object-contain"
      />
    </button>
  );
}

function GalleryImageCornerDownload(props: { image: GalleryImage; cwd: string | null }) {
  if (props.image.kind === "local") {
    return <LocalGalleryCornerDownload image={props.image} cwd={props.cwd} />;
  }
  return <ImageCornerDownload href={props.image.src} name={props.image.name} />;
}

function LocalGalleryCornerDownload(props: { image: GalleryImage; cwd: string | null }) {
  const { downloadUrl, downloadName } = useLocalImagePreview({
    src: props.image.src,
    cwd: props.cwd,
  });
  return <ImageCornerDownload href={downloadUrl} name={downloadName || props.image.name} />;
}

function GalleryFocusView(props: {
  images: readonly GalleryImage[];
  selected: GalleryImage;
  cwd: string | null;
  onSelectImage: (key: string) => void;
}) {
  const selectedIndex = props.images.findIndex((image) => image.key === props.selected.key);

  const navigate = (delta: number) => {
    if (props.images.length <= 1 || selectedIndex < 0) {
      return;
    }
    const nextIndex = (selectedIndex + delta + props.images.length) % props.images.length;
    const next = props.images[nextIndex];
    if (next) {
      props.onSelectImage(next.key);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      navigate(-1);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      navigate(1);
    }
  };

  return (
    <div className="flex min-h-0 flex-1" role="group" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="flex w-20 shrink-0 flex-col gap-2 overflow-y-auto border-r border-border/60 p-2.5">
        {props.images.map((image) => (
          <GalleryThumbnail
            key={image.key}
            image={image}
            cwd={props.cwd}
            selected={image.key === props.selected.key}
            className="aspect-square w-full shrink-0 p-1"
            onSelect={() => props.onSelectImage(image.key)}
          />
        ))}
      </div>
      <div className="expanded-image-preview relative flex min-w-0 flex-1 items-center justify-center overflow-hidden p-4">
        <GalleryImageView
          image={props.selected}
          cwd={props.cwd}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
        <GalleryImageCornerDownload image={props.selected} cwd={props.cwd} />
      </div>
    </div>
  );
}

function GalleryCanvasView(props: {
  images: readonly GalleryImage[];
  selectedKey: string | null;
  cwd: string | null;
  onSelectImage: (key: string) => void;
}) {
  const groups = useMemo(() => groupGalleryImagesByMessage(props.images), [props.images]);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="flex flex-col gap-6">
        {groups.map((group) => (
          <section key={group.messageId} className="flex flex-col gap-2.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {formatGalleryGroupTimestamp(group.createdAt)}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
              {group.images.map((image) => (
                <GalleryThumbnail
                  key={image.key}
                  image={image}
                  cwd={props.cwd}
                  selected={image.key === props.selectedKey}
                  className="aspect-[3/4] p-1.5"
                  onSelect={() => props.onSelectImage(image.key)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function GalleryEmptyState() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <PhotoIcon className="size-6 text-muted-foreground/60" />
      <p className="text-sm text-muted-foreground">
        Images shared or generated in this thread appear here.
      </p>
    </div>
  );
}

export const DockGalleryPane = memo(function DockGalleryPane(props: {
  threadId: ThreadId;
  workspaceRoot: string | null;
  pane: RightDockPane;
  onSelectImage: (key: string | null) => void;
}) {
  const threadSelector = useMemo(() => createThreadSelector(props.threadId), [props.threadId]);
  const messages = useStore((state) => threadSelector(state)?.messages) ?? EMPTY_MESSAGES;
  const images = useMemo(() => collectGalleryImages(messages), [messages]);

  const galleryImageKey = props.pane.galleryImageKey;
  const [viewMode, setViewMode] = useState<GalleryViewMode>(galleryImageKey ? "focus" : "canvas");
  // A transcript click re-targets the pane at a specific image; jump to it in
  // the focused view even when the user last left the pane on the canvas.
  useEffect(() => {
    if (galleryImageKey) {
      setViewMode("focus");
    }
  }, [galleryImageKey]);

  const selected = resolveSelectedGalleryImage(images, galleryImageKey);

  const selectImage = (key: string) => {
    props.onSelectImage(key);
    setViewMode("focus");
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-border/60 px-2.5 py-1.5">
        <IconButton
          label="Focused image view"
          variant={viewMode === "focus" ? "secondary" : "ghost"}
          aria-pressed={viewMode === "focus"}
          disabled={images.length === 0}
          onClick={() => setViewMode("focus")}
        >
          <PhotoIcon className="size-4" />
        </IconButton>
        <IconButton
          label="All images view"
          variant={viewMode === "canvas" ? "secondary" : "ghost"}
          aria-pressed={viewMode === "canvas"}
          onClick={() => setViewMode("canvas")}
        >
          <LayoutGridIcon className="size-4" />
        </IconButton>
      </div>
      {images.length === 0 ? (
        <GalleryEmptyState />
      ) : viewMode === "focus" && selected ? (
        <GalleryFocusView
          images={images}
          selected={selected}
          cwd={props.workspaceRoot}
          onSelectImage={selectImage}
        />
      ) : (
        <GalleryCanvasView
          images={images}
          selectedKey={selected?.key ?? null}
          cwd={props.workspaceRoot}
          onSelectImage={selectImage}
        />
      )}
    </div>
  );
});
