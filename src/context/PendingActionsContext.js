import { createContext, useCallback, useContext, useMemo, useState } from "react";

export const PendingActionsContext = createContext(null);

// Used when a component renders outside any provider (isolated tests, or a panel
// mounted on its own). The action still runs; it just does not drive a cue.
const NO_PENDING_ACTIONS = {
    isPending: false,
    beginPendingAction: () => () => {},
};

/**
 * Owns the ref-counted registry of in-flight slow actions for one screen.
 *
 * The owning screen calls this hook, provides the result through
 * <PendingActionsContext.Provider>, and renders one shared progress cue driven
 * by `isPending`. Any descendant that starts slow work calls
 * `beginPendingAction()` and invokes the returned release when the work settles.
 */
export function usePendingActionsState() {
    const [pendingCount, setPendingCount] = useState(0);

    // Ref-counted on purpose: a save that hands straight over to a refetch keeps
    // the cue continuous instead of blinking off between the two phases.
    const beginPendingAction = useCallback(() => {
        setPendingCount((count) => count + 1);

        let released = false;
        return () => {
            if (released) return;
            released = true;
            setPendingCount((count) => Math.max(0, count - 1));
        };
    }, []);

    return useMemo(
        () => ({ isPending: pendingCount > 0, beginPendingAction }),
        [pendingCount, beginPendingAction]
    );
}

export function usePendingActions() {
    return useContext(PendingActionsContext) || NO_PENDING_ACTIONS;
}
