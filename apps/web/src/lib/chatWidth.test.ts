import { describe, expect, it } from "vitest";

import { DEFAULT_CHAT_WIDTH, getChatWidthCssVariables, normalizeChatWidthMode } from "./chatWidth";

describe("chatWidth", () => {
  it("defaults to the restored 1200px chat column", () => {
    expect(DEFAULT_CHAT_WIDTH).toBe("standard");
    expect(getChatWidthCssVariables()["--app-chat-max-width"]).toBe("75rem");
  });

  it("normalizes unknown values to the default mode", () => {
    expect(normalizeChatWidthMode("wide")).toBe("wide");
    expect(normalizeChatWidthMode("full")).toBe("full");
    expect(normalizeChatWidthMode("invalid")).toBe(DEFAULT_CHAT_WIDTH);
    expect(normalizeChatWidthMode(undefined)).toBe(DEFAULT_CHAT_WIDTH);
  });

  it("maps each mode to a chat column max width", () => {
    expect(getChatWidthCssVariables("standard")["--app-chat-max-width"]).toBe("75rem");
    expect(getChatWidthCssVariables("wide")["--app-chat-max-width"]).toBe("75rem");
    expect(getChatWidthCssVariables("full")["--app-chat-max-width"]).toBe("100%");
  });
});
