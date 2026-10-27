# Plugin technical notes

The coding rules that code comments cite by number are in [Coding rules](./coding-rules.md).

## Catch Up

`/catchup` sends a transcript of `<@authorId>: message` lines to AI Core's provider with the
prompt in `js/lib/summarise.ts`. Mentions inside messages stay as raw `<@id>`. The model refers to
people only by copying those mentions. `js/lib/mentions.ts` replaces any `<@id>` that was not in
the transcript with "someone", so a mistyped id never renders as a mention of a stranger. The
summary is a clientside ephemeral message, so its mentions never ping.

