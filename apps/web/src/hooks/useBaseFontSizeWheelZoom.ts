import { useEffect, useRef } from "react";

import { useAppSettings } from "../appSettings";
import {
  consumeBaseFontSizeWheelSteps,
  isBaseFontSizeWheelGesture,
  nextBaseFontSizePx,
  normalizeWheelDeltaYPx,
} from "../lib/baseFontSizeWheel";

export function useBaseFontSizeWheelZoom(): void {
  const { settings, updateSettings } = useAppSettings();
  const fontSizeRef = useRef(settings.chatFontSizePx);
  const updateSettingsRef = useRef(updateSettings);
  fontSizeRef.current = settings.chatFontSizePx;
  updateSettingsRef.current = updateSettings;

  useEffect(() => {
    let residualDeltaYPx = 0;

    const onWheel = (event: WheelEvent) => {
      if (!isBaseFontSizeWheelGesture(event)) {
        residualDeltaYPx = 0;
        return;
      }

      event.preventDefault();

      const incomingDeltaYPx = normalizeWheelDeltaYPx(event.deltaY, event.deltaMode);
      if (incomingDeltaYPx === 0) {
        return;
      }

      const { residualDeltaYPx: nextResidual, step } = consumeBaseFontSizeWheelSteps(
        residualDeltaYPx,
        incomingDeltaYPx,
      );
      residualDeltaYPx = nextResidual;
      if (step === 0) {
        return;
      }

      const current = fontSizeRef.current;
      const next = nextBaseFontSizePx(current, step);
      if (next === current) {
        return;
      }

      updateSettingsRef.current({ chatFontSizePx: next });
    };

    window.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, []);
}
