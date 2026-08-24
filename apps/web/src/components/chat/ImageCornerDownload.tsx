import { DownloadIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import { useLocalImageDownloadClick } from "../LocalImagePreview";
import { imageDownloadFileName } from "./imagePreviewDownload";

export function ImageCornerDownload(props: {
  href: string;
  name?: string | undefined;
  className?: string | undefined;
}) {
  const downloadName = imageDownloadFileName(props.name);
  const onDownloadClick = useLocalImageDownloadClick({
    downloadUrl: props.href,
    downloadName,
  });
  return (
    <a
      href={props.href}
      download={downloadName}
      onClick={onDownloadClick}
      className={cn("local-image-preview__download", props.className)}
      aria-label="Download image"
      title="Download"
    >
      <DownloadIcon className="size-3.5" aria-hidden="true" />
    </a>
  );
}
