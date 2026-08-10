import { describe, expect, it } from "vitest";

import {
  BASE_FONT_SIZE_WHEEL_STEP_THRESHOLD,
  consumeBaseFontSizeWheelSteps,
  isBaseFontSizeWheelGesture,
  nextBaseFontSizePx,
  normalizeWheelDeltaYPx,
} from "./baseFontSizeWheel";
import {
  DEFAULT_CHAT_FONT_SIZE_PX,
  MAX_CHAT_FONT_SIZE_PX,
  MIN_CHAT_FONT_SIZE_PX,
} from "../appSettings";

describe("isBaseFontSizeWheelGesture", () => {
  it("requires Ctrl", () => {
    expect(isBaseFontSizeWheelGesture({ ctrlKey: true })).toBe(true);
    expect(isBaseFontSizeWheelGesture({ ctrlKey: false })).toBe(false);
  });
});

describe("normalizeWheelDeltaYPx", () => {
  it("passes through pixel deltas", () => {
    expect(normalizeWheelDeltaYPx(-120)).toBe(-120);
    expect(normalizeWheelDeltaYPx(40, 0)).toBe(40);
  });

  it("scales line and page modes into approximate pixels", () => {
    expect(normalizeWheelDeltaYPx(1, 1)).toBe(16);
    expect(normalizeWheelDeltaYPx(-1, 2)).toBe(-400);
  });

  it("returns 0 for non-finite or zero deltas", () => {
    expect(normalizeWheelDeltaYPx(0)).toBe(0);
    expect(normalizeWheelDeltaYPx(Number.NaN)).toBe(0);
  });
});

describe("consumeBaseFontSizeWheelSteps", () => {
  it("accumulates until the threshold, then steps once and resets residual", () => {
    const first = consumeBaseFontSizeWheelSteps(0, BASE_FONT_SIZE_WHEEL_STEP_THRESHOLD - 1);
    expect(first.step).toBe(0);
    expect(first.residualDeltaYPx).toBe(BASE_FONT_SIZE_WHEEL_STEP_THRESHOLD - 1);

    const second = consumeBaseFontSizeWheelSteps(first.residualDeltaYPx, 2);
    expect(second.step).toBe(-1);
    expect(second.residualDeltaYPx).toBe(0);
  });

  it("increases font size when scrolling up (negative deltaY)", () => {
    const result = consumeBaseFontSizeWheelSteps(0, -BASE_FONT_SIZE_WHEEL_STEP_THRESHOLD);
    expect(result.step).toBe(1);
    expect(result.residualDeltaYPx).toBe(0);
  });

  it("decreases font size when scrolling down (positive deltaY)", () => {
    const result = consumeBaseFontSizeWheelSteps(0, BASE_FONT_SIZE_WHEEL_STEP_THRESHOLD);
    expect(result.step).toBe(-1);
  });
});

describe("nextBaseFontSizePx", () => {
  it("steps by one pixel and clamps to the supported range", () => {
    expect(nextBaseFontSizePx(DEFAULT_CHAT_FONT_SIZE_PX, 1)).toBe(DEFAULT_CHAT_FONT_SIZE_PX + 1);
    expect(nextBaseFontSizePx(DEFAULT_CHAT_FONT_SIZE_PX, -1)).toBe(DEFAULT_CHAT_FONT_SIZE_PX - 1);
    expect(nextBaseFontSizePx(MAX_CHAT_FONT_SIZE_PX, 1)).toBe(MAX_CHAT_FONT_SIZE_PX);
    expect(nextBaseFontSizePx(MIN_CHAT_FONT_SIZE_PX, -1)).toBe(MIN_CHAT_FONT_SIZE_PX);
  });

  it("ignores a zero step", () => {
    expect(nextBaseFontSizePx(14, 0)).toBe(14);
  });
});
