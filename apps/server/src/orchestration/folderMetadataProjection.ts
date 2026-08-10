import type { OrchestrationEvent } from "@luminor/contracts";
import { Effect, Option } from "effect";

import type { ProjectionRepositoryError } from "../persistence/Errors.ts";
import type { ProjectionFolderRepositoryShape } from "../persistence/Services/ProjectionFolders.ts";

export type FolderMetadataOrchestrationEvent = Extract<
  OrchestrationEvent,
  { type: "folder.created" | "folder.renamed" | "folder.deleted" }
>;

export const applyFolderMetadataProjection = (input: {
  readonly event: FolderMetadataOrchestrationEvent;
  readonly projectionFolderRepository: ProjectionFolderRepositoryShape;
}): Effect.Effect<void, ProjectionRepositoryError> =>
  Effect.gen(function* () {
    switch (input.event.type) {
      case "folder.created":
        yield* input.projectionFolderRepository.upsert({
          folderId: input.event.payload.folderId,
          projectId: input.event.payload.projectId,
          name: input.event.payload.name,
          sortOrder: input.event.payload.sortOrder,
          isPinned: input.event.payload.isPinned ? 1 : 0,
          createdAt: input.event.payload.createdAt,
          updatedAt: input.event.payload.updatedAt,
          deletedAt: null,
        });
        return;
      case "folder.renamed": {
        const existing = yield* input.projectionFolderRepository.getById({
          folderId: input.event.payload.folderId,
        });
        if (Option.isSome(existing)) {
          yield* input.projectionFolderRepository.upsert({
            ...existing.value,
            name: input.event.payload.name,
            updatedAt: input.event.payload.updatedAt,
          });
        }
        return;
      }
      case "folder.deleted": {
        const existing = yield* input.projectionFolderRepository.getById({
          folderId: input.event.payload.folderId,
        });
        if (Option.isSome(existing)) {
          yield* input.projectionFolderRepository.upsert({
            ...existing.value,
            updatedAt: input.event.payload.deletedAt,
            deletedAt: input.event.payload.deletedAt,
          });
        }
      }
    }
  });
