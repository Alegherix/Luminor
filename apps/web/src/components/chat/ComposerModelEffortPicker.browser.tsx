import "../../index.css";

import { type ModelSlug, ThreadId } from "@luminor/contracts";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { ComposerModelEffortPicker } from "./ComposerModelEffortPicker";

const THREAD_ID = ThreadId.makeUnsafe("thread-grok-model-effort-picker");
const GROK_4_5 = "grok-4.5" as ModelSlug;
const GROK_4_6 = "grok-4.6" as ModelSlug;
const CODEX_LUNA = "gpt-5.6-luna" as ModelSlug;

describe("ComposerModelEffortPicker", () => {
  it("keeps Grok effort visible in compact layouts before runtime discovery", async () => {
    const screen = await render(
      <ComposerModelEffortPicker
        provider="grok"
        model={GROK_4_5}
        lockedProvider={null}
        modelOptionsByProvider={{
          claudeAgent: [],
          codex: [],
          cursor: [],
          antigravity: [],
          grok: [{ slug: GROK_4_5, name: "Grok 4.5" }],
          droid: [],
          kilo: [],
          opencode: [],
          pi: [],
        }}
        hideStatusLabel
        onProviderModelChange={vi.fn()}
        threadId={THREAD_ID}
        modelOptions={undefined}
        prompt=""
        onPromptChange={vi.fn()}
      />,
    );

    try {
      const trigger = page.getByRole("button", { name: "Change model and reasoning" });
      await expect.element(trigger).toHaveAttribute("title", "Low");
      expect(trigger.element().querySelector('[data-slot="central-icon"]')).not.toBeNull();

      await trigger.click();
      await expect.element(page.getByRole("menuitemradio", { name: "None" })).toBeVisible();
      await expect.element(page.getByRole("menuitemradio", { name: "Low" })).toBeVisible();
      await expect.element(page.getByRole("menuitemradio", { name: "Medium" })).toBeVisible();
      await expect.element(page.getByRole("menuitemradio", { name: "High" })).toBeVisible();
    } finally {
      await screen.unmount();
    }
  });

  it("shows Extra High for Grok 4.6 before runtime discovery", async () => {
    const screen = await render(
      <ComposerModelEffortPicker
        provider="grok"
        model={GROK_4_6}
        lockedProvider={null}
        modelOptionsByProvider={{
          claudeAgent: [],
          codex: [],
          cursor: [],
          antigravity: [],
          grok: [{ slug: GROK_4_6, name: "Grok 4.6" }],
          droid: [],
          kilo: [],
          opencode: [],
          pi: [],
        }}
        hideStatusLabel
        onProviderModelChange={vi.fn()}
        threadId={THREAD_ID}
        modelOptions={undefined}
        prompt=""
        onPromptChange={vi.fn()}
      />,
    );

    try {
      const trigger = page.getByRole("button", { name: "Change model and reasoning" });
      await trigger.click();
      await expect.element(page.getByRole("menuitemradio", { name: "Extra High" })).toBeVisible();
    } finally {
      await screen.unmount();
    }
  });

  it("shows Max for Codex Luna before runtime discovery", async () => {
    const screen = await render(
      <ComposerModelEffortPicker
        provider="codex"
        model={CODEX_LUNA}
        lockedProvider={null}
        modelOptionsByProvider={{
          claudeAgent: [],
          codex: [{ slug: CODEX_LUNA, name: "GPT-5.6 Luna" }],
          cursor: [],
          antigravity: [],
          grok: [],
          droid: [],
          kilo: [],
          opencode: [],
          pi: [],
        }}
        hideStatusLabel
        onProviderModelChange={vi.fn()}
        threadId={THREAD_ID}
        modelOptions={undefined}
        prompt=""
        onPromptChange={vi.fn()}
      />,
    );

    try {
      const trigger = page.getByRole("button", { name: "Change model and reasoning" });
      await trigger.click();
      await expect.element(page.getByRole("menuitemradio", { name: "Max" })).toBeVisible();
    } finally {
      await screen.unmount();
    }
  });
});
