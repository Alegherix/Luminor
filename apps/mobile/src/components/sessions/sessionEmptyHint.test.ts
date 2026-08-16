import { describe, expect, it } from "vitest";

import { strings } from "../../strings";
import { sessionEmptyHint } from "./sessionEmptyCopy";

describe("sessionEmptyHint", () => {
  it("explains the connection state without inventing terminal rows", () => {
    expect(sessionEmptyHint("closed")).toBe(strings.sessionsUi.disconnectedHint);
    expect(sessionEmptyHint("connecting")).toBe(strings.sessionsUi.connectingHint);
    expect(sessionEmptyHint("incompatible")).toBe(strings.sessionsUi.incompatibleHint);
    expect(sessionEmptyHint("open")).toBeNull();
  });
});
