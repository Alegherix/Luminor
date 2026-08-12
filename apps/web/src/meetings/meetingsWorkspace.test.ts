import { describe, expect, it } from "vitest";

import {
  createIdleMeetingsWorkspace,
  meetingsSidebarSections,
  selectedMeetingSession,
} from "./meetingsWorkspace";

describe("createIdleMeetingsWorkspace", () => {
  it("starts with no selected meeting and empty today, live, and ended sections", () => {
    const workspace = createIdleMeetingsWorkspace();

    expect(selectedMeetingSession(workspace)).toBeNull();
    expect(meetingsSidebarSections(workspace)).toEqual({
      live: [],
      today: [],
      ended: [],
    });
  });
});
