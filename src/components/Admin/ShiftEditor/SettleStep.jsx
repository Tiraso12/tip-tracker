import ScrollRail from "../ScrollRail";
import { fmtMoney } from "../shiftEditorUtils";
import { BarPoolFields } from "./BarPoolFields";
import { CloseoutEntryPanel } from "./CloseoutEntryPanel";
import { PointSplitDisclosure } from "./PointSplitDisclosure";
import { RailPill } from "./RailPill";
import { RunnerGroup } from "./RunnerGroup";
import { TeamPoolFields } from "./TeamPoolFields";

export function SettleStep({
    closeoutGroups,
    activeGroupId,
    onSelectGroup,
    poolSummary,
    poolGroupSummary,
    groupStatusSummary,
    teams,
    barTeam,
    runners,
    saveStatus,
    draftStatus,
    onPoolChange,
    onToggleContracts,
    onAddContract,
    onUpdateContract,
    onRemoveContract,
    onBarPoolChange,
    onBarFoodSalesChange,
    onTeamMemberPointsChange,
    onTeamMemberPointsAdjust,
    onBarMemberPointsChange,
    onBarMemberPointsAdjust,
    onRunnerPayoutChange,
}) {
    // A missing id is a bug, not a reason to impersonate the first group. A silent
    // fallback and a broken tab look identical on screen; fail visibly instead.
    const activeGroup = closeoutGroups.find(group => group.id === activeGroupId) ?? null;
    const diningTeam = activeGroup?.kind === "dining" ? teams[activeGroup.teamIndex] : null;

    return (
        /* STEP 2 - Settle up: the calm single money switcher, edited directly in
           place - no lock/unlock, no floating Cancel/Done (see ShiftEditorPanel.jsx).
           The titled money card hugs its content at every width instead of filling
           the screen with its own internal scroller - the page scrolls, same as
           desktop always has. */
        <section className="space-y-4 pb-6">
            {/* Team switcher: a compact horizontal strip above one fixed-height entry
                panel. Tapping a pill focuses that group; the strip scrolls sideways on
                phone so page height stays constant no matter how large the roster is.
                A status line + edge fade keep off-screen groups and their money status
                discoverable instead of a blind sideways swipe.

                On a phone the day's pool and the switcher are CONTEXT, not
                entry, so they share one tinted band that runs edge to edge
                (the negative margins cancel the Card's padding) and ends in a
                single hairline. Below that hairline is plain paper carrying
                nothing but the money fields. One line divides the two, instead
                of three boxes dividing the context from itself. */}
            {/* --color-band is barely a shade off --color-bg (page paper) - the kit
                uses --color-surface-muted for this strip, which actually reads as a
                tinted band instead of quietly matching the page underneath it.

                -mx-7 (28px) bleeds past BOTH ancestor paddings between this band and
                the true screen edge: the step content's own p-3 (12px) and, past
                that, main's px-4 (16px). -mx-3 only canceled the first, landing the
                band flush with the page's content column rather than the screen edge
                - one padding layer short of running edge to edge like the Day Rail
                above it does. px-3 re-establishes the band's own 12px inner padding
                once the bleed clears both outer layers. */}
            <div className="[--rail-fade:var(--color-surface)] max-[560px]:[--rail-fade:var(--color-surface-muted)] space-y-4 max-[560px]:space-y-0 max-[560px]:flex max-[560px]:flex-col max-[560px]:gap-2.5 max-[560px]:flex-none max-[560px]:-mx-7 max-[560px]:-mt-3 max-[560px]:px-3 max-[560px]:pt-3 max-[560px]:pb-2 max-[560px]:bg-[var(--color-surface-muted)] max-[560px]:border-b max-[560px]:border-[var(--color-line)]">
            {/* On a phone the tabs come FIRST and this summary reads
                underneath them: you pick the team, then the day's total
                and what is still owed sit closest to the money they
                describe. `order` moves it visually without moving it in
                the DOM, so the tab strip keeps its natural focus order.
                Desktop keeps the original stacking (block flow, no
                flex, so `order` does nothing there). */}
            <div className="flex items-center justify-between gap-3 max-[560px]:order-2">
                <span className="inline-flex items-baseline gap-2">
                    <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
                        {poolGroupSummary.total} {poolGroupSummary.total === 1 ? "group" : "groups"} · Pool
                    </span>
                    <strong className="font-mono tabular-nums text-sm text-[var(--color-ink)]">
                        {fmtMoney(poolSummary.payoutPool)}
                    </strong>
                </span>
                {/* Phone: the per-tab dots already carry this. Each tab shows its
                    own group's state in its own colour, right next to the name you
                    would tap to fix it, so a rolled-up count of the same fact was
                    the screen saying it twice - once vaguely. Desktop keeps the
                    roll-up: there the switcher can hold more groups than the eye
                    counts dots for. */}
                {groupStatusSummary.total > 0 ? (
                    groupStatusSummary.needsMoney > 0 ? (
                        <span className="max-[560px]:hidden inline-flex items-center gap-1.5 rounded-full bg-[var(--color-warning-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-warning)]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[var(--color-warning)]" />
                            {groupStatusSummary.needsMoney} still need money
                        </span>
                    ) : (
                        <span className="max-[560px]:hidden inline-flex items-center gap-1.5 rounded-full bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)]">
                            <span aria-hidden="true">✓</span>
                            All groups funded
                        </span>
                    )
                ) : null}
            </div>
            {/* Phone only: justify-between spreads the tabs across the row's full
                width, like the kit, when they fit. gap-2 is the floor, not the only
                spacing - with few groups there is free space to distribute, and
                justify-between adds it; with enough groups to overflow, there is none
                left to add and this falls back to the plain gap-2 packing
                overflow-x-auto scrolls through, no group-count check needed. Desktop
                keeps the left-packed rail: at 1200px, space-between across 2-3 tabs
                reads as scattered rather than as a filled row - the kit's own spread
                assumes a phone-width rail, not a desktop-width one. */}
            <ScrollRail
                role="tablist"
                ariaLabel="Select a group to enter money"
                depsKey={closeoutGroups.length}
                fadeFrom="var(--rail-fade)"
                className="flex max-[560px]:justify-between gap-2 overflow-x-auto overflow-y-hidden px-0.5 pt-0.5 pb-2 pr-8 [scrollbar-width:thin]"
            >
                {closeoutGroups.map(group => (
                    <RailPill
                        key={group.id}
                        group={group}
                        selected={group.id === activeGroupId}
                        onSelect={() => onSelectGroup(group.id)}
                    />
                ))}
            </ScrollRail>
            </div>

            {/* Locked view = these very same fields, disabled. A native
                disabled fieldset switches every input/stepper off at once; Edit
                flips it back on in place. The group switcher above stays outside
                the fieldset so you can still page through each group while locked. */}
            {/* -mx-3 matches the band above: both cancel the step content's own p-3
                so the card's sides line up with the band's tinted strip instead of
                sitting a second layer of padding further in. */}
            <div className="m-0 min-w-0 max-[560px]:!mt-3 max-[560px]:-mx-3">
            {activeGroup && (activeGroup.kind !== "dining" || diningTeam) ? (
                <CloseoutEntryPanel key={activeGroup.id} group={activeGroup}>
                    {activeGroup.kind === "dining" ? (
                        <>
                            <TeamPoolFields
                                team={diningTeam}
                                onPoolChange={onPoolChange}
                                onToggleContracts={onToggleContracts}
                                onAddContract={onAddContract}
                                onUpdateContract={onUpdateContract}
                                onRemoveContract={onRemoveContract}
                            />
                            <PointSplitDisclosure
                                title={activeGroup.name}
                                members={diningTeam.members}
                                emptyMessage="No dining room employees on this team."
                                onPointChange={(uid, value) => onTeamMemberPointsChange(activeGroup.id, uid, value)}
                                onPointAdjust={(uid, delta) => onTeamMemberPointsAdjust(activeGroup.id, uid, delta)}
                            />
                        </>
                    ) : activeGroup.kind === "bar" ? (
                        <>
                            <BarPoolFields
                                barTeam={barTeam}
                                onBarPoolChange={onBarPoolChange}
                                onBarFoodSalesChange={onBarFoodSalesChange}
                            />
                            <PointSplitDisclosure
                                title="Bar Team"
                                members={barTeam.members}
                                defaultPoints={1}
                                emptyMessage="No bar employees assigned."
                                onPointChange={onBarMemberPointsChange}
                                onPointAdjust={onBarMemberPointsAdjust}
                            />
                        </>
                    ) : (
                        <>
                            <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)] mb-3">
                                Runner pay is drawn from the tip pool. Enter each runner's take-home.
                            </p>
                            <RunnerGroup
                                runners={runners}
                                totalPay={poolSummary.totalRunnerPay}
                                onPayoutChange={onRunnerPayoutChange}
                            />
                        </>
                    )}
                </CloseoutEntryPanel>
            ) : (
                <div
                    role="alert"
                    className="rounded-[var(--radius-md)] border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-4"
                >
                    <div className="flex items-baseline gap-2">
                        <span aria-hidden="true" className="text-[var(--color-warning)]">⚠</span>
                        <div className="space-y-1.5">
                            <strong className="block text-sm text-[var(--color-ink)]">
                                This group is not on the floor
                            </strong>
                            <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-soft)]">
                                The selected group is no longer on this shift. Pick another tab.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            </div>

            {/* A closed shift disables draft autosave, so surface the live save/
                draft status inline; a setup shift's money autosaves silently. Settle
                up floats on the page background (no outer workspace header), so this
                is the only place that status shows at any width. */}
            {(saveStatus || draftStatus) ? (
                <p aria-live="polite" aria-atomic="true" className="text-xs text-[var(--color-ink-soft)]">
                    {saveStatus || draftStatus}
                </p>
            ) : null}
        </section>
    );
}
