import { useLayoutEffect, useRef } from "react";

import { resolveDesktopDipRectFromCssRect } from "@luminor/shared/desktopChrome";

import { Button } from "~/components/ui/button";
import { readDesktopZoomFactor, subscribeDesktopZoomFactor } from "~/lib/desktopZoom";

export function MeetingsEmbedCanvas({ onLeave }: { readonly onLeave: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = hostRef.current;
    const meetings = window.desktopBridge?.meetings;
    if (!element || !meetings?.setEmbedBounds) {
      return;
    }

    const syncBounds = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        void meetings.setEmbedBounds(null);
        return;
      }
      void meetings.setEmbedBounds(
        resolveDesktopDipRectFromCssRect(
          { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
          readDesktopZoomFactor(),
        ),
      );
    };

    const observer = new ResizeObserver(syncBounds);
    observer.observe(element);
    const unsubscribeZoom = subscribeDesktopZoomFactor(() => {
      syncBounds();
    });
    syncBounds();

    return () => {
      observer.disconnect();
      unsubscribeZoom();
      void meetings.setEmbedBounds(null);
    };
  }, []);

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Google Meet">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <p className="text-sm text-muted-foreground">Google Meet is open in this window.</p>
        <Button type="button" variant="destructive" onClick={onLeave}>
          Leave
        </Button>
      </div>
      <div
        ref={hostRef}
        className="min-h-0 flex-1 bg-background"
        data-testid="meeting-webview-host"
      />
    </section>
  );
}
