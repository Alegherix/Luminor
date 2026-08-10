import { normalizeChatFontSizePx } from "../appSettings";

export const BASE_FONT_SIZE_WHEEL_STEP_THRESHOLD = 40;

export type BaseFontSizeWheelEventLike = {
  readonly ctrlKey: boolean;
  readonly deltaY: number;
  readonly deltaMode?: number;
};

export function isBaseFontSizeWheelGesture(
  event: Pick<BaseFontSizeWheelEventLike, "ctrlKey">,
): boolean {
  return event.ctrlKey === true;
}

export function normalizeWheelDeltaYPx(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return 0;
  }

  if (deltaMode === 1) {
    return deltaY * 16;
  }
  if (deltaMode === 2) {
    return deltaY * 400;
  }
  return deltaY;
}

export function consumeBaseFontSizeWheelSteps(
  residualDeltaYPx: number,
  incomingDeltaYPx: number,
  threshold = BASE_FONT_SIZE_WHEEL_STEP_THRESHOLD,
): { readonly residualDeltaYPx: number; readonly step: -1 | 0 | 1 } {
  if (!Number.isFinite(threshold) || threshold <= 0) {
    return { residualDeltaYPx: 0, step: 0 };
  }

  const nextResidual = residualDeltaYPx + incomingDeltaYPx;
  if (!Number.isFinite(nextResidual) || Math.abs(nextResidual) < threshold) {
    return { residualDeltaYPx: nextResidual, step: 0 };
  }

  const step: -1 | 1 = nextResidual < 0 ? 1 : -1;
  return { residualDeltaYPx: 0, step };
}

export function nextBaseFontSizePx(currentPx: number, step: number): number {
  if (!Number.isFinite(step) || step === 0) {
    return normalizeChatFontSizePx(currentPx);
  }
  return normalizeChatFontSizePx(currentPx + step);
}
