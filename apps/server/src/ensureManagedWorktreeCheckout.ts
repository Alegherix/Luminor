import * as fs from "node:fs/promises";
import * as nodePath from "node:path";

import { Effect } from "effect";

import type { GitCoreShape } from "./git/Services/GitCore.ts";

export class ManagedWorktreeCheckoutError extends Error {
  readonly _tag = "ManagedWorktreeCheckoutError";

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "ManagedWorktreeCheckoutError";
  }
}

export type EnsureManagedWorktreeCheckoutInput = {
  readonly projectCwd: string;
  readonly worktreePath: string;
  readonly branch: string | null;
  readonly associatedWorktreeRef: string | null;
  readonly git: Pick<
    GitCoreShape,
    "createWorktree" | "createDetachedWorktree" | "listLocalBranchNames" | "withMutation"
  >;
};

export type EnsureManagedWorktreeCheckoutResult =
  | { readonly kind: "ready" }
  | { readonly kind: "rematerialized" };

const toCheckoutError = (detail: string, cause?: unknown) =>
  new ManagedWorktreeCheckoutError(detail, cause);

const pathExists = (targetPath: string): Effect.Effect<boolean, never> =>
  Effect.tryPromise({
    try: async () => {
      try {
        await fs.access(targetPath);
        return true;
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw cause;
      }
    },
    catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
  }).pipe(Effect.orDie);

/**
 * Returns true when `worktreePath` is a usable linked Git checkout (has a `.git`
 * entry). Empty husks left after `git worktree remove` count as missing.
 */
export const isUsableManagedWorktreeCheckout = (
  worktreePath: string,
): Effect.Effect<boolean> =>
  Effect.gen(function* () {
    if (!(yield* pathExists(worktreePath))) {
      return false;
    }
    return yield* pathExists(nodePath.join(worktreePath, ".git"));
  });

/**
 * Clears a non-checkout directory at the recorded path so `git worktree add`
 * can recreate it. Refuses to delete anything that still looks like a git
 * worktree (has `.git`).
 */
const clearStaleWorktreeHusk = (
  worktreePath: string,
): Effect.Effect<void, ManagedWorktreeCheckoutError> =>
  Effect.gen(function* () {
    if (!(yield* pathExists(worktreePath))) {
      return;
    }
    if (yield* pathExists(nodePath.join(worktreePath, ".git"))) {
      return yield* Effect.fail(
        toCheckoutError(
          `Refusing to clear '${worktreePath}' because it still looks like a Git worktree.`,
        ),
      );
    }
    yield* Effect.tryPromise({
      try: () => fs.rm(worktreePath, { recursive: true, force: true }),
      catch: (cause) =>
        toCheckoutError(`Could not clear stale worktree path '${worktreePath}'.`, cause),
    });
  });

/**
 * Rematerializes a managed worktree that was pruned (archive retention) or
 * otherwise removed while the thread still records `worktreePath`. Prefers the
 * recorded branch when it still exists locally; otherwise falls back to
 * `associatedWorktreeRef` (optionally recreating the branch name).
 */
export const ensureManagedWorktreeCheckout = (
  input: EnsureManagedWorktreeCheckoutInput,
): Effect.Effect<EnsureManagedWorktreeCheckoutResult, ManagedWorktreeCheckoutError> =>
  Effect.gen(function* () {
    if (yield* isUsableManagedWorktreeCheckout(input.worktreePath)) {
      return { kind: "ready" } as const;
    }

    yield* clearStaleWorktreeHusk(input.worktreePath);

    const parentDir = nodePath.dirname(input.worktreePath);
    yield* Effect.tryPromise({
      try: () => fs.mkdir(parentDir, { recursive: true }),
      catch: (cause) =>
        toCheckoutError(`Could not prepare worktree parent '${parentDir}'.`, cause),
    });

    const localBranches = yield* input.git.listLocalBranchNames(input.projectCwd).pipe(
      Effect.mapError((cause) =>
        toCheckoutError(
          `Could not list local branches while rematerializing '${input.worktreePath}'.`,
          cause,
        ),
      ),
    );
    const branch = input.branch?.trim() || null;
    const associatedRef = input.associatedWorktreeRef?.trim() || null;

    yield* input.git
      .withMutation(
        input.projectCwd,
        Effect.gen(function* () {
          if (branch && localBranches.includes(branch)) {
            yield* input.git.createWorktree({
              cwd: input.projectCwd,
              branch,
              path: input.worktreePath,
            });
            return;
          }

          if (associatedRef) {
            yield* input.git.createDetachedWorktree({
              cwd: input.projectCwd,
              ref: associatedRef,
              path: input.worktreePath,
              ...(branch && !localBranches.includes(branch) ? { newBranch: branch } : {}),
            });
            return;
          }

          if (branch) {
            return yield* Effect.fail(
              toCheckoutError(
                `Thread worktree '${input.worktreePath}' is missing and branch '${branch}' is not available locally to rematerialize it.`,
              ),
            );
          }

          return yield* Effect.fail(
            toCheckoutError(
              `Thread worktree '${input.worktreePath}' is missing and no branch or associated ref is available to rematerialize it.`,
            ),
          );
        }),
      )
      .pipe(
        Effect.tapError((cause) =>
          Effect.logWarning("managed worktree rematerialization failed", {
            projectCwd: input.projectCwd,
            worktreePath: input.worktreePath,
            branch,
            associatedWorktreeRef: associatedRef,
            error: cause instanceof Error ? cause.message : String(cause),
          }),
        ),
        Effect.mapError((cause) =>
          cause instanceof ManagedWorktreeCheckoutError
            ? cause
            : toCheckoutError(
                `Failed to rematerialize missing worktree '${input.worktreePath}'.`,
                cause,
              ),
        ),
      );

    if (!(yield* isUsableManagedWorktreeCheckout(input.worktreePath))) {
      return yield* Effect.fail(
        toCheckoutError(
          `Rematerialized worktree '${input.worktreePath}' is still missing after git worktree add.`,
        ),
      );
    }

    yield* Effect.logInfo("rematerialized missing managed worktree for thread resume", {
      projectCwd: input.projectCwd,
      worktreePath: input.worktreePath,
      branch,
      associatedWorktreeRef: associatedRef,
    });

    return { kind: "rematerialized" } as const;
  });
