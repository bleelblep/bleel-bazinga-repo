# Valence account-safety policy

Version 1.1 — 2026-10-27. Owner: Valence maintainers.

**The goal is to eliminate known risky behaviour; no rules can promise that Discord will never flag an account.**

Mandatory for this repository and its forks.
Applies to JS, native code, bridges, shared helpers, dependencies and packaged builds. Private
repositories, experimental features, user consent and upstream examples are not exemptions.
Existing implementations are not grandfathered in. These are project engineering restrictions,
not a claim that Discord approves client modifications.

## Mandatory rules

### AS-01 — No Discord account credential access

Never extract, read, intercept, store, log, export or forward the user's Discord token, session
cookie, password or other authentication secret. This includes auth stores, request interception,
native storage, WebViews and helpers. Never ask users to paste credentials or bundle bot secrets.
Separate OAuth integrations need their own scoped authorization review and cannot impersonate the
logged-in client or bypass these rules.

### AS-02 — No parallel authenticated Discord client

Never construct or replay authenticated account requests through fetch, XHR, native HTTP, sockets,
proxies or low-level Discord REST helpers. A helper supplying the token is still a bypass.
For permitted actions, preserve the verified normal high-level host workflow: let Discord own
authentication, upload negotiation, request IDs, validation, rate limits and challenges.
Internal host functions are not blanket permission to automate an account.
If the integration is unavailable, keep the feature local or disabled; never fall back to raw REST.
Anonymous public-asset downloads must stay credential-free, validate destinations and redirects,
and have bounded input, time and resource usage.

### AS-03 — Bound explicitly user-initiated operations

Do not initiate account activity from startup, reconnects, incoming events, AI decisions or
unattended schedules. An explicitly user-initiated, finite multi-part send may be reviewed without
removing the feature solely because it creates multiple messages. Show its destination and scope
(including chunk count and final content) before initiation, enforce a reviewed maximum operation
size, and serialize its host actions with at most one active operation. Waiting between approved
parts does not itself prohibit the operation; delays are not evidence of enforcement safety.
Each part must use a verified normal host workflow and real host limits. Stop the whole operation
on rejection or uncertain delivery; never resume it automatically. Bind work to the initiating
account/channel and cancel it on stop, logout or account change. A toggle or user tap alone does
not establish these requirements. This exception does not authorize bulk deletion, auto-replies,
scheduled sends or automatic quest completion; those require a separate policy decision.
Local formatting, previews and notifications may run automatically if they cause no account activity
and do not mutate host state that later feeds a write path.

### AS-04 — Preserve the user's action and host contract

Keep the destination, content, attachments, reply and mention choices visible and user-controlled.
Prefer preparing a draft or ordinary attachment preview for the user to send. Do not create extra
messages or writes outside the explicitly approved operation described in AS-03. A normal attachment
workflow can involve multiple HTTP requests; this rule concerns intended account effects, not an
arbitrary request count. For multi-part sends, verify per-part reply, attachment and mention semantics;
do not silently drop or duplicate them. Preserve unsent text without overwriting newer drafts.
Call each intended host action at most once. Preserve its receiver, arguments, return value, promise,
failure state and cancellation contract. Never report success while work is pending or call the
original again from a catch after it may have taken effect. Prevent duplicate submissions and hook
re-entry; review interacting hooks together. A multi-part operation needs its own truthful completion
and partial-failure state; returning the first part's success as completion of the whole is invalid.

### AS-05 — Stop on rejection or uncertain delivery

No plugin-added retries or alternate sends around the host workflow. On rate limits, authentication
or permission failures, challenges or account restrictions, stop plugin follow-up actions and let
the host handle the condition. Respect its blocked state.
After a timeout or lost response, delivery is unknown: never automatically resend, switch endpoints,
convert the attachment into a fallback link or change transport. Preserve draft/error state and
allow inspection through the host UI. Do not mislabel every 403 as an attachment permission problem.
Never suppress, automatically solve or route around a challenge.

### AS-06 — No capability, activity or detection bypasses

Never force Nitro, permissions, entitlements, sticker-sendability or upload-limit checks to pass.
Never turn a locked or rejected action into an alternate send to circumvent those checks.
Local formatting, chunk planning and display changes are not capability bypasses by themselves.
Every resulting action must still pass real host validation; do not raise the host message-length
validator to route an oversized draft into a splitter. Use a separate verified composition workflow.
No fabricated quest progress, viewing time, gameplay, streaming, engagement or rewards.
No forged headers, fingerprints, telemetry or nonces to conceal plugin-originated traffic.
Random delays, a "human pace," user taps and internal APIs do not legitimize prohibited behaviour.
There is no approved safe request rate for self-bots.

### AS-07 — Bound local work and cancel it cleanly

Before media allocation, bound input bytes, decoded dimensions/pixels, frames, output size and
concurrent jobs. Bound caches and use safe writes. Cancel pending work on stop, logout or account
change. Late conversion results must not send to a captured account/channel. Never persist jobs
for automatic replay. Local conversion is not permission to upload.
If host compatibility cannot be verified, disable the plugin path while preserving normal host
behaviour where possible.

### AS-08 — Accurate, private diagnostics

Record build/host version, operation stage, sanitized error category and status where available.
Never dump auth stores, headers, raw request/response bodies, messages or user files into logs,
error reports or AI prompts. Redact incident evidence. Explain what a feature actually does and
never claim "sent" before confirmation.

## Required review before merge or distribution

Use [the review template](account-safety-review-template.md). Local phone servers and private ZIPs
count as distribution. Record evidence for the exact source revision and built artifact.

1. Trace entry points through shared/native/dependency code to all network calls and host actions,
   including indirect store mutations. Record trigger, destination, authentication owner and effects.
2. Search credential access, HTTP and REST helpers, account-action functions, timers, loops, events,
   spoofing and capability patches. Inspect aliases, dynamic URLs, bridges and bundles. Keyword
   searches supplement review; no matches do not prove safety.
3. Mark violations or unresolved account-action uncertainty **BLOCKED**. Warnings and private-only
   status are not fixes. A feature must comply with all AS rules before shipping.
4. For account-action changes, use offline fake transports/host actions to verify: each explicitly
   intended action at most once, within the approved operation bound; preserved whole-operation and
   per-action completion; zero alternate or remaining sends after 401/403/429, challenges or
   restrictions; zero automatic repeats after uncertain delivery; no multiplication through double
   taps or hook re-entry; no late actions after stop/logout/account change; and no raw REST fallback
   when APIs change. Verify destination, draft, mentions and attachments remain correct. Local-only
   changes need a data-flow justification rather than irrelevant network tests.
5. Document supported host versions. Re-review relevant plugin, dependency, shared-helper or host
   changes. Never remove version boundaries just to allow installation.
6. Inspect generated output and ZIP contents against reviewed source; record hashes. Check old ZIPs
   and served indexes for retired code. Source deletion does not withdraw artifacts or installations.
7. A maintainer records PASS/BLOCKED with evidence and limitations. PASS is policy compliance at
   that revision, not immunity from enforcement.

## Existing plugins and enforcement status

These documents establish mandatory review gates, not a runtime sandbox or automated CI scanner.
They do not certify the current inventory. Track plugins as UNREVIEWED, BLOCKED or PASS; absent
reviews mean UNREVIEWED. Review before next distribution. Prioritize upload helpers, bulk actions
and event/timer-driven account actions. These are review priorities, not findings about uninspected
code.

Known prohibited paths must be disabled or removed before release, including hidden settings and
legacy/private fallbacks. Policy amendments require version/date, rationale, affected reviews and
a maintainer decision; implementation changes cannot silently waive rules.

## Incident response

1. For credible associated account warnings, mark affected builds BLOCKED, stop distribution,
   arrange a disabling update and advise users to disable the feature. Index removal is not revocation.
2. Preserve source revisions, artifact hashes, dates and redacted reports. Do not reproduce warnings
   on users' accounts or probe detection thresholds.
3. Separate reported symptoms, code facts and causal hypotheses. Record missing evidence.
4. Review ports and shared helpers; retire served artifacts as well as fixing source. Preserve
   incident evidence; history retention and artifact withdrawal are separate tasks.
5. Resume only after prohibited paths are gone, offline regression and artifact checks pass, and
   a maintainer records a new review. Never promise an account appeal outcome.

## Basis

### Version 1.1 amendment and maintainer decision — 2026-10-27

The maintainer approved this amendment: prevent direct authenticated uploads and alternate sends
while retaining features that can meet explicit bounds and host contracts. AS-01 (credentials),
AS-02 (parallel authenticated sending) and AS-05 (rejection/uncertain-delivery handling) are the
central incident-prevention boundaries. AS-04/07/08 retain duplicate prevention, completion,
cancellation, resource bounds and private diagnostics as engineering requirements. AS-03 now
permits review of bounded, explicitly user-initiated multi-part sending; AS-06 distinguishes local
composition from bypassing real capabilities. This is not a general permission for unattended
account automation. Do not present a safe send rate or host API usage as proof of immunity.

Reviews relying on a blanket multi-action prohibition must be reassessed against the actual
workflow. Existing v1.0 reviews remain historical evidence, not newly issued v1.1 approvals. No
plugin is automatically promoted to PASS, and no source or artifact remediation is implied by this
amendment.

- [Discord self-bot policy](https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots), checked 2026-10-27: normal user-account automation outside OAuth2/bot APIs is forbidden.
- [Discord Community Guidelines](https://discord.com/guidelines), checked 2026-10-27: sections 13–15 prohibit spam, self-bots/user-bots and inauthentic engagement.

The detailed controls above are Valence's engineering rules, not Discord's unpublished detection rules.
