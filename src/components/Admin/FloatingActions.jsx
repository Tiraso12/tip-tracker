import { useEffect, useRef, useState } from "react";

// One home for the bottom-right floating actions (Floor / Settle / Review
// primaries, ✓ Confirm & Save Shift). Pay out's Edit shift is a header button,
// not a FAB. Every screen that still floats an action over the day's numbers
// positions it through here, so the corner geometry cannot drift between the
// landing and the editor.
//
// Why they move at all: a permanently pinned pill parks on top of whatever
// happens to be under it, and on this app that is money. Measured at 390x844 on
// the closed day, the "✎ Edit shift" box (240,776 131x48) sat squarely on the
// BAR TEAM payout row. Bottom padding alone cannot fix that - padding only buys
// clearance once you have scrolled to the very end of the list, and the rows the
// button covers are the ones in the middle. So the actions get out of the way
// while you scan down the numbers, and come back the moment you flick up.

// True while the reader is dragging *down* through the page body. Reveals again on
// any upward scroll, at either end of the page, and whenever the page is too short
// to scroll at all - so a screen that never scrolls never hides its action.
//
// Only a real scroll GESTURE (wheel or touchmove) is allowed to hide it, and that
// distinction is the whole safety property. Expanding a disclosure like "Who's on
// the floor" scrolls the page as a side effect of the layout growing; a Confirm &
// Save Shift button that vanished because the page reflowed under it would be a far
// worse bug than the overlap this fixes. So layout-induced and programmatic scrolls
// may reveal the action or leave it alone, but never hide it. (Dragging the desktop
// scrollbar raises neither event, which just means the action stays put - the
// behaviour this screen had before.)
function useHideOnScroll(threshold = 96) {
    const [hidden, setHidden] = useState(false);
    const lastY = useRef(0);
    const gestureAt = useRef(-Infinity);

    useEffect(() => {
        lastY.current = window.scrollY;

        // Momentum scrolling keeps firing scroll events after the finger lifts, so
        // the gesture only has to be recent, not simultaneous.
        const GESTURE_WINDOW_MS = 250;
        const markGesture = () => { gestureAt.current = performance.now(); };

        const onScroll = () => {
            const y = window.scrollY;
            const maxY = document.documentElement.scrollHeight - window.innerHeight;
            const delta = y - lastY.current;

            // Ignore sub-pixel jitter and iOS rubber-banding; only a deliberate
            // drag should move the action. lastY deliberately does NOT advance
            // here, so slow scrolls still accumulate to the threshold.
            if (Math.abs(delta) < 6) return;
            lastY.current = y;

            // A page that cannot scroll, or one parked at either end, always shows
            // its action: there is nothing to read out from under it.
            if (maxY <= threshold || y <= threshold || y >= maxY - 4) {
                setHidden(false);
                return;
            }

            // Reading back up always brings it home, gesture or not.
            if (delta < 0) {
                setHidden(false);
                return;
            }

            // Downward, and only when the reader actually drove it.
            if (performance.now() - gestureAt.current < GESTURE_WINDOW_MS) {
                setHidden(true);
            }
        };

        window.addEventListener("wheel", markGesture, { passive: true });
        window.addEventListener("touchmove", markGesture, { passive: true });
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            window.removeEventListener("wheel", markGesture);
            window.removeEventListener("touchmove", markGesture);
            window.removeEventListener("scroll", onScroll);
        };
    }, [threshold]);

    return hidden;
}

// The floating action corner. Children are the pills themselves (a single primary,
// or a Cancel + primary pair) - this owns only the position and the reveal.
export default function FloatingActions({ children }) {
    const hidden = useHideOnScroll();

    return (
        <div
            // `inert` while hidden matters as much as the fade: a faded-out button
            // must not take a tap under a thumb, and must not stay in the tab order
            // or be read out while it is off screen. It covers pointer, focus and
            // assistive tech in one attribute, so the three cannot drift apart.
            inert={hidden}
            className={[
                "fixed bottom-5 right-5 z-30 flex items-center gap-2.5",
                "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
                hidden
                    ? "pointer-events-none translate-y-24 opacity-0"
                    : "translate-y-0 opacity-100",
            ].join(" ")}
        >
            {children}
        </div>
    );
}
