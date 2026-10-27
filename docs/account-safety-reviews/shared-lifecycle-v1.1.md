# Shared changelog/report — fresh v1.1 evidence

2026-10-27 / coding agent. This supporting record is not a plugin inventory entry or release approval.
Both complete active-repository files were reread; Native files are byte-identical and Dev files
match after CRLF-to-LF normalization, verified separately on this date.

| File | Active and Native SHA256 | Dev SHA256 |
| --- | --- | --- |
| shared/changelog.tsx | 5413FC696ECD7D388B5F5ABD10C870513739808D3FAAD8558098899C580E25BC | AD0DFE8B723C0DD231881774D1C86E8AD8165F0D276AF1C3F332C0CE77B319EC |
| shared/report.ts | 68535261D9389F7C637CD1CDFB75376C349D2C39952AF0C84B2D8517A3ED64B0 | 120F5BECD56F5F80DE670E55AF4764FE3EC67736B7AFF8DC138314B44C2C8BB1 |

AS-07 local-lifecycle blocker: setupChangelog starts checkForUpdate at line 127; it awaits storage.get
at 140 then can write at 146/153. Cleanup at 129–132 has no generation invalidation. Stop while the
read is pending therefore permits a subsequent local storage write. This is not account automation.
Reporter seen set at lines 22,30–36 has no retention bound; queue cap 20 does not bound that set.
AS-08: error message/stack are preserved at 47–56 without sanitization. Whether this discloses private
data depends on callers, so do not infer message/credential disclosure for every consumer.

Other rules: these helpers register local settings/alerts, read/write local plugin storage and report
errors; no account transport or credential access identified. Imported UI/host dependencies remain
unverified. Supporting evidence may establish a local blocker for individually verified callers, but
does not clear or replace their remaining source/native/account-action/artifact reviews.

Required checks after remediation: defer storage.get, stop helper, resolve read, assert no subsequent
write/UI update; repeat start/stop generations; many distinct errors must stay within an explicit cap;
sanitize representative private error inputs. No tests or code fixes claimed. Exact artifacts and
maintainer approval pending. Shared/helper/host changes invalidate this evidence.
