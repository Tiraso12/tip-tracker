import ShiftSetupDnd from "../ShiftSetup/ShiftSetupDnd";

// A setup-stage day is what a wrong-date tap + floor touch + autosave leaves
// behind. This is not the closed-day danger zone: no payouts, lighter copy,
// and whoever can accidentally create the day can undo it. Passed in only
// when the shift is already "setup" and the viewer may discard it.
function RemoveEmptySetupDay({ onRemove, removing }) {
    return (
        <div className="mt-6 border-t border-[var(--color-line)] pt-4">
            <p className="m-0 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                This day is not settled. Remove it if it was started by accident - the date
                will look untouched.
            </p>
            <button
                type="button"
                onClick={onRemove}
                disabled={removing}
                className="mt-3 inline-flex h-11 items-center rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
            >
                {removing ? "Removing…" : "Remove this day"}
            </button>
        </div>
    );
}

export function FloorStep({
    allEmployees,
    teams,
    setTeams,
    barTeam,
    setBarTeam,
    runners,
    setRunners,
    onRemoveSetupDay,
    removingSetupDay = false,
}) {
    return (
        // Directly editable, no lock/unlock and no floating Cancel/Done - same for a
        // setup shift (autosaves continuously) and a settled one reached through the
        // top-level "✎ Edit shift" gate (autosave stays off; Review's "Confirm & Save
        // Shift" is the one commit action, see ShiftEditorPanel.jsx).
        <div>
            <ShiftSetupDnd
                allEmployees={allEmployees}
                teams={teams} setTeams={setTeams}
                barTeam={barTeam} setBarTeam={setBarTeam}
                runners={runners} setRunners={setRunners}
                readOnly={false}
            />
            {onRemoveSetupDay ? (
                <RemoveEmptySetupDay onRemove={onRemoveSetupDay} removing={removingSetupDay} />
            ) : null}
        </div>
    );
}
