# Data Git Hygiene Audit

Date: 2026-09-08

## Purpose

Keep Google Analytics and other production-critical integrations intact while removing the recurring Git slowdown caused by generated data outputs.

## Current Findings

- `git status --short --untracked-files=all` currently reports 2222 changed or untracked entries.
- Generated-data candidates still tracked by Git total 5168 files across `_data/derived`, `public/data`, and scraped-game output areas.
- `_data/derived` alone still has 1918 tracked files.
- `public/data/rankings`, `public/data/top-leaders`, `public/data/top-probables`, and `public/data/standings` together still have 1104 tracked files.
- `.gitignore` already contains rules for generated outputs such as `_data/derived/`, `public/data/rankings/`, and `public/data/top-leaders/`.
- Because many generated files are already tracked, `.gitignore` does not prevent their future modifications from appearing in `git status`.

## Relevant History

- `12a54ead9 feat: serve display derived from R2 and untrack _data/derived` shows an earlier attempt to move display-derived data away from Git.
- `999c90054 Stop tracking generated data cache` adjusted ignore rules.
- `1fb076477 wip: snapshot generated data and local ignore rules` later reintroduced generated data snapshots.
- `54f0917fb fix: restore GA4 tracking` restored Google Analytics after it had been lost.
- `38cedb614 fix: restore Vercel ignore rules` restored deployment ignore behavior.

## Production-Critical Files

These files should be protected during later cleanup phases:

- `app/layout.tsx`
- `components/GoogleAnalytics.tsx`
- `components/AnalyticsWrapper.tsx`
- `.vercelignore`
- `next.config.mjs`
- `app/manifest.ts`
- icon and favicon assets under `app/` and `public/`

Current GA and related production-critical markers:

- GA4 measurement ID: `G-J8EWRCJXYL`
- AdSense client: `ca-pub-5927852752448438`
- Search Console verification: `kKv1BMYikT9gulfJnk8IZvMreBFL9TURx42GS1nituI`

## Phase 1 Guard

Added `scripts/guard_analytics.mjs` and `npm run guard:analytics`.

This guard verifies:

- `components/GoogleAnalytics.tsx` exists.
- `app/layout.tsx` imports and renders `GoogleAnalytics`.
- `app/layout.tsx` imports and renders `AnalyticsWrapper`.
- GA4 ID, AdSense client, and Search Console verification remain present.
- The GA script loader and explicit page-view behavior remain present.

## Phase 2 Guard

Added `scripts/guard_no_generated_tracked.mjs` and these package scripts:

- `npm run guard:no-generated-tracked`
- `npm run guard:no-generated-tracked:enforce`

The default command is audit-only while the repository still contains tracked generated data. It reports blocked generated-data paths without failing, so it can be used immediately during cleanup planning.

The `:enforce` command fails if blocked generated-data paths are still tracked. Use it after Phase 3 removes those paths from Git tracking.

Blocked generated-data pathspecs:

- `_data/derived`
- `public/data/rankings`
- `public/data/top-leaders`
- `_data/scraped_games/raw*`
- `_data/scraped_games/_meta`
- `_data/unknown_players`

Review-only pathspecs that need runtime-source confirmation before untracking:

- `public/data/top-probables`
- `public/data/standings`
- `_data/scraped_games/canonical`

## Next Cleanup Candidates

Start with generated data that should not be part of the deployed source:

- `_data/derived/`
- `_data/scraped_games/raw*`
- `_data/scraped_games/_meta/pipeline_*`
- `public/data/rankings/`
- `public/data/top-leaders/`

Handle these only after confirming the runtime source of truth:

- `public/data/top-probables/`
- `public/data/standings/`
- `_data/scraped_games/canonical/`

## Safety Rule For Later Phases

Do not mix generated-data untracking with UI, analytics, metadata, Vercel, or routing changes in the same commit.

## Phase 3 Untracking

Removed the blocked generated-data paths from Git tracking with `git rm --cached` while leaving the local files in place.

Untracked from Git:

- `_data/derived`
- `public/data/rankings`
- `public/data/top-leaders`
- `_data/scraped_games/raw_sportsnavi`
- `_data/scraped_games/raw_sportsnavi_text`
- `_data/scraped_games/raw_sportsnavi_stats`
- `_data/scraped_games/raw_yahoo_text`
- `_data/scraped_games/_meta`
- `_data/unknown_players`

Verification after untracking:

- `npm run guard:no-generated-tracked:enforce` passes.
- `npm run guard:analytics` passes.
- `git ls-files` for blocked generated-data pathspecs returns 0 files.
- Local generated files remain on disk; only Git tracking was removed.

Still review-only:

- `_data/scraped_games/canonical`: 763 tracked files.
- `public/data/standings`: 208 tracked files.
- `public/data/top-probables`: 1 tracked file.
