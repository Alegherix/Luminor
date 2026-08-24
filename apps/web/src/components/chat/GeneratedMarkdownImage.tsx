import { memo, type MouseEvent } from "react";

import { useLocalImagePreview } from "../LocalImagePreview";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";
import { localImageGalleryKey } from "./galleryPane.logic";
import { TRANSCRIPT_IMAGE_THUMBNAIL_BUTTON_CLASS_NAME } from "./transcriptImageThumbnail";

export interface GeneratedMarkdownImageProps {
  src: string;
  alt: string;
  cwd: string | undefined;
  onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}

export const GeneratedMarkdownImage = memo(function GeneratedMarkdownImage(
  props: GeneratedMarkdownImageProps,
) {
  const { src, alt, cwd, onImageExpand } = props;
  const { previewUrl, fileName, imgProps } = useLocalImagePreview({ src, cwd });
  const accessibleName = alt?.trim() || "Generated image";

  const expandImage = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    onImageExpand?.({
      images: [
        {
          src: previewUrl,
          name: fileName || accessibleName,
          galleryKey: localImageGalleryKey(src),
        },
      ],
      index: 0,
    });
  };

  return (
    <button
      type="button"
      className={TRANSCRIPT_IMAGE_THUMBNAIL_BUTTON_CLASS_NAME}
      onClick={expandImage}
      aria-label={`Preview ${accessibleName}`}
      title={accessibleName}
    >
      <img {...imgProps} alt={accessibleName} className="size-full object-cover" />
    </button>
  );
});
