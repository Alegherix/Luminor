import { Data, Effect, Semaphore } from "effect";

const DEFAULT_MIN_PORT = 49_152;
const DEFAULT_MAX_PORT = 65_535;

export class PreviewPortAllocationError extends Data.TaggedError("PreviewPortAllocationError")<{
  readonly message: string;
}> {}

export interface PreviewPortReservation {
  readonly port: number;
  readonly release: Effect.Effect<void>;
}

export interface PreviewPortAllocator {
  readonly allocate: Effect.Effect<PreviewPortReservation, PreviewPortAllocationError>;
}

export interface PreviewPortAllocatorOptions {
  readonly minPort?: number;
  readonly maxPort?: number;
}

export function makePreviewPortAllocator(
  isPortAvailableOnLoopback: (port: number) => Effect.Effect<boolean>,
  options: PreviewPortAllocatorOptions = {},
): Effect.Effect<PreviewPortAllocator> {
  return Effect.gen(function* () {
    const minPort = options.minPort ?? DEFAULT_MIN_PORT;
    const maxPort = options.maxPort ?? DEFAULT_MAX_PORT;
    const candidateCount = maxPort - minPort + 1;
    const lock = yield* Semaphore.make(1);
    const reservations = new Set<number>();
    let nextPort = minPort;

    const allocate = lock.withPermits(1)(
      Effect.gen(function* () {
        for (let attempt = 0; attempt < candidateCount; attempt += 1) {
          const port = nextPort;
          nextPort = port === maxPort ? minPort : port + 1;
          if (reservations.has(port)) continue;
          if (!(yield* isPortAvailableOnLoopback(port))) continue;

          reservations.add(port);
          return {
            port,
            release: lock.withPermits(1)(
              Effect.sync(() => {
                reservations.delete(port);
              }),
            ),
          } satisfies PreviewPortReservation;
        }

        return yield* Effect.fail(
          new PreviewPortAllocationError({
            message: "Could not find an available preview port.",
          }),
        );
      }),
    );

    return { allocate } satisfies PreviewPortAllocator;
  });
}
