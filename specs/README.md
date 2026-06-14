# Tapestry Registry -- specs

Capability specs for the Tapestry registry. Each file describes one system's current behavior,
known constraints, and change history. This directory is the canonical, public source of truth
for how each system behaves now -- a fresh agent or contributor answers "how does X behave?"
from the relevant file alone.

## Index

| Capability | File | Last Updated |
|------------|------|--------------|
| auth | [auth.md](auth.md) | 2026-06-13 |
| pack-storage-and-versions | [pack-storage-and-versions.md](pack-storage-and-versions.md) | 2026-06-13 |
| api-surface | [api-surface.md](api-surface.md) | 2026-06-13 |
| registry-config | [registry-config.md](registry-config.md) | 2026-06-13 |

## Contract summary

Each capability spec has four required sections: Overview, Behavior, Rejected and Reverted,
Change Log. Change records live in `specs/changes/` and use the frontmatter fields `release:`
(the version that shipped it) and `specs:` (capability files touched).

Hotfixes, regressions, and dependency bumps owe no change record. Tombstones on any reversal
of shipped behavior are mandatory.

A capability spec is current if its Change Log references the latest shipped change record
that names it in `specs:`.

## Format rules (mechanically linted)

- Behavior claims carry inline anchors in exactly one form: `(repo-relative/path/File.ext:123)`,
  where the line part may be a single line `:123` or a range `:123-145`, and may be omitted only
  for whole-file claims. Several anchors may share one set of parentheses, joined by `; `. A test
  name in the same parentheses also counts. Lint pattern (the gate IS this regex, keep them in
  sync): `\([@\w./\\-]+\.(js|mjs|cjs|ya?ml)(:\d+(-\d+)?)?[^)]*\)`. A file with no matches in its Behavior
  section fails validation outright.
- An empty Rejected and Reverted section contains the single line `- None on record.` under the
  heading (the heading itself is always present).
- Change Log is a one-line-per-record list, newest first: `- YYYY-MM-DD [slug](changes/...)`.
  Not a table.
