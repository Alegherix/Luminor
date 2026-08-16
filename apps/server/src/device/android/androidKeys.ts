import type { DeviceHardwareButton } from "@luminor/contracts";

const HID_LETTER_FIRST = 0x04;
const HID_LETTER_LAST = 0x1d;
const AKEYCODE_A = 29;
const HID_DIGIT_1 = 0x1e;
const HID_DIGIT_9 = 0x26;
const HID_DIGIT_0 = 0x27;
const AKEYCODE_1 = 8;
const AKEYCODE_0 = 7;

const NAMED_HID_TO_ANDROID: ReadonlyMap<number, number> = new Map([
  [0x28, 66],
  [0x29, 111],
  [0x2a, 67],
  [0x2b, 61],
  [0x2c, 62],
  [0x2d, 69],
  [0x2e, 70],
  [0x33, 74],
  [0x34, 75],
  [0x36, 55],
  [0x37, 56],
  [0x38, 76],
  [0x4c, 112],
  [0x4f, 22],
  [0x50, 21],
  [0x51, 20],
  [0x52, 19],
]);

export function hidUsageToAndroidKeyCode(usage: number): number | null {
  if (usage >= HID_LETTER_FIRST && usage <= HID_LETTER_LAST)
    return AKEYCODE_A + (usage - HID_LETTER_FIRST);
  if (usage >= HID_DIGIT_1 && usage <= HID_DIGIT_9) return AKEYCODE_1 + (usage - HID_DIGIT_1);
  if (usage === HID_DIGIT_0) return AKEYCODE_0;
  return NAMED_HID_TO_ANDROID.get(usage) ?? null;
}

export const ANDROID_HARDWARE_BUTTON_KEYCODES: Partial<Record<DeviceHardwareButton, number>> = {
  home: 3,
  lock: 26,
  "volume-up": 24,
  "volume-down": 25,
};

export function escapeForAdbInputText(text: string): string {
  return text.replaceAll(/([\\'"`&|;<>()*~$])/gu, "\\$1").replaceAll(" ", "%s");
}
