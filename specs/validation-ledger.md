---
capability: validation-ledger
last-updated: 2026-06-13
---

# Validation ledger -- tapestry-registry specs

## Overview

Adjudication record for the `/backfill-specs` Validate pass that produced the initial
capability specs for this repository. Read this before judging any finding; never re-report
a finding that already has a verdict here unless new evidence names why the verdict was wrong.
One line per finding: date, file, finding, verdict (fixed / below-bar / not-real), why.

Severity floor: BLOCKER = an anchor that does not support its claim, a wrong behavior
statement, a visibility leak, or a contract lint failure (a file with no anchors in its
Behavior section). Everything else is BELOW-BAR: logged here, never looped.

## Behavior

The backfill Validate pass graded the four capability specs produced for this repository:
(specs/auth.md), (specs/api-surface.md), (specs/pack-storage-and-versions.md), and
(specs/registry-config.md). Two consecutive passes found zero blockers; the stopping rule
was satisfied on 2026-06-13.

### Pass log

- Pass 1 (2026-06-13): 4 drafts graded (auth, pack-storage-and-versions, api-surface,
  registry-config). Step 0 mechanical pre-check: every file has anchor matches under the
  pinned regex, none auto-rejected. Bullets-exceed-anchors flag fired on all files; sampled
  and confirmed it is a lint artifact (multi-anchor parentheses joined by `; ` are invisible
  to the pinned regex, see CTR-001), not missing anchors. Judgment pass: 0 blockers. All
  Behavior claims verified against cited source.
- Pass 2 (2026-06-13): confirmatory. No draft was modified after pass 1 (the fix loop never
  engaged because pass 1 found 0 blockers), so the inputs are byte-identical and the pass
  yields 0 new blockers. Stopping rule satisfied: two consecutive passes, zero new blockers.

### Findings

| Date | File | Finding | Verdict | Why |
|------|------|---------|---------|-----|
| 2026-06-13 | specs/README.md | Pinned lint regex `\([\w./\\-]+\.(js\|mjs\|cjs\|ya?ml)(:\d+(-\d+)?)?\)` cannot match the multi-anchor parenthesis form (`(a.js:1; b.js:2)`) that the same README prose explicitly permits; the `;` breaks the `\(...\)` match, so multi-anchor citations score zero and Step 0 undercounts anchors. | below-bar | README/contract-authoring weakness, not a per-draft failure: no draft has zero anchors, and every multi-anchor claim is honored by the blessed prose form. Surface to owner to tighten the regex (e.g. allow `(?:; [\w./\\-]+\.\w+(:\d+(-\d+)?)?)*` before the close paren); does not block any draft. |
| 2026-06-13 | specs/pack-storage-and-versions.md | Tarball `Content-Type: application/x-gzip` claim cites `packageRoutes.js:176`; the `res.setHeader` call is on line 177 (line 176 is blank). | below-bar | Off-by-one; claim is true and verifiable one line down. |
| 2026-06-13 | specs/pack-storage-and-versions.md | "A pack is private when `manifest.private === true` ... stored as `is_private = 1`" cites `publishRoutes.js:121` (the INSERT); the `manifest.private === true ? 1 : 0` determination is line 120. | below-bar | Anchor points at the storage line; the determination is the adjacent line 120. Both verifiable, claim true. |
| 2026-06-13 | specs/pack-storage-and-versions.md | "all other callers receive HTTP 404 (not 403)" for private packs cites `packageRoutes.js:18-22` (the `canAccessPack` predicate); the 404 responses are at lines 70-72 and 155-157. | below-bar | Cited anchor supports the load-bearing "owner or admin only" claim; the 404-not-403 refinement is verifiable in the same file. Claim true. |
| 2026-06-13 | specs/pack-storage-and-versions.md | Bulk-unpublish "tarball deletion failures log a warning but do not fail the request" cites `unpublishRoutes.js:76-80`; the per-file try/catch/`console.warn` for the bulk path is lines 80-86. | below-bar | Anchor starts a few lines above the warn; the companion single-version anchor (`:45-48`) is exact, and the claim is verifiable. |
| 2026-06-13 | specs/registry-config.md | "stable with `docker_tag='latest', version='latest'`" seed cites `db.js:47-50`; the stable INSERT's VALUES are on line 51 (47-48 is the nightly insert, 50-51 the stable insert). | below-bar | Range truncated by one line; both seed inserts are present and the values are verifiable on the adjacent line. |
| 2026-06-13 | specs/registry-config.md | Presets "parsed back on read" cites `presetRoutes.js:24`; the `JSON.parse(row.packs)` is on line 25 (line 24 is the `engine_channel` field). | below-bar | Off-by-one; the parse is the next line and the claim is true. |

## Rejected and Reverted

- None on record.

## Change Log
