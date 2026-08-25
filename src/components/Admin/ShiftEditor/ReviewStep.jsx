import FloatingActions from "../FloatingActions";
import { Spinner } from "../../ui";
import { fmtMoney } from "../shiftEditorUtils";
import { CalculatedPayoutReview } from "./CalculatedPayoutReview";
import { FixJump } from "./FixJump";

// A locked Settle up once ended in a full-width "Review payouts →" row, itself the
// successor to a "Calculate Payouts →" primary. Both are gone. Nothing here calculates -
// payouts follow the data now - and the Day Rail directly above already reaches Review
// from any step, so the row spent a whole row of a phone screen on a second way to do
// what the rail does. The running "Paid out" figure it also carried went with it: the
// per-pool breakdown was always on Review, which is one tap away.

// Review when the inputs cannot produce a complete calculation. Showing the reasons is
// the whole job: the alternative - a confident total built from half the money - is the
// one failure this screen exists to prevent. Each reason is the validator's own wording,
// and the two jumps go to where the missing thing is actually entered.
function ReviewNotReady({ blockers = [], hasFloorStaff = false, onFixMoney, onFixFloor }) {
    return (
        <div className="space-y-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-4">
                <div className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="text-[var(--color-warning)]">⚠</span>
                    <div className="space-y-1.5">
                        <strong className="block text-sm text-[var(--color-ink)]">
                            No payouts to review yet
                        </strong>
                        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                            Payouts follow the floor plan and the money you enter. These are still
                            missing, so there is no total to check:
                        </p>
                        <ul className="list-disc pl-4 text-[12.5px] leading-relaxed text-[var(--color-ink)] space-y-0.5">
                            {blockers.map((blocker, index) => (
                                <li key={`${blocker}-${index}`}>{blocker}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
            {/* The jumps follow the same order the day does, and the money jump is
                withheld until somebody is on the floor - the rail disables Settle until
                then, so offering it here would contradict the pill two inches above. */}
            <FixJump
                label={hasFloorStaff ? "Fix on the Floor plan" : "Build the floor plan"}
                onClick={onFixFloor}
            />
            {hasFloorStaff ? <FixJump label="Enter money in Settle up" onClick={onFixMoney} /> : null}
        </div>
    );
}

// Direction A's own gate (2026-08-23 lock): every assigned dining team and Bar
// must be marked done on Settle up before Confirm & Save unlocks - independent
// of, and checked before, the balance gate below. Names which groups are still
// open (Runners is never one of them) and jumps straight back to fix them.
function CloseGateBlocked({ closeReadiness, onFixMoney }) {
    return (
        <div role="alert" className="space-y-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-4">
                <div className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="text-[var(--color-warning)]">⚠</span>
                    <div className="space-y-1.5">
                        <strong className="block text-sm text-[var(--color-ink)]">
                            {closeReadiness.stillOpen} {closeReadiness.stillOpen === 1 ? "group is" : "groups are"} still open
                        </strong>
                        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                            Every dining team and Bar has to be marked done on Settle up
                            before this shift can close. Runners is never part of this check.
                        </p>
                        <ul className="list-disc pl-4 text-[12.5px] leading-relaxed text-[var(--color-ink)] space-y-0.5">
                            {closeReadiness.openNames.map((name) => <li key={name}>{name}</li>)}
                        </ul>
                    </div>
                </div>
            </div>
            <FixJump label="Finish in Settle up" onClick={onFixMoney} />
        </div>
    );
}

// Review when the numbers are complete but the shift cannot be saved: it does not
// balance, and the write path throws on exactly that. This is the sibling of
// `ReviewNotReady` for the one blocker that survives a complete calculation, and it
// is paired with a disabled Confirm & Save - the button used to stay enabled on a
// shift that could never save, so the only feedback was "Failed to save." on the
// press, forever.
//
// It names the money rather than the invariant. `describeShiftBalance` reads the
// engine's own per-pool residuals, so "Bar CTP $500.00 left over" is the shift's own
// arithmetic, not a guess at it. The full balance check still lives in Shift totals
// below, which opens by default in this state - the reason and the warning belong
// together, so neither replaces the other.
function SaveBlocked({ balance, onFixMoney, onFixFloor }) {
    return (
        <div role="alert" className="space-y-3">
            <div className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-4">
                <div className="flex items-baseline gap-2">
                    <span aria-hidden="true" className="text-[var(--color-warning)]">⚠</span>
                    <div className="space-y-1.5">
                        <strong className="block text-sm text-[var(--color-ink)]">
                            {balance.headline}
                        </strong>
                        <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                            {balance.body}
                        </p>
                        {balance.leftovers.length > 0 ? (
                            <ul className="space-y-1.5 pt-0.5">
                                {balance.leftovers.map(leftover => (
                                    <li key={leftover.key} className="text-[12.5px] leading-snug text-[var(--color-ink)]">
                                        <span className="font-semibold">{leftover.label}</span>
                                        {" "}
                                        <span className="font-mono tabular-nums">{fmtMoney(leftover.amount)}</span>
                                        {" left over."}
                                        {leftover.hint ? (
                                            <span className="block text-[var(--color-ink-soft)]">{leftover.hint}</span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                </div>
            </div>
            <FixJump label="Fix in Settle up" onClick={onFixMoney} />
            <FixJump label="Fix on the Floor plan" onClick={onFixFloor} />
        </div>
    );
}

// A save that was attempted and refused. Distinct from `SaveBlocked`, which is known
// before the press; this is what came back from the write. `describeSaveFailure`
// turns the machine error into an instruction, and the fallback branch still carries
// the raw text so an unanticipated error is not swallowed into four words.
function SaveFailed({ failure }) {
    return (
        <div role="alert" className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] px-4 py-4">
            <div className="flex items-baseline gap-2">
                <span aria-hidden="true" className="text-[var(--color-danger)]">✕</span>
                <div className="space-y-1.5">
                    <strong className="block text-sm text-[var(--color-ink)]">{failure.headline}</strong>
                    <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">{failure.body}</p>
                    {failure.names?.length > 0 ? (
                        <ul className="list-disc pl-4 text-[12.5px] leading-relaxed text-[var(--color-ink)] space-y-0.5">
                            {failure.names.map(name => <li key={name}>{name}</li>)}
                        </ul>
                    ) : null}
                    {failure.detail ? (
                        <p className="font-mono text-[11px] leading-snug text-[var(--color-ink-soft)] break-words">
                            {failure.detail}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export function ReviewStep({
    saveFailure,
    liveReview,
    saveBlocked,
    closeGateBlocked,
    closeReadiness,
    balanceReport,
    poolSummary,
    reviewMoneyGroups,
    reviewFloorGroups,
    hasAssignedStaff,
    shiftStatus,
    date,
    saveStatus,
    draftStatus,
    isSaving,
    onFixMoney,
    onFixFloor,
    onConfirmSave,
}) {
    return (
        /* STEP 3 - Review -> Confirm & Save. The payout list used to live
           in a `max-h-96 overflow-y-auto` box nested inside the page
           scroll, so its last rows were silently clipped with no cue that
           the container scrolled. That box was replaced by a viewport-bound
           column with its own `flex-1 min-h-0 overflow-y-auto` scrollport -
           still a boxed inner scroller, just a taller one: it hard-clipped
           the spot-check card and disclosures at its edges and read as a
           seam above Confirm & Save instead of ordinary content passing
           behind it. Floor plan carried the identical defect and shed it
           first; this column now scrolls with the page the same way, and
           the bottom padding is purely the floating save button's
           clearance, exactly as Settle up and Floor plan already have it.
           There is no "Back to Settle up" button - the "Fix in Settle up"
           and "Fix on the Floor plan" jumps inside the rows below already
           do that, from the place that explains why you would go. */
        // -mx-3 cancels the step content's own p-3 on phone, matching Settle up's
        // entry card bleed (see SettleStep.jsx / ShiftSetupDnd.jsx) - otherwise
        // Review's cards sit a padding layer further in than Settle's and read as
        // a different width for the same reason Floor plan's did.
        <section className="space-y-4 pb-24 max-[560px]:-mx-3">
            {/* Why this shift cannot be saved, above the numbers it is about.
                Both blocks sit at the top of Review deliberately: a reason
                below the fold is the same dead end as no reason at all. */}
            {saveFailure ? <SaveFailed failure={saveFailure} /> : null}

            {liveReview.ready && closeGateBlocked ? (
                <CloseGateBlocked closeReadiness={closeReadiness} onFixMoney={onFixMoney} />
            ) : null}

            {liveReview.ready && saveBlocked ? (
                <SaveBlocked
                    balance={balanceReport}
                    onFixMoney={onFixMoney}
                    onFixFloor={onFixFloor}
                />
            ) : null}

            {liveReview.ready ? (
                <CalculatedPayoutReview
                    review={liveReview}
                    poolAvailable={poolSummary.payoutPool}
                    barPoolEntered={poolSummary.bar.payoutPool}
                    runnersFeeTransfer={poolSummary.runnerTransfer}
                    availableCash={poolSummary.totalCash}
                    balanceBlocked={saveBlocked}
                    warnings={liveReview.warnings}
                    moneyGroups={reviewMoneyGroups}
                    floorGroups={reviewFloorGroups}
                    floorPoints={poolSummary.restaurantPoints + poolSummary.barPoints}
                    onFixFloor={onFixFloor}
                />
            ) : (
                <ReviewNotReady
                    blockers={liveReview.blockers}
                    hasFloorStaff={hasAssignedStaff}
                    onFixMoney={onFixMoney}
                    onFixFloor={onFixFloor}
                />
            )}

            {liveReview.ready && shiftStatus === "closed" ? (
                <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--color-warning)]">
                    <span aria-hidden="true">⚠</span>
                    <span>Re-saving overwrites the saved payouts for {date}.</span>
                </p>
            ) : null}

            {/* Two different audiences for one slot. "Saving…" stays phone-only:
                the floating primary below already says "Saving shift…" beside a
                spinner, so at any wider width this line would just print the
                same news twice. The autosave failure has no such second cue
                anywhere in the editor - the workspace header that used to carry
                it is gone - so it shows at every width, and stays up until a
                later write actually lands. */}
            {saveStatus ? (
                <p aria-live="polite" aria-atomic="true" className="sm:hidden text-xs text-[var(--color-ink-soft)]">
                    {saveStatus}
                </p>
            ) : draftStatus ? (
                <p aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">
                    {draftStatus}
                </p>
            ) : null}

            {/* Same floating primary as the Floor plan and Settle up: one
                accent pill, bottom-right, always in reach without scrolling.
                It is only rendered when there is a complete calculation to
                commit - an incomplete Review offers the fix jumps instead,
                so there is never a save button over numbers that do not
                exist yet.

                Disabled, not withheld, when the shift does not balance. The
                button used to stay enabled on a shift the write path could
                never accept, so it invited pressing forever; removing it
                outright would leave the captain wondering where the save
                went. A greyed button beside the SaveBlocked notice above
                says both things at once - it is there, and this is why it
                will not go. A disabled button is never unexplained: the
                notice renders under exactly the same condition. */}
            {liveReview.ready ? (
                <FloatingActions>
                    <button
                        type="button"
                        onClick={onConfirmSave}
                        disabled={isSaving || saveBlocked || closeGateBlocked}
                        title={
                            closeGateBlocked
                                ? `${closeReadiness.stillOpen} ${closeReadiness.stillOpen === 1 ? "group is" : "groups are"} still open`
                                : saveBlocked ? balanceReport.headline : undefined
                        }
                        className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95 disabled:opacity-60 disabled:active:scale-100"
                    >
                        {isSaving ? (
                            <>
                                <Spinner />
                                <span>Saving shift…</span>
                            </>
                        ) : (
                            "✓ Confirm & Save Shift"
                        )}
                    </button>
                </FloatingActions>
            ) : null}
        </section>
    );
}
