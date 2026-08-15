import "../../index.css";

import { page } from "vitest/browser";
import { afterEach, expect, it } from "vitest";
import { render } from "vitest-browser-react";

import { InlineSelect } from "./automationInlineFields";

const SCHEDULE_OPTIONS = [
  { value: "manual", label: "Manual" },
  { value: "once", label: "Once" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
  { value: "cron", label: "Cron" },
] as const;

const root = document.documentElement;
const originalRootClassName = root.className;

afterEach(() => {
  root.className = originalRootClassName;
  document.body.innerHTML = "";
});

function srgbChannel(value: string): number {
  const srgb = Number(value) / 255;
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

function cssLightness(color: string): number {
  const okl = color.match(/okl(?:ch|ab)\(\s*([\d.]+)/);
  if (okl) return Number(okl[1]);
  const rgb = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (rgb) {
    return (
      0.2126 * srgbChannel(rgb[1]!) + 0.7152 * srgbChannel(rgb[2]!) + 0.0722 * srgbChannel(rgb[3]!)
    );
  }
  throw new Error(`unparsed CSS color: ${color}`);
}

it("opens a dark themed popup instead of a native select", async () => {
  root.classList.add("dark");
  await render(
    <div className="bg-background p-6 text-foreground">
      <InlineSelect value="custom" options={SCHEDULE_OPTIONS} onChange={() => undefined} />
    </div>,
  );

  expect(document.querySelector("select")).toBeNull();
  await page.getByRole("combobox").click();

  const daily = page.getByRole("option", { name: "Daily" });
  await expect.element(daily).toBeVisible();

  const option = daily.element();
  const popup = document.querySelector<HTMLElement>('[data-slot="select-popup"]');
  expect(popup).not.toBeNull();
  const surface =
    popup?.querySelector<HTMLElement>("[class*='bg-popover']") ?? popup ?? option.parentElement;
  expect(surface).not.toBeNull();

  const textLightness = cssLightness(getComputedStyle(option).color);
  const surfaceLightness = cssLightness(getComputedStyle(surface!).backgroundColor);
  expect(textLightness).toBeGreaterThan(0.8);
  expect(surfaceLightness).toBeLessThan(0.25);
  expect(textLightness).toBeGreaterThan(surfaceLightness + 0.5);
});
