import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { Effect, Exit } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
  ensureManagedWorktreeCheckout,
  isUsableManagedWorktreeCheckout,
  ManagedWorktreeCheckoutError,
} from "./ensureManagedWorktreeCheckout.ts";
import type { GitCoreShape } from "./git/Services/GitCore.ts";

const temporaryRoots: string[] = [];

async function makeTempRoot(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function mockGit(overrides: {
  readonly localBranches?: ReadonlyArray<string>;
  readonly createWorktree?: GitCoreShape["createWorktree"];
  readonly createDetachedWorktree?: GitCoreShape["createDetachedWorktree"];
}): Pick<
  GitCoreShape,
  "createWorktree" | "createDetachedWorktree" | "listLocalBranchNames" | "withMutation"
> {
  return {
    listLocalBranchNames: () => Effect.succeed([...(overrides.localBranches ?? [])]),
    withMutation: (_cwd, effect) => effect,
    createWorktree:
      overrides.createWorktree ??
      (() => Effect.die(new Error("createWorktree should not be called"))),
    createDetachedWorktree:
      overrides.createDetachedWorktree ??
      (() => Effect.die(new Error("createDetachedWorktree should not be called"))),
  };
}

describe("ensureManagedWorktreeCheckout", () => {
  it("returns ready when the worktree already has a .git entry", async () => {
    const root = await makeTempRoot("luminor-ensure-wt-ready-");
    const worktreePath = path.join(root, "caaf", "luminor");
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.writeFile(path.join(worktreePath, ".git"), "gitdir: /tmp/repo/.git/worktrees/x\n");

    const createWorktreeCalls: unknown[] = [];
    const result = await Effect.runPromise(
      ensureManagedWorktreeCheckout({
        projectCwd: root,
        worktreePath,
        branch: "feature",
        associatedWorktreeRef: null,
        git: mockGit({
          localBranches: ["feature"],
          createWorktree: (input) => {
            createWorktreeCalls.push(input);
            return Effect.succeed({ worktree: { path: input.path!, branch: input.branch } });
          },
        }),
      }),
    );

    expect(result).toEqual({ kind: "ready" });
    expect(createWorktreeCalls).toEqual([]);
  });

  it("rematerializes a missing worktree from an existing local branch", async () => {
    const root = await makeTempRoot("luminor-ensure-wt-branch-");
    const worktreePath = path.join(root, "caaf", "luminor");
    await fs.mkdir(path.join(root, "caaf"), { recursive: true });

    const createWorktreeCalls: Array<{ path: string | null | undefined; branch: string }> = [];
    const result = await Effect.runPromise(
      ensureManagedWorktreeCheckout({
        projectCwd: path.join(root, "repo"),
        worktreePath,
        branch: "luminor/research-polished-animations",
        associatedWorktreeRef: null,
        git: mockGit({
          localBranches: ["main", "luminor/research-polished-animations"],
          createWorktree: (input) =>
            Effect.gen(function* () {
              createWorktreeCalls.push({ path: input.path, branch: input.branch });
              yield* Effect.promise(async () => {
                await fs.mkdir(input.path!, { recursive: true });
                await fs.writeFile(
                  path.join(input.path!, ".git"),
                  "gitdir: /tmp/repo/.git/worktrees/rebuilt\n",
                );
              });
              return { worktree: { path: input.path!, branch: input.branch } };
            }),
        }),
      }),
    );

    expect(result).toEqual({ kind: "rematerialized" });
    expect(createWorktreeCalls).toEqual([
      { path: worktreePath, branch: "luminor/research-polished-animations" },
    ]);
    expect(await Effect.runPromise(isUsableManagedWorktreeCheckout(worktreePath))).toBe(true);
  });

  it("rematerializes from associatedWorktreeRef when the branch is gone", async () => {
    const root = await makeTempRoot("luminor-ensure-wt-ref-");
    const worktreePath = path.join(root, "dead", "luminor");
    const detachedCalls: Array<{
      ref: string;
      path: string | null | undefined;
      newBranch?: string;
    }> = [];

    const result = await Effect.runPromise(
      ensureManagedWorktreeCheckout({
        projectCwd: path.join(root, "repo"),
        worktreePath,
        branch: "luminor/missing-branch",
        associatedWorktreeRef: "abc123",
        git: mockGit({
          localBranches: ["main"],
          createDetachedWorktree: (input) =>
            Effect.gen(function* () {
              detachedCalls.push({
                ref: input.ref,
                path: input.path,
                ...(input.newBranch ? { newBranch: input.newBranch } : {}),
              });
              yield* Effect.promise(async () => {
                await fs.mkdir(input.path!, { recursive: true });
                await fs.writeFile(
                  path.join(input.path!, ".git"),
                  "gitdir: /tmp/repo/.git/worktrees/ref\n",
                );
              });
              return {
                worktree: {
                  path: input.path!,
                  branch: input.newBranch ?? null,
                  ref: input.ref,
                },
              };
            }),
        }),
      }),
    );

    expect(result).toEqual({ kind: "rematerialized" });
    expect(detachedCalls).toEqual([
      { ref: "abc123", path: worktreePath, newBranch: "luminor/missing-branch" },
    ]);
  });

  it("fails clearly when neither branch nor ref can rematerialize", async () => {
    const root = await makeTempRoot("luminor-ensure-wt-fail-");
    const worktreePath = path.join(root, "gone", "luminor");

    const exit = await Effect.runPromise(
      Effect.exit(
        ensureManagedWorktreeCheckout({
          projectCwd: path.join(root, "repo"),
          worktreePath,
          branch: "luminor/does-not-exist",
          associatedWorktreeRef: null,
          git: mockGit({ localBranches: ["main"] }),
        }),
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (!Exit.isFailure(exit)) return;
    const failure = String(exit.cause);
    expect(failure).toContain("ManagedWorktreeCheckoutError");
    expect(failure).toContain("is not available locally");
  });

  it("clears an empty husk without .git before rematerializing", async () => {
    const root = await makeTempRoot("luminor-ensure-wt-husk-");
    const worktreePath = path.join(root, "husk", "luminor");
    await fs.mkdir(worktreePath, { recursive: true });
    await fs.writeFile(path.join(worktreePath, "stale.txt"), "leftover");

    expect(await Effect.runPromise(isUsableManagedWorktreeCheckout(worktreePath))).toBe(false);

    await Effect.runPromise(
      ensureManagedWorktreeCheckout({
        projectCwd: path.join(root, "repo"),
        worktreePath,
        branch: "feature",
        associatedWorktreeRef: null,
        git: mockGit({
          localBranches: ["feature"],
          createWorktree: (input) =>
            Effect.gen(function* () {
              yield* Effect.promise(async () => {
                await fs.access(input.path!).then(
                  () => {
                    throw new Error(`expected husk cleared at ${input.path}`);
                  },
                  () => undefined,
                );
                await fs.mkdir(input.path!, { recursive: true });
                await fs.writeFile(
                  path.join(input.path!, ".git"),
                  "gitdir: /tmp/repo/.git/worktrees/husk\n",
                );
              });
              return { worktree: { path: input.path!, branch: input.branch } };
            }),
        }),
      }),
    );

    expect(await Effect.runPromise(isUsableManagedWorktreeCheckout(worktreePath))).toBe(true);
  });

  it("exports ManagedWorktreeCheckoutError for callers", () => {
    const error = new ManagedWorktreeCheckoutError("boom");
    expect(error._tag).toBe("ManagedWorktreeCheckoutError");
    expect(error.message).toBe("boom");
  });
});
