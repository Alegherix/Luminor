import {
  type OrchestrationProject,
  type IssuesListResult,
  type IssuesViewResult,
} from "@luminor/contracts";
import { isValidGitHubRepositoryNameWithOwner } from "@luminor/shared/githubRepository";
import { Effect, Layer, Scope, Semaphore } from "effect";

import { ServerConfig } from "../../config";
import { GitHubCliError } from "../../git/Errors";
import { GitCore } from "../../git/Services/GitCore";
import { GitHubCli, type GitHubCliShape } from "../../git/Services/GitHubCli";
import { ProjectionSnapshotQuery } from "../../orchestration/Services/ProjectionSnapshotQuery";
import { makeKeyedSingleFlightCache } from "../../pullRequests/KeyedSingleFlightCache";
import { liveProjectFromShell } from "../../pullRequests/Layers/PullRequestService";
import {
  indexProjectRepositoryInventories,
  resolveProjectRepositoryInventories,
} from "../../pullRequests/projectRepositoryInventory";
import {
  resolvePreferredGitHubRepositoryInventory,
  type GitHubRepositoryInventory,
} from "../../pullRequests/repositoryResolution";
import { buildIssueComments, buildIssueListEntry, orderIssueListEntries } from "../issues.logic";
import { IssuesService, type IssuesServiceShape } from "../Services/IssuesService";

const GITHUB_REPOSITORY_CACHE_MAX_ENTRIES = 256;
const ISSUE_LIST_CACHE_MAX_ENTRIES = 256;
const ISSUE_ITEM_CACHE_MAX_ENTRIES = 128;
const ISSUE_LIST_LIMIT = 50;

type IssueListError = IssuesListResult["errors"][number];

type IssueListBatch = {
  readonly entries: IssuesListResult["entries"];
  readonly errors: ReadonlyArray<IssueListError>;
};

export interface IssuesServiceDependencies {
  readonly homeDir: string;
  readonly github: GitHubCliShape;
  readonly listProjects: () => Effect.Effect<ReadonlyArray<OrchestrationProject>, unknown>;
  readonly resolveRepositories: (
    project: OrchestrationProject,
  ) => Effect.Effect<GitHubRepositoryInventory, unknown>;
}

function isGlobalGitHubCliError(error: unknown): boolean {
  return (
    error instanceof GitHubCliError &&
    (error.reason === "not-installed" || error.reason === "not-authenticated")
  );
}

function issueListCacheKey(repository: string, state: string): string {
  return `${repository.trim().toLowerCase()}:${state}`;
}

function issueItemCacheKey(repository: string, number: number): string {
  return `${repository.trim().toLowerCase()}#${number}`;
}

export const makeIssuesService = (
  dependencies: IssuesServiceDependencies,
): Effect.Effect<IssuesServiceShape, never, Scope.Scope> =>
  Effect.gen(function* () {
    const githubReadSlots = yield* Semaphore.make(6);
    const withGitHubRead = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      githubReadSlots.withPermits(1)(effect);
    const repositoryCache = yield* makeKeyedSingleFlightCache<GitHubRepositoryInventory, unknown>({
      maxEntries: GITHUB_REPOSITORY_CACHE_MAX_ENTRIES,
      ttlMs: 30_000,
    });
    const viewerCache = yield* makeKeyedSingleFlightCache<string, GitHubCliError>({
      maxEntries: 1,
      ttlMs: 5 * 60_000,
    });
    const listCache = yield* makeKeyedSingleFlightCache<
      IssuesListResult["entries"],
      GitHubCliError
    >({
      maxEntries: ISSUE_LIST_CACHE_MAX_ENTRIES,
      ttlMs: 30_000,
    });
    const itemCache = yield* makeKeyedSingleFlightCache<IssuesViewResult, GitHubCliError>({
      maxEntries: ISSUE_ITEM_CACHE_MAX_ENTRIES,
      ttlMs: 30_000,
    });

    const resolveProjectRepositories = (project: OrchestrationProject) =>
      repositoryCache.get(project.workspaceRoot, dependencies.resolveRepositories(project));

    const loadViewer = () =>
      viewerCache.get(
        "viewer",
        withGitHubRead(dependencies.github.getViewerLogin({ cwd: dependencies.homeDir })),
      );

    const list: IssuesServiceShape["list"] = (input) =>
      Effect.gen(function* () {
        const state = input.state ?? "open";
        const forceRefresh = input.forceRefresh === true;
        const projects = (yield* dependencies.listProjects()).filter(
          (project) =>
            project.deletedAt === null &&
            project.kind === "project" &&
            (input.projectId == null || project.id === input.projectId),
        );
        if (forceRefresh) {
          yield* viewerCache.invalidateAll;
          yield* Effect.forEach(
            projects,
            (project) => repositoryCache.invalidate(project.workspaceRoot),
            { concurrency: "unbounded", discard: true },
          );
        }

        const resolved = yield* resolveProjectRepositoryInventories({
          projects,
          resolve: resolveProjectRepositories,
        });
        const { errors: inventoryErrors, uniqueRepositories } =
          indexProjectRepositoryInventories(resolved);
        if (uniqueRepositories.size === 0) {
          return { viewer: null, entries: [], errors: inventoryErrors };
        }

        const viewer = yield* loadViewer();
        if (forceRefresh) {
          yield* Effect.forEach(
            uniqueRepositories.values(),
            ({ repository }) =>
              listCache.invalidate(issueListCacheKey(repository.nameWithOwner, state)),
            { concurrency: "unbounded", discard: true },
          );
        }

        const batches = yield* Effect.forEach(
          uniqueRepositories.values(),
          ({
            projects: repositoryProjects,
            repository,
          }): Effect.Effect<IssueListBatch, GitHubCliError> => {
            const cwd = repositoryProjects[0]!.workspaceRoot;
            const projectIds = repositoryProjects.map((project) => project.id);
            return listCache
              .get(
                issueListCacheKey(repository.nameWithOwner, state),
                withGitHubRead(
                  dependencies.github.listRepositoryIssues({
                    cwd,
                    repository: repository.nameWithOwner,
                    state,
                    limit: ISSUE_LIST_LIMIT,
                  }),
                ).pipe(
                  Effect.map((batch) =>
                    batch.entries.map((issue) =>
                      buildIssueListEntry({
                        repository: repository.nameWithOwner,
                        issue,
                        projectIds,
                      }),
                    ),
                  ),
                ),
              )
              .pipe(
                Effect.map((entries): IssueListBatch => ({ entries, errors: [] })),
                Effect.catch(
                  (error): Effect.Effect<IssueListBatch, GitHubCliError> =>
                    isGlobalGitHubCliError(error)
                      ? Effect.fail(error)
                      : Effect.succeed({
                          entries: [],
                          errors: repositoryProjects.map((project) => ({
                            projectId: project.id,
                            projectTitle: project.title,
                            message: error.message,
                          })),
                        }),
                ),
              );
          },
          { concurrency: 6 },
        );

        return {
          viewer,
          entries: orderIssueListEntries(batches.flatMap((batch) => batch.entries)),
          errors: [...inventoryErrors, ...batches.flatMap((batch) => batch.errors)],
        };
      });

    const view: IssuesServiceShape["view"] = (input) =>
      Effect.gen(function* () {
        const repository = input.repository.trim();
        if (!isValidGitHubRepositoryNameWithOwner(repository)) {
          return yield* Effect.fail(new Error("Invalid GitHub repository identity."));
        }
        const projects = (yield* dependencies.listProjects()).filter(
          (project) => project.deletedAt === null && project.kind === "project",
        );
        const resolved = yield* resolveProjectRepositoryInventories({
          projects,
          resolve: resolveProjectRepositories,
        });
        const { uniqueRepositories } = indexProjectRepositoryInventories(resolved);
        const match = uniqueRepositories.get(repository.toLowerCase());
        if (!match) {
          return yield* Effect.fail(new Error("GitHub repository does not belong to a project."));
        }
        const cwd = match.projects[0]!.workspaceRoot;
        const projectIds = match.projects.map((project) => project.id);
        return yield* itemCache.get(
          issueItemCacheKey(repository, input.number),
          withGitHubRead(
            dependencies.github.getRepositoryIssue({
              cwd,
              repository: match.repository.nameWithOwner,
              number: input.number,
            }),
          ).pipe(
            Effect.map((issue) => ({
              entry: buildIssueListEntry({
                repository: match.repository.nameWithOwner,
                issue,
                projectIds,
              }),
              comments: buildIssueComments(issue),
            })),
          ),
        );
      });

    return { list, view } satisfies IssuesServiceShape;
  });

export const IssuesServiceLive = Layer.effect(
  IssuesService,
  Effect.gen(function* () {
    const config = yield* ServerConfig;
    const git = yield* GitCore;
    const github = yield* GitHubCli;
    const projection = yield* ProjectionSnapshotQuery;
    return yield* makeIssuesService({
      homeDir: config.homeDir,
      github,
      listProjects: () =>
        projection
          .getShellSnapshot()
          .pipe(Effect.map((snapshot) => snapshot.projects.map(liveProjectFromShell))),
      resolveRepositories: (project) =>
        resolvePreferredGitHubRepositoryInventory(git, project.workspaceRoot),
    });
  }),
);
