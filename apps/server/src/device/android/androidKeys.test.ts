import { describe, expect, it } from "vitest";
import {
  ANDROID_HARDWARE_BUTTON_KEYCODES,
  escapeForAdbInputText,
  hidUsageToAndroidKeyCode,
} from "./androidKeys";

describe("hidUsageToAndroidKeyCode", () => {
  it("maps letters, digits and named keys", () => {
    expect(hidUsageToAndroidKeyCode(0x04)).toBe(29);
    expect(hidUsageToAndroidKeyCode(0x1d)).toBe(54);
    expect(hidUsageToAndroidKeyCode(0x1e)).toBe(8);
    expect(hidUsageToAndroidKeyCode(0x27)).toBe(7);
    expect(hidUsageToAndroidKeyCode(0x28)).toBe(66);
    expect(hidUsageToAndroidKeyCode(0x2a)).toBe(67);
    expect(hidUsageToAndroidKeyCode(0x50)).toBe(21);
    expect(hidUsageToAndroidKeyCode(0xff)).toBeNull();
  });
});

describe("escapeForAdbInputText", () => {
  it("encodes spaces and escapes device-shell metacharacters", () => {
    expect(escapeForAdbInputText("hi there")).toBe("hi%sthere");
    expect(escapeForAdbInputText("a&b(c)")).toBe("a\\&b\\(c\\)");
  });
});

describe("ANDROID_HARDWARE_BUTTON_KEYCODES", () => {
  it("covers home, lock and volume", () => {
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES.home).toBe(3);
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES.lock).toBe(26);
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES["volume-up"]).toBe(24);
    expect(ANDROID_HARDWARE_BUTTON_KEYCODES["volume-down"]).toBe(25);
  });
});
