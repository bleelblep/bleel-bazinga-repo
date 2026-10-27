# Plugin development instructions

Before plugin work read `docs/account-safety.md` and `docs/coding-rules.md`; before distribution also
read `docs/building-and-releasing.md`. In the full workspace read `../CLAUDE.md` for build conventions.
Follow AS-01–AS-08 and the release review gate for JS, native code, bridges, shared helpers,
dependencies and packaged artifacts.

**The goal is to eliminate known risky behaviour; no rules can promise that Discord will never flag an account.**

AS-01/02/05 are central: no Discord credential access, parallel authenticated requests or alternate
sends/retries after rejection/uncertain delivery. Policy v1.1 permits review of bounded, explicitly
user-initiated multi-part sends through verified host workflows, with real validation, completion,
duplicate prevention, cancellation and account/channel binding. No unattended account automation,
activity spoofing or capability bypasses. User taps and internal APIs alone are insufficient.
Keep unsupported features local or disabled. Review shared code, dependencies and packaged artifacts;
private ZIPs and local phone servers count as distribution. Policy amendments do not grant PASS.

Plugins are added a few at a time, each with its account-safety review in
`docs/account-safety-reviews/`. This repo is an unofficial stop gap: plugins are made usable here,
then polished and submitted to the Valenced community repository.
