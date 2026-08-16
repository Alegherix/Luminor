import { describe, expect, it } from "vitest";

import { OPEN_SOURCE_LICENSES } from "./licenses";

describe("OPEN_SOURCE_LICENSES", () => {
  it("lists the runtime packages shipped with the mobile app", () => {
    const names = OPEN_SOURCE_LICENSES.map((entry) => entry.name);
    expect(names).toEqual(
      expect.arrayContaining(["Expo", "React", "React Native", "Effect", "expo-router"]),
    );
    expect(OPEN_SOURCE_LICENSES.every((entry) => entry.license.length > 0)).toBe(true);
  });
});
