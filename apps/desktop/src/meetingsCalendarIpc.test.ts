import type { BrowserWindow } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { showOpenDialogMock } = vi.hoisted(() => ({
  showOpenDialogMock: vi.fn(),
}));

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: showOpenDialogMock,
  },
  ipcMain: {
    removeHandler: vi.fn(),
    handle: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

import { pickInstalledClientJsonPath } from "./meetingsCalendarIpc";

describe("pickInstalledClientJsonPath", () => {
  beforeEach(() => {
    showOpenDialogMock.mockReset();
  });

  it("returns the selected JSON path", async () => {
    const owner = { id: 1 } as BrowserWindow;
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ["/tmp/client.json"] });

    await expect(pickInstalledClientJsonPath(owner)).resolves.toBe("/tmp/client.json");
    expect(showOpenDialogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        properties: ["openFile"],
        filters: [{ name: "OAuth client JSON", extensions: ["json"] }],
      }),
    );
  });

  it("returns null when the picker is cancelled", async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

    await expect(pickInstalledClientJsonPath(null)).resolves.toBeNull();
  });
});
