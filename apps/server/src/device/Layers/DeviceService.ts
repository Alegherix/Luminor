/**
 * DeviceServiceLive - one DeviceManager for the server process.
 *
 * @module device/Layers/DeviceService
 */
import { Effect, Layer } from "effect";
import { homedir } from "node:os";
import * as path from "node:path";

import { makeBootOwnershipStore } from "../bootOwnership.ts";
import { DeviceManager } from "../DeviceManager.ts";
import { AndroidEmulatorBackend } from "../android/AndroidEmulatorBackend.ts";
import { IosSimulatorBackend } from "../IosSimulatorBackend.ts";
import { DeviceService, type DeviceServiceShape } from "../Services/DeviceService.ts";

export interface DeviceServiceLiveOptions {
  readonly platform?: NodeJS.Platform;
  /** Where to remember this run's boots; omit to remember nothing. */
  readonly bootOwnershipPath?: string;
}

/**
 * Where the boot record lives, derived the way the server derives its state
 * directory so both land in the same place under a custom LUMINOR_HOME.
 *
 * Resolved here rather than taken from ServerConfig because this layer is built
 * before that config is in scope, and getting the path wrong only costs the
 * crash-recovery, not the feature.
 */
function defaultBootOwnershipPath(): string {
  const baseDir = process.env.LUMINOR_HOME?.trim() || path.join(homedir(), ".luminor");
  const stateDir = path.join(baseDir, process.env.VITE_DEV_SERVER_URL ? "dev" : "userdata");
  return path.join(stateDir, "device-boot-ownership.json");
}

export function makeDeviceServiceLayer(options: DeviceServiceLiveOptions = {}) {
  return Layer.effect(
    DeviceService,
    Effect.gen(function* () {
      const platform = options.platform ?? process.platform;
      const backend =
        platform === "darwin"
          ? new IosSimulatorBackend({ platform })
          : new AndroidEmulatorBackend();
      const bootOwnership = makeBootOwnershipStore(
        options.bootOwnershipPath ?? defaultBootOwnershipPath(),
      );
      const manager = new DeviceManager({ backend, bootOwnership });

      yield* Effect.promise(async () => {
        const reclaimed = await manager.reclaimOrphanedBoots().catch(() => []);
        if (reclaimed.length > 0) {
          console.info(
            `[device] shut down ${reclaimed.length} device(s) left booted by a previous ` +
              `Synara run: ${reclaimed.join(", ")}`,
          );
        }
      });

      yield* Effect.addFinalizer(() => Effect.promise(() => manager.dispose()));
      return { supported: true, manager } satisfies DeviceServiceShape;
    }),
  );
}

export const DeviceServiceLive = makeDeviceServiceLayer();
