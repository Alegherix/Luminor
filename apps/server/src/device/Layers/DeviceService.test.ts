import { Effect, Layer, ServiceMap } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

import { DeviceService } from "../Services/DeviceService.ts";
import { makeDeviceServiceLayer } from "./DeviceService.ts";

describe("makeDeviceServiceLayer", () => {
  it("builds an android backend with supported=true off darwin", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "luminor-device-service-"));
    try {
      const layer = makeDeviceServiceLayer({
        platform: "linux",
        bootOwnershipPath: path.join(directory, "boot-ownership.json"),
      });
      const service = await Effect.runPromise(
        Effect.scoped(
          Layer.build(layer).pipe(
            Effect.map((services) => ServiceMap.get(services, DeviceService)),
          ),
        ),
      );

      expect(service.supported).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
