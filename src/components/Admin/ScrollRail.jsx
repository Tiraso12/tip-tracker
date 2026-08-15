import { useCallback, useEffect, useRef, useState } from "react";

// A horizontally scrolling strip with edge fades + a "›" cue when there is more
// off-screen. Used by the Settle up group switcher so off-screen groups (and
// their status dots) are discoverable at 390px instead of a blind sideways swipe.
// `fadeFrom` is the colour the edge fades dissolve INTO, so it must be whatever
// the rail is actually sitting on. It defaults to the card surface; the Settle up
// switcher passes the context band's colour, because a white fade over a tinted
// band reads as a white smear rather than as content running off the edge.
function ScrollRail({ children, className = "", role, ariaLabel, depsKey, fadeFrom = "var(--color-surface)" }) {
    const scrollRef = useRef(null);
    const [edges, setEdges] = useState({ left: false, right: false });

    const update = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        const { scrollLeft, scrollWidth, clientWidth } = el;
        const left = scrollLeft > 2;
        const right = scrollLeft + clientWidth < scrollWidth - 2;
        // Only set state when it actually changes, so re-render-driven calls can't loop.
        setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    }, []);

    useEffect(() => {
        update();
        const el = scrollRef.current;
        if (!el) return undefined;
        el.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            el.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [update]);

    // Re-measure when the content changes (e.g. roster size / group count).
    useEffect(() => {
        update();
    }, [update, depsKey]);

    return (
        <div className="relative">
            <div ref={scrollRef} role={role} aria-label={ariaLabel} className={className}>
                {children}
            </div>
            {edges.left ? (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 left-0 w-6"
                    style={{ backgroundImage: `linear-gradient(to right, ${fadeFrom}, transparent)` }}
                />
            ) : null}
            {edges.right ? (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-end"
                    style={{ backgroundImage: `linear-gradient(to left, ${fadeFrom} 45%, transparent)` }}
                >
                    <span className="pr-0.5 text-sm font-semibold text-[var(--color-ink-muted)]">›</span>
                </div>
            ) : null}
        </div>
    );
}

export default ScrollRail;
