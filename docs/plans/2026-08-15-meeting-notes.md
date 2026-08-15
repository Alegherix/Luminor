# Meeting Notes — Master Plan

Date: 2026-08-15
Orchestrator: Claude (Fable 5) in Luminor
Base branch: `main`

## Goal

Give the meetings feature a complete note-taking experience:

1. Take notes **during** a meeting (a dedicated notes surface while joined — right panel or bottom input; final UX decided by the UI agent within the constraints below).
2. **Persist** those notes per meeting session, following the existing meetings-summary persistence pattern.
3. **Read and edit** notes after the meeting in the review surface (the "Anteckningar" tab currently shows mock data).
4. Feed notes into the downstream flows (open-in-chat prompt, summary context).

## Current state

- `apps/web/src/meetings/` — full meetings workspace: join (embed/external), recording, transcription, summary. Electron-gated (`isElectron`) except the review prototype.
- `apps/web/src/routes/_chat.meetings.index.tsx` — routes between `MeetingsEmbedCanvas` (joined), `MeetingsTranscriptReader` (ended), `MeetingsIdleCanvas` (idle), and `MeetingReviewPrototype` (`?prototype=review`).
- `apps/web/src/meetings/prototype/MeetingReviewPrototype.tsx` — review UI with tabs Översikt / Transkription / Anteckningar, driven by mock `PROTOTYPE_MEETINGS` in `scenarios.ts`; zustand store in `prototypeStore.ts`.
- Persistence patterns to reuse:
  - `meetingsSummary.ts` — `MeetingsSummaryPersist` interface (`writeSummary`/`readSummary`), Electron impl in `desktopMeetingsSummary.ts`.
  - `useThreadNotesAutosave.ts` (chat environment) — debounced autosave hook; `ThreadNotes` contract in `packages/contracts/src/orchestration.ts` (16 384 char cap).
- UI convention: all open/close toggles must use `apps/web/src/lib/disclosureMotion.ts` / `DisclosureRegion`.

## Architecture decisions

- **Persistence follows the summary pattern**: a `MeetingsNotesPersist` port (`readNotes(sessionId)` / `writeNotes(sessionId, markdown)`), desktop (Electron) implementation next to `desktopMeetingsSummary.ts`, plus a browser fallback (localStorage or in-memory) so the review prototype works outside Electron.
- **Autosave mirrors `useThreadNotesAutosave`**: debounced, per-session, markdown text. Extract shared debounce-autosave logic if duplication would otherwise appear (maintainability rule).
- **Notes are markdown text**, capped (reuse or mirror the 16 384-char approach).
- **UI slices decide their own layout** (right panel vs. bottom input vs. both) but must: use the shared disclosure motion, not block the embed canvas, survive leave/rejoin, and autosave on every edit.

## Slices

### S1 — Notes domain + persistence (codex gpt-5.6-sol, effort high)
- `apps/web/src/meetings/meetingsNotes.ts`: notes domain module — `MeetingsNotesPersist` port, load/save orchestration, debounced autosave helper, char cap, error handling on failed writes.
- `apps/web/src/meetings/desktopMeetingsNotes.ts`: Electron persist impl (same mechanism as `desktopMeetingsSummary.ts`).
- Browser fallback persist for non-Electron (prototype/review use).
- `useMeetingNotes(sessionId)` hook exposing `{ notes, setNotes, status }` for the UI slices.
- Unit tests mirroring `meetingsSummary.test.ts` / `useThreadNotesAutosave` coverage.
- **Deliverable is the API surface the UI slices build on** — keep it small and typed.

### S2 — In-meeting notes UI (Claude Opus 5, effort high)
- Notes surface available while joined (`MeetingsEmbedCanvas` state in the route). Layout choice free: right side-panel, bottom drawer, or floating composer — must use `disclosureMotion.ts`/`DisclosureRegion` for its open/close.
- Uses `useMeetingNotes(sessionId)` from S1. Autosaves while typing; shows subtle save state.
- Keyboard-friendly; does not steal focus from the meeting embed unexpectedly; `motion-reduce` respected via the shared module.
- Component tests for open/close + autosave wiring.

### S3 — Review notes integration (Claude Opus 5, effort high)
- The "Anteckningar" tab in the review surface shows the real persisted notes for the selected meeting, editable after the meeting, with empty state when none exist.
- Wire `MeetingsTranscriptReader` (ended-meeting view) to the same notes so post-meeting editing works outside the prototype too.
- Keep prototype mock scenarios working (fallback when no persisted notes exist for a mock meeting).
- Component tests.

### S4 — Downstream integration (codex gpt-5.6-sol, effort high)
- `meetingsOpenInChat.ts`: include persisted notes in the open-in-chat prompt when present.
- `meetingsSummary.ts`: offer notes as additional context to summarization when present.
- Tests updated/added.

## Waves & dependencies

- **Wave 1:** S1 alone (everything depends on its API).
- **Wave 2:** S2 + S3 + S4 in parallel, each in its own worktree, based on the integration branch containing S1.
- File-ownership boundaries: S2 owns the new in-meeting component + route wiring for the joined state; S3 owns prototype/ + `MeetingsTranscriptReader`; S4 owns `meetingsOpenInChat.ts` + `meetingsSummary.ts`. Overlap only in imports from S1's module.

## Integration & merge strategy

1. Baseline commit on `main` of the meetings prototype WIP (needed so worktree threads can base on it).
2. Integration branch `meeting-notes-integration` in a temp worktree.
3. After each wave: merge thread branches into the integration worktree, resolve conflicts, run `bun fmt`, `bun lint`, `bun typecheck`, `bun run test` (never `bun test`).
4. When green: merge `meeting-notes-integration` into `main`, remove temp worktree.

## Verification

- Full workspace checks once at the end (fmt/lint/typecheck) + Vitest suite.
- Non-Electron smoke: review prototype at `/meetings?prototype=review` renders and notes tab edits/persists via fallback.

## Risks

- Worktree threads copy unrelated dirty files from the main checkout — each thread is instructed to leave them uncommitted.
- Parallel UI slices could both touch the meetings route; boundaries assigned above, conflicts resolved at integration.
- Electron-only paths can't be runtime-verified headlessly; rely on unit tests + the browser fallback path.
