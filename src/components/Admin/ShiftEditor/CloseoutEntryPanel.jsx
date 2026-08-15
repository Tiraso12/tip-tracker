import { useCallback, useEffect, useRef, useState } from "react";
import { fmtMoney } from "../shiftEditorUtils";

// Tracks whether a scrolling element has more content below the fold, so the
// panel can say so. Returns false the moment the last pixel is reached, and
// re-measures on resize and on content changes (a disclosure opening changes the
// answer without any scrolling happening).
function useHasMoreBelow(ref) {
    const [more, setMore] = useState(false);

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const next = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
        setMore((prev) => (prev === next ? prev : next));
    }, [ref]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        measure();
        el.addEventListener("scroll", measure, { passive: true });
        window.addEventListener("resize", measure);
        // The fields themselves change height (contracts / point-split disclosures),
        // so watching the scroller alone would miss the case that matters most.
        const ro = new ResizeObserver(measure);
        ro.observe(el);
        if (el.firstElementChild) ro.observe(el.firstElementChild);
        return () => {
            el.removeEventListener("scroll", measure);
            window.removeEventListener("resize", measure);
            ro.disconnect();
        };
    }, [measure, ref]);

    return more;
}

// The single fixed-height entry panel. Its chrome (head + padded body) is identical for
// every group, so the panel is the same height for two teams or six - the whole point of
// the switcher. Body content is supplied by the caller per selected group.
//
// On a phone the panel FILLS the screen down to the floating action's clearance and its
// BODY is what scrolls; the page behind it does not. The money fields used to run off the
// bottom of a shrink-wrapped panel, so reaching Cash or Covers meant scrolling the whole
// page and pushing the group switcher - the control that says which team's money you are
// typing - off the top. On a phone the group name and its pool live on the selected
// switcher pill, which is pinned above and carries the exact figure.
//
// The panel draws NO box of its own on a phone: the editor Card is the only frame, so a
// money field is inside two frames instead of three and gains its width back. On desktop
// the box stays - there the panel sits beside other content and needs its own edge.
export function CloseoutEntryPanel({ group, children }) {
    const bodyRef = useRef(null);
    const hasMoreBelow = useHasMoreBelow(bodyRef);

    return (
        <div className="border border-[var(--color-line-strong)] rounded-[var(--radius-md)] bg-[var(--color-surface)] overflow-hidden shadow-[0_6px_20px_rgba(15,23,42,0.05)] max-[560px]:border-0 max-[560px]:rounded-none max-[560px]:shadow-[none] max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
            {/* The selected switcher pill directly above already names the group, so
                printing it again in the head said the same word twice on one screen, and
                on a phone that head is hidden outright. The name stays in the accessibility
                tree here - outside the head, so it survives that hiding - because which
                pill is selected is not something a screen reader user landing inside the
                panel already knows. */}
            <span className="sr-only">{group.name}</span>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-line)] max-[560px]:hidden">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[11px] uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
                        {group.sub}
                    </span>
                </div>
                <div className="flex items-center gap-2.5 flex-none">
                    <span className="font-mono tabular-nums text-[12.5px] text-[var(--color-ink-soft)] whitespace-nowrap">
                        {group.poolLabel} <b className="text-[var(--color-ink)] font-semibold">{fmtMoney(group.pool)}</b>
                    </span>
                    {group.status === "funded" ? (
                        <span
                            className="h-[18px] w-[18px] rounded-full bg-[var(--color-success)] text-white inline-flex items-center justify-center text-[11px] leading-none"
                            title="Money in"
                            aria-label="Money in"
                        >
                            ✓
                        </span>
                    ) : group.status === "sales-only" ? (
                        <span
                            className="h-[18px] w-[18px] rounded-full bg-[var(--color-warning)] text-white inline-flex items-center justify-center text-[11px] font-bold leading-none"
                            title="Sales entered - tip pool still $0"
                            aria-label="Sales entered, tip pool still $0"
                        >
                            !
                        </span>
                    ) : null}
                </div>
            </div>
            {/* The scroller and its cue share a relative box so the cue can sit on the
                panel's bottom edge without scrolling away with the fields. */}
            <div className="relative max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
                <div
                    ref={bodyRef}
                    className="p-4 max-[560px]:px-0 max-[560px]:pt-3.5 max-[560px]:pb-14 max-[560px]:flex-1 max-[560px]:min-h-0 max-[560px]:overflow-y-auto max-[560px]:overscroll-contain"
                >
                    {children}
                </div>
                {/* "There is more money below this fold." The panel now runs to the bottom
                    of the card, which reads as an ending, so without this the last field
                    on screen looks like the last field there is - and a Runners Fee nobody
                    scrolls to is a Runners Fee nobody enters. Matches the horizontal cue on
                    the group switcher: a fade the content dissolves into, plus a chevron.
                    Hidden the instant the end is reached, and never shown on desktop, where
                    the body does not scroll. */}
                {hasMoreBelow ? (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-x-0 bottom-0 flex h-12 items-end justify-center"
                        style={{ backgroundImage: "linear-gradient(to top, var(--color-surface) 45%, transparent)" }}
                    >
                        {/* A chip, not a bare glyph: at the foot of a white panel a lone
                            chevron in muted grey is exactly what the eye skips. The border
                            gives it an edge to catch on without it reading as a button -
                            it is `pointer-events-none`, the panel itself is what scrolls. */}
                        <span className="mb-2 inline-flex h-6 items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-soft)] shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                            More <span aria-hidden="true" className="text-[11px] leading-none">⌄</span>
                        </span>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
