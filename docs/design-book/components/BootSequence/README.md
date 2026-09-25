# BootSequence

The authorisation terminal Gallery opens on: a boot log, an ASCII orbital idle, and a smartcard prompt, framed top and bottom by the session's classification.

The screen is `surface-100` edge to edge with banners in `class-top-secret` — the session banner is the highest level the operator is cleared for, not the level of any record. The wordmark is `display` at 46px with the build number beside it in `stamp` on `ink-300`; this is the only screen where `display` appears.

**Boot log.** Three columns: timestamp in `data-sm` on `ink-300`, message in `data-md` uppercase, verdict in `data-sm` coloured by severity. The line in flight sets its message in `accent-300` and carries the four-frame spinner. Lines do not scroll away; the log fills downward and the screen is sized to hold it.

**Progress.** One `ascii` bar, wider than the component default so it reads across the column, with the percentage in `accent-300`. Only one bar on the screen.

**Orbital idle** is three ASCII frames at 900 ms, in `glyph-navy` with the primary in `accent-300`, `ascii` type at 13px so the frames register exactly. It is decoration that carries the system's subject and nothing else — keep it static under reduced-motion.

**Authorisation panel** is a standard panel at 560px: operator and clearance are read-only fields, the PIN field holds focus on load and shows the `focus` ring. `AUTHORIZE` is the screen's single primary button.

**Do.** Show the node, system and timestamp as a footnote in `data-xs` on `ink-400`. Keep the whole screen on one view — boot never scrolls.

**Do not.** Do not put a logo mark, a gradient or a starfield behind the terminal, and do not hold the operator at a progress bar with no log behind it.
