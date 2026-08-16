import ShiftSetupDnd from "../ShiftSetup/ShiftSetupDnd";

export function FloorStep({
    allEmployees,
    teams,
    setTeams,
    barTeam,
    setBarTeam,
    runners,
    setRunners,
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
        </div>
    );
}
