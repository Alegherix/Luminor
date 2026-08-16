export type LicenseEntry = {
  readonly name: string;
  readonly license: string;
};

export const OPEN_SOURCE_LICENSES: readonly LicenseEntry[] = [
  { name: "Expo", license: "MIT" },
  { name: "React", license: "MIT" },
  { name: "React Native", license: "MIT" },
  { name: "expo-router", license: "MIT" },
  { name: "expo-secure-store", license: "MIT" },
  { name: "Effect", license: "MIT" },
];
