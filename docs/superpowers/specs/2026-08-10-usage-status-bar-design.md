# Usage status bar — design

Date: 2026-08-10
Status: approved (design), implementation plan pending

## Goal

Add a global bottom status bar to Luminor that shows provider usage at a glance —
one segment per signed-in, usage-capable provider — with a popover listing every
provider's windows, reset countdowns, a refresh action, and a link into
Settings → Usage. Add Grok as a usage-capable provider, porting the credential
and billing logic from Orca (`github.com/stablyai/orca`, MIT).

Reference for the target shape: Orca's `src/renderer/src/components/status-bar/`
(`StatusBar.tsx`, `UsageRosterPanel.tsx`) and `src/main/rate-limits/`
(`grok-auth.ts`, `grok-fetcher.ts`).

## Current state

Luminor already owns a usage stack:

- Server: `apps/server/src/providerUsage/` — a fetcher registry
  (`registry.ts`) with fetchers for `codex`, `claudeAgent`, `cursor`. Adding a
  provider is a one-file change plus a descriptor update.
- Contracts/shared: `packages/shared/src/providerMetadata.ts` carries a
  per-provider `usage` block (`signInCommand`, `learnMoreHref`);
  `packages/shared/src/providerUsage.ts` derives `PROVIDER_USAGE_PROVIDERS` from
  it. `grok` currently has `usage: null`.
- Web: `useProviderUsageSummary(provider)` merges three sources (server
  all-provider usage, server local snapshot, OpenUsage HTTP), and
  `lib/providerUsageDisplay.ts` derives display rows in **remaining** semantics
  with a pace marker. Surfaces: chat-header chip
  (`ProviderUsageMenuControl` in `ChatHeader.tsx`), `BranchToolbar`,
  `EnvironmentUsageSection`, Settings → Usage.

There is no status bar or app-level footer today.

## Decisions

| Decision | Choice |
| --- | --- |
| Bar scope (v1) | Usage segments only. No resource/ports/update segments. |
| Providers shown | Every usage-capable provider with a readable credential (Claude, Codex, Cursor, and the new Grok). Signed-out providers are hidden, not shown as "Sign in" rows. |
| Chat-header chip | Removed. The bar replaces it. `EnvironmentUsageSection` and Settings → Usage keep using `ProviderUsageMenuControl` / `ProviderUsagePanelContent`. |
| Percentage semantics | Luminor's existing **remaining** semantics (`48% left`, 10 %/25 % tone thresholds, pace marker). No `used` mode, no user-facing toggle. |
| Popover contents | One row per provider, refresh button, "Usage details" link to Settings → Usage. No Detailed/Compact density toggle (YAGNI). No "Manage Accounts" — Luminor has no multi-account switching. |
| Placement | Global, in the `_chat` app shell, visible in every view. Hidden entirely when no provider qualifies. |
| Data flow | Approach A: extract the merge core into a pure module, add a multi-provider hook that shares one all-provider query. |

### Rejected alternatives

- **Loop `useProviderUsageSummary` per provider.** 4 providers × 3 queries, and
  the same all-provider response parsed four times. Fails "performance first".
- **Server-side aggregation RPC.** One poll and minimal client logic, but adds
  contract surface in `packages/contracts` and duplicates presentation logic
  server-side while Settings → Usage stays on the old path. Overkill for v1.

## Part 1 — Grok usage (server)

New `apps/server/src/providerUsage/providers/grok.ts` implementing
`ProviderUsageFetcher`, ported from Orca's `grok-auth.ts` + `grok-fetcher.ts`:

**Credential read.** Read `${GROK_HOME ?? ~/.grok}/auth.json`. The file is a map
of issuer-keyed entries; prefer a key equal to `https://auth.x.ai` or prefixed
`https://auth.x.ai::`, else fall back to any entry. Fields used: `key` (access
token), `expires_at` (freshness), `user_id`, `email`, `team_id`.

**Billing request.** `GET https://cli-chat-proxy.grok.com/v1/billing?format=credits`
with headers `Authorization: Bearer <key>`, `X-XAI-Token-Auth: xai-grok-cli`,
`Accept: application/json`, and `x-userid: <user_id>` when present. 10 s timeout.
Base URL overridable via `GROK_CLI_CHAT_PROXY_BASE_URL`.

**Window mapping.**

- `creditUsagePercent` (from `config` or the top level) → weekly window,
  `windowDurationMins: 10080`, `resetsAt` = `currentPeriod.end ?? billingPeriodEnd`.
- A response whose `currentPeriod.type === 'USAGE_PERIOD_TYPE_WEEKLY'` and whose
  period bounds equal `billingPeriodStart`/`billingPeriodEnd`, but with
  `creditUsagePercent` absent, means 0 % used (protobuf zero omission), not
  "no data".
- No weekly credits → fall back to `GET /billing` and derive a 30-day window
  (`windowDurationMins: 43200`) from `used / monthlyLimit`, where both parse as
  finite numbers and `monthlyLimit > 0`.

**Status mapping** onto Luminor's existing snapshot model:

- No auth file → needs-auth, detail from `providerUsageNeedsAuthDetail("grok")`.
- Stale access token → needs-auth with a hint to run `grok` on the host machine.
  Luminor never refreshes the token itself; the Grok CLI owns refresh.
- HTTP 401/403 → error, "Grok usage request unauthorized".
- HTTP 200 without any usable quota → hidden/unavailable, not an error. A
  signed-in account with no quota must not paint a permanent alert.
- Unreadable or invalid `auth.json` → error with a generic message that does not
  echo the path or local username.

**Registration.** Add `grok: grokUsageFetcher` to
`apps/server/src/providerUsage/registry.ts`, and set
`usage: { signInCommand: "grok", learnMoreHref: … }` on the `grok` descriptor in
`packages/shared/src/providerMetadata.ts`. That single change enrolls Grok in
`PROVIDER_USAGE_PROVIDERS`, Settings → Usage, and the new bar.

**Reset formatting.** Port Orca's `formatResetDuration` /
`formatResetCountdown` / `getResetCountdownNextTickDelay` into
`packages/shared/src/usageResetCountdown.ts`, and route the existing
`formatRateLimitResetCountdown` in `apps/web/src/lib/rateLimits.ts` through it so
countdown copy has one source and ticks on unit boundaries instead of on the
usage poll.

## Part 2 — Data flow (web)

**`apps/web/src/lib/providerUsageMerge.ts` (new, pure).** Move the merge core out
of `useProviderUsageSummary`: an explicit live failure is authoritative and
blocks fallbacks; otherwise merge thread-derived account limits, the live
snapshot, the server local snapshot, and the OpenUsage snapshot via
`mergeProviderRateLimits`; pick `usageLines` live → local → OpenUsage; carry the
`usageNotice` detail. Signature:
`mergeProviderUsage({ provider, liveSnapshot, localSnapshot, openUsageSnapshot, accountRateLimits })`.

**`useProviderUsageSummary` becomes a thin wrapper** over that module. Its public
return shape does not change, so Settings, `BranchToolbar`, and
`EnvironmentUsageSection` are untouched.

**`apps/web/src/hooks/useAllProviderUsageSummaries.ts` (new).**

- One `serverAllProviderUsageQueryOptions({ provider: null })` (60 s interval)
  covering every provider.
- Per provider in `PROVIDER_USAGE_PROVIDERS`: the server local snapshot only for
  `codex` (needs `codexHomePath`), OpenUsage only where
  `openUsageProviderIdForProvider` resolves an id. The provider list is static,
  so these are fixed hook calls — no conditional hooks.
- Returns `ReadonlyArray<{ provider, rows: ProviderUsageDisplayRow[], notice, isLoading, isSignedOut }>`,
  rows via `deriveProviderUsageDisplayRows`.
- Providers with no rows whose snapshot reports needs-auth are omitted from the
  result, per the "hide signed-out providers" decision.
- Exposes `refresh()` invalidating the all-provider, local-snapshot, and
  OpenUsage query keys — wired to the popover's refresh button.

**`apps/web/src/hooks/useUsageResetTick.ts` (new).** Wraps
`getResetCountdownNextTickDelay`: a single `setTimeout` scheduled to the next
minute (or hour, past a day) boundary across all visible windows, instead of one
interval per row.

## Part 3 — UI

**`apps/web/src/components/statusBar/UsageStatusBar.tsx` (new).** The footer. One
segment per provider: `ProviderIcon` plus one `remaining%` pair per window,
labeled by the existing `normalizeRateLimitLabel` (`5h`, `Weekly`, …) rather
than Orca's own short labels, each with a thin bar tinted by
`PROVIDER_USAGE_TONE_CLASS_NAME`, and the reset countdown for the tightest
window. The whole bar acts as a `MenuTrigger`.

**`apps/web/src/components/statusBar/UsageRosterPanel.tsx` (new).** The popover,
Orca's structure on Luminor primitives (`Menu`, `ComposerPickerMenuPopup`): a
title row ("Usage") with the refresh button; one row per provider sorted
worst-first (icon, name, `Resets in 4h 51m`, a bar + percentage per window); a
closing "Usage details" row that navigates to `_chat.settings` section
`usage:usage`.

**`apps/web/src/lib/usageRosterRowState.ts` (new).** Port of Orca's
`getUsageRosterRowState`, adapted to `isProviderUsageSnapshotNonOk`. Shared by
the bar and the popover so both classify loading / usage / unavailable / error
identically.

**Mounting.** `ChatRouteLayout` in `apps/web/src/routes/_chat.tsx` wraps its
current output in a column flex with `<UsageStatusBar />` last. This requires
`mainContentShell` to move from `h-svh` to `h-full min-h-0` and the
`SidebarProvider` to become `flex-1 min-h-0`; otherwise the bar is pushed below
the viewport. The bar renders nothing at all when no provider qualifies.

**Chip removal.** Drop `ProviderUsageMenuControl` from
`apps/web/src/components/chat/ChatHeader.tsx` (and its import). The component
itself stays for `EnvironmentUsageSection`.

**Attribution.** Files that are direct ports of Orca code carry a short MIT
copyright header (Lovecast Inc.) — an allowed exception to the
no-source-comments rule.

## Part 4 — Tests

Vitest, run with `bun run test`.

- `apps/server/src/providerUsage/providers/grok.test.ts` — credits response →
  weekly window; omitted `creditUsagePercent` with a confirmed weekly period →
  0 %; monthly fallback via `/billing`; 401 → error; stale token → needs-auth
  hint; malformed `auth.json` → error without leaking the path.
- `apps/web/src/lib/providerUsageMerge.test.ts` — live beats local; a non-ok live
  snapshot blocks fallbacks. Locks today's behavior ahead of the refactor.
- `apps/web/src/hooks/useAllProviderUsageSummaries.test.tsx` — one shared
  all-provider query; signed-out providers filtered out; `refresh()` invalidates
  the expected keys.
- `apps/web/src/lib/usageRosterRowState.test.ts` and
  `packages/shared/src/usageResetCountdown.test.ts` — cases ported from Orca's
  corresponding tests.
- `apps/web/src/components/statusBar/UsageStatusBar.test.tsx` — a segment per
  signed-in provider; the bar is hidden when empty; the popover opens and lists
  providers worst-first.

## Verification

`bun fmt`, `bun lint`, `bun typecheck`, and `bun run test` must pass. Manual
check in the Electron dev app: the bar shows Claude, Codex, and Grok segments;
the popover countdown ticks; the refresh button refetches; Settings → Usage lists
Grok.

## Out of scope

- Non-usage status-bar segments (resources, ports, update status).
- A usage history / details view of our own — "Usage details" links to the
  existing Settings → Usage panel.
- Multi-account switching and account management.
- Grok token refresh (the Grok CLI owns it).
- `used` vs `left` percentage preference.
