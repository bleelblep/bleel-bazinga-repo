# Account-safety review: <plugin or shared change>

Use [policy v1.1](account-safety.md). Save completed reviews in the reviewed repository's
`docs/account-safety-reviews/`; adjust this relative link when copying. Empty fields are incomplete,
not PASS. A shared-helper change can invalidate multiple plugin reviews.

- Date / reviewer / maintainer:
- Policy version applied (historical reviews require explicit reassessment):
- Repository / plugin ID / version:
- Source revision / identity of uncommitted changes:
- Host versions / dependency revisions:
- Status: UNREVIEWED / BLOCKED / PASS (select one):
- Artifact paths / hashes / distribution locations:
- Related incidents / affected plugins:

## Data flow

Trace entry points through hooks, stores, helpers, native code and dependencies to network/host
actions. Include timers, events, startup and cleanup.
For multi-part sends, record explicit user initiation, visible destination/content/chunk count,
maximum operation size, per-part host validation, serialization and cancellation. Explain reply,
mention and attachment handling and whole-operation completion/partial failure. A delay or user tap
alone is not approval; AS-01/02/05 remain hard boundaries.

| Trigger | Destination / host function | Authentication owner | Account effect | Source evidence |
| --- | --- | --- | --- | --- |
| | | | | |

## Rule findings

For AS-01 through AS-08, record compliant / violation / not applicable with file/line references
and reasoning. Document search scope and limitations. For local-only features, show why no account
write path is reachable. Internal functions and upstream examples are not automatic approval.

## Offline verification

| Scenario | Required invariant | Test / evidence / result |
| --- | --- | --- |
| Success | Each approved action at most once within operation bounds; per-action and whole-operation completion preserved | |
| 401/403/429, challenge, restriction | Zero alternate/follow-up sends | |
| Timeout after possible acceptance | Zero automatic repeats | |
| Re-entry, double taps, interacting hooks | No unintended extra actions or overlapping operations | |
| Stop/logout/account change | Zero late account actions | |
| Missing/changed host API | Disabled plugin path, no raw REST fallback | |
| Draft/destination/mentions/attachments | User intent and error state preserved | |
| Media conversion | Bounded memory, output and concurrency | |

Explain not-applicable rows. Never use real accounts to probe enforcement thresholds.

## Release decision

- Source-to-bundle/ZIP verification:
- Old artifacts and served indexes checked:
- Sanitized diagnostics reviewed:
- Blocking findings / remediation:
- Remaining uncertainties:
- Maintainer decision / rationale:
- Changes requiring re-review:

PASS means policy compliance at this revision, not immunity from Discord enforcement.
