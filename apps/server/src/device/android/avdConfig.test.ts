import { describe, expect, it } from "vitest";
import { androidGeometry, parseAvdConfigIni } from "./avdConfig";

describe("parseAvdConfigIni", () => {
  it("reads lcd geometry and api level", () => {
    const ini = [
      "avd.ini.encoding=UTF-8",
      "hw.lcd.density=440",
      "hw.lcd.height=2340",
      "hw.lcd.width=1080",
      "image.sysdir.1=system-images/android-35/google_apis/x86_64/",
    ].join("\n");
    expect(parseAvdConfigIni(ini)).toEqual({
      widthPx: 1080,
      heightPx: 2340,
      densityDpi: 440,
      apiLevel: 35,
    });
  });
});

describe("androidGeometry", () => {
  it("converts pixels to density-independent points", () => {
    expect(androidGeometry(1080, 2340, 440)).toEqual({
      pointWidth: 393,
      pointHeight: 851,
      scale: 2.75,
    });
  });
});
