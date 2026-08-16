import { useState } from "react";
import ShiftSetupDnd from "../ShiftSetup/ShiftSetupDnd";
import { EditorActionPair } from "./EditorActionPair";

export function FloorStep({
    allEmployees,
    teams,
    setTeams,
    barTeam,
    setBarTeam,
    runners,
    setRunners,
    shiftStatus,
    isSaving,
    onCancel,
    onDoneFloor,
    onGoToReview,
}) {
    const [floorSheetOpen, setFloorSheetOpen] = useState(false);

    return (
        <div className="max-[560px]:flex-1 max-[560px]:flex max-[560px]:flex-col max-[560px]:min-h-0">
            {/* PROTOTYPE v3: identical in-place editor for setup AND settled
                shifts - the redesigned cards are always editable (the entry
                was an explicit "Edit"; autosave is disabled for closed shifts
                so nothing persists until the confirmed save below). */}
            <ShiftSetupDnd
                allEmployees={allEmployees}
                teams={teams} setTeams={setTeams}
                barTeam={barTeam} setBarTeam={setBarTeam}
                runners={runners} setRunners={setRunners}
                readOnly={false}
                onSheetOpenChange={setFloorSheetOpen}
            />
            {/* Floating action pair (shared with Settle up). Cancel leaves edit
                mode WITHOUT saving and returns to the read-only floor view; Done
                commits. For a setup shift Done saves the draft and returns; for a
                settled/paid shift it routes into the EXISTING overwrite-confirmed
                save (Review, with the "Re-saving overwrites the saved payouts
                for {date}" warning + Confirm & Save).
                Nothing is written until that explicit confirm. */}
            {floorSheetOpen ? null : (
                <EditorActionPair
                    onCancel={onCancel}
                    onPrimary={shiftStatus === "closed" ? onGoToReview : onDoneFloor}
                    primaryLabel={isSaving ? "Saving…" : "✓ Done"}
                    busy={isSaving}
                />
            )}
        </div>
    );
}
