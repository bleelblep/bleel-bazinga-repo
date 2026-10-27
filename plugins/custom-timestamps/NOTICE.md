## Third-party code

This plugin is a Revenge Next port of **Custom Timestamps** by **Fiery**, from
[fierdetta/custom-timestamps](https://github.com/fierdetta/custom-timestamps), by way of the
classic-Revenge port in
[bleelblep/revengeplugins](https://github.com/bleelblep/revengeplugins).

The formatting modes (calendar / relative / ISO 8601 / custom format string) and the approach of
rewriting timestamps at `RowManager.generate` are from the original.

Upstream is released under the **Unlicense** — a public domain dedication — so there is no
licence obligation here. The attribution is courtesy.

Notably different in this port: the date formatter is self-contained. The original relies on
moment.js via `revenge.discord.common.moment`, which does not exist on Revenge Next — see
[`docs/coding-rules.md`](../../docs/coding-rules.md).
