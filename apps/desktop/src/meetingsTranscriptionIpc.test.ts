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
}));

import { pickTranscriptionEnvironmentPath } from "./meetingsTranscriptionIpc";

describe("pickTranscriptionEnvironmentPath", () => {
  beforeEach(() => {
    showOpenDialogMock.mockReset();
  });

  it("returns the selected command or venv path", async () => {
    const owner = { id: 1 } as BrowserWindow;
    showOpenDialogMock.mockResolvedValue({
      canceled: false,
      filePaths: ["/home/me/.local/bin/missiondeck-transcribe"],
    });

    await expect(pickTranscriptionEnvironmentPath(owner)).resolves.toBe(
      "/home/me/.local/bin/missiondeck-transcribe",
    );
    expect(showOpenDialogMock).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        properties: ["openFile", "openDirectory"],
      }),
    );
  });

  it("returns null when the picker is cancelled", async () => {
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });

    await expect(pickTranscriptionEnvironmentPath(null)).resolves.toBeNull();
  });
});
