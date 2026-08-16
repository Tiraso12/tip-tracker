import DayPayoutPanel from "./DayPayoutPanel";
import DayRail from "./DayRail";
import FloatingActions from "./FloatingActions";
import { getRailSteps, getLandingStage } from "../../utils/dayFlow";
import { getPayoutTotal } from "../../utils/payoutLedger";
import { roleInitial, roleLabel } from "../../utils/roleLabels";
import { Button, Card } from "../ui";

// Approach A landing. The day rail leads with its first incomplete step:
//  - no floor plan yet  -> first-run hero into Floor plan (step 1)
//  - floor built (setup) -> read-only card grid of the floor, then Settle up
//  - closed / paid       -> the Pay out review (as today), rail all done
//
// The friendly date lives once in the app-bar Bar Date pill, so the heroes no
// longer echo it as an eyebrow.

const plural = (count, one, many) => (count === 1 ? one : many);

// Compact role badge for a roster chip, mirroring the editor's TeamDropZone
// chips so the floor "reads the same" whether you are editing or reviewing.

// The temp seed name is literally "Temp Staff (Temp)"; the saved lineup usually
// stores the plain username, but strip a trailing "(Temp)" defensively so chips
// read "Frankie Lee", not "Frankie Lee (Temp)".
const cleanName = (name = "") => name.replace(/\s*\((?:temp)\)\s*$/i, "").trim() || name;

// Role tag for a chip badge. One visual family for all chips: dining carries a
// role letter + points ("S·4", "C·4"); bar and runners genuinely have no points,
// so they read as a compact role label of the same size ("BAR", "RUN") - never a
// faked "·0". Matches the editor's chips exactly.
const memberTag = (member, kind) => {
    if (kind === "runner") return roleInitial("runner");
    if (kind === "bar") return roleInitial("bartender");
    const badge = roleInitial(member.role);
    const points = member.points;
    return points === null || points === undefined || points === ""
        ? badge
        : `${badge}·${points}`;
};

// One read-only roster chip: name + compact role/points tag. The captain gets an
// accent treatment so the team lead stays scannable, same as the editor card.
function MemberChip({ member, kind }) {
    const isCaptain = kind === "team" && member.role === "captain";
    return (
        <span
            className={[
                "inline-flex max-w-full items-center gap-1.5 rounded-full border pl-2 pr-1 py-0.5",
                isCaptain
                    ? "border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)]"
                    : "border-[var(--color-line)] bg-[var(--color-surface-muted)]",
            ].join(" ")}
        >
            <span
                className={[
                    "max-w-[7rem] truncate text-[0.72rem] font-medium leading-none",
                    isCaptain ? "text-[var(--color-accent)]" : "text-[var(--color-ink)]",
                ].join(" ")}
            >
                {cleanName(member.name || "")}
            </span>
            <span
                className={[
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold uppercase leading-none tracking-[0.02em]",
                    isCaptain
                        ? "bg-[var(--color-accent)] text-[var(--color-surface)]"
                        : "bg-[var(--color-surface)] text-[var(--color-ink-muted)]",
                ].join(" ")}
            >
                {memberTag(member, kind)}
            </span>
        </span>
    );
}

// One read-only team card: header (title + count) then wrapped member chips.
// Populated cards get a solid border; empty teams stay dashed and read "Empty",
// mirroring the editor's TeamDropZone so the floor looks the same in both places.
function FloorTeamCard({ title, members, kind }) {
    const count = members.length;
    const populated = count > 0;
    return (
        <div
            className={[
                "flex flex-col gap-[0.4rem] rounded-[var(--radius-md)] border-[1.5px] px-[0.65rem] py-[0.55rem] bg-[var(--color-surface)] max-[560px]:rounded-[var(--radius-sm)] max-[560px]:px-3 max-[560px]:py-2",
                populated
                    ? "border-solid border-[var(--color-line-strong)]"
                    : "border-dashed border-[var(--color-line)]",
            ].join(" ")}
        >
            <div className="flex items-center justify-between gap-2">
                <h4 className="m-0 min-w-0 truncate text-[0.82rem] font-semibold text-[var(--color-ink)]">
                    {title}
                </h4>
                <span className="shrink-0 text-[0.72rem] font-semibold text-[var(--color-ink-muted)]">
                    {populated ? `${count} ${plural(count, "member", "members")}` : "Empty"}
                </span>
            </div>
            {populated ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    {members.map((member) => (
                        <MemberChip key={member.uid} member={member} kind={kind} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}

// The read-only screens' single floating Edit button, pinned to the bottom-right
// corner. Shared by the Floor plan and Settle up views (and the closed-shift view)
// so entering edit feels identical everywhere - one source of truth for the FAB.
// `FloatingActions` owns the corner and the scroll reveal, so the button never
// parks on a payout row while you read down the day.
function EditFab({ onClick, label = "✎ Edit", disabled = false }) {
    return (
        <FloatingActions>
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95 disabled:opacity-60"
            >
                {label}
            </button>
        </FloatingActions>
    );
}

// Read-only card grid of the saved floor, shown before Settle up. Same two-up
// card layout and chips as the editor - just no drag/select/step controls - so
// the floor is consistent to read whether building or confirming.
function FloorLineup({ lineup, onEditFloor }) {
    const teams = lineup?.teams || [];
    const barMembers = lineup?.barTeam?.members || [];
    const runners = lineup?.runners || [];

    return (
        <>
        <Card className="!p-0 max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
            <div className="grid grid-cols-2 items-start gap-2.5 p-5 max-[560px]:gap-2 max-[560px]:p-4 max-[560px]:flex-1 max-[560px]:min-h-0 max-[560px]:overflow-y-auto max-[560px]:content-start max-[560px]:pb-24">
                {teams.map((team, index) => (
                    <FloorTeamCard
                        key={team.teamId || index}
                        title={`Team ${index + 1}`}
                        members={team.members || []}
                        kind="team"
                    />
                ))}
                <FloorTeamCard title="Bar Team" members={barMembers} kind="bar" />
                <FloorTeamCard title="Runners" members={runners} kind="runner" />
            </div>

        </Card>
        {/* Floating Edit FAB - the floor is edited in place. Settle up is reached
            from the day rail above and mirrors this same view/edit pattern. */}
        <EditFab onClick={onEditFloor} />
        </>
    );
}

// Inline (not emoji) so the glyph is the same shape on every platform and inherits
// `currentColor` through the danger button's hover invert, matching how the rest of
// the app draws its icons.
function TrashIcon() {
    return (
        <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
            <path d="M10 11v5M14 11v5" />
        </svg>
    );
}

// The most destructive action in the app: it hard-deletes a date's payroll data.
// WHAT it does and its window.confirm are unchanged - what changed (and what this
// component now keeps in one place) is that the affordance weighs what the action
// weighs. It was a 12px red text link (98x16, no border, no icon) you could brush
// past while scrolling a paid-out day; it is a bounded, clearly-labelled danger
// zone that names the consequence before you reach the button, and the button
// itself is a full, comfortably-sized 44px-tall danger target instead of a
// line of text.
//
// The copy is passed in because the two dates that can be removed are not the same
// thing: a closed shift, and a date carrying nothing but leftover ledger entries.
// Same removal path (`removeShiftAtomically`), same confirm - different sentence.
function RemoveDangerZone({ body, label, busyLabel, onRemove, removing }) {
    return (
        <section
            aria-labelledby="remove-shift-heading"
            className="rounded-[var(--radius-md)] border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] p-4 max-[560px]:p-3.5"
        >
            <h3
                id="remove-shift-heading"
                className="m-0 text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[var(--color-danger)]"
            >
                Danger zone
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                {body}
            </p>
            <button
                type="button"
                onClick={onRemove}
                disabled={removing}
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-danger)] bg-[var(--color-surface)] px-4 text-sm font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[var(--color-surface)] disabled:hover:text-[var(--color-danger)]"
            >
                <TrashIcon />
                {removing ? busyLabel : label}
            </button>
        </section>
    );
}

const money = (value) => `$${(Number(value) || 0).toFixed(2)}`;

// The date has payout records but no shift behind them - the shape the ledger
// migration and unfinished writes leave. It is deliberately NOT dressed as a
// paid-out day: there is no shift to review, export or edit, so the panel says
// plainly what is on the date, names everyone it would pay, and offers the two
// honest ways out - remove the leftovers, or build the shift for real (which is
// what the date offered before, and still does).
function OrphanedPayouts({ entries, onBuildFloor, onRemoveShift, removingShift }) {
    const people = entries.length;

    return (
        <div className="space-y-3 pb-24">
            <Card className="!p-0">
                <header className="px-5 py-4 border-b border-[var(--color-line)]">
                    <h2 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                        Leftover payouts, no shift
                    </h2>
                    {/* The Remove danger zone below is manager-only - it renders only when
                        `onRemoveShift` is passed - so the instruction to use it is gated on
                        the same prop. A Captain was being told to remove the payouts below
                        while the control was not on their screen at all; they get the half
                        of the sentence they can actually act on. */}
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-ink-soft)]">
                        This date has payout records for {people} {plural(people, "person", "people")} but no
                        shift behind them - usually left by a data import or a save that did not finish.
                        There is no shift here to review or edit.{" "}
                        {onRemoveShift
                            ? "Remove the leftover payouts below, or build the floor plan to record this day properly."
                            : "Build the floor plan to record this day properly, or ask the manager to remove the leftover payouts."}
                    </p>
                </header>

                <ul className="divide-y divide-[var(--color-line)]">
                    {entries.map((entry) => (
                        <li key={entry.uid} className="flex items-start justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                                <p className="m-0 truncate text-sm font-semibold text-[var(--color-ink)]">
                                    {cleanName(entry.name || "Unknown")}
                                </p>
                                <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                                    {roleLabel(entry.role)}
                                </p>
                            </div>
                            <div className="shrink-0 text-right">
                                <span className="block font-mono text-sm tabular-nums text-[var(--color-ink)]">
                                    {money(getPayoutTotal(entry))}
                                </span>
                                <span className="block text-xs tabular-nums text-[var(--color-ink-soft)]">
                                    {money(entry.cash)} cash
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>

                <div className="px-5 py-4 border-t border-[var(--color-line)]">
                    <Button variant="secondary" onClick={onBuildFloor} className="w-full sm:w-auto">
                        Build floor plan →
                    </Button>
                </div>
            </Card>

            {onRemoveShift ? (
                <RemoveDangerZone
                    body={`Removing permanently deletes ${people} payout ${plural(people, "record", "records")} for this date. Each person will no longer see this date's payout. This cannot be undone.`}
                    label="Remove leftover payouts"
                    busyLabel="Removing…"
                    onRemove={onRemoveShift}
                    removing={removingShift}
                />
            ) : null}
        </div>
    );
}

function Hero({ title, body, tall = false, children }) {
    return (
        // Phone: the hero is the first screen of every new day, so it takes the
        // landing's full-height column (flex-1) instead of shrinking to its three
        // lines and leaving the lower half of the screen blank - measured at
        // 390x844 the card ended at y=430 and wasted 414px, 49% of the viewport.
        // This is the same fill treatment FloorLineup and the closed-day panel
        // already use: the card fills, its content stays snug at the top (shrink-0,
        // never stretched or spread apart), and the leftover height is one clean
        // band at the bottom. Desktop keeps its natural height.
        <Card
            className={
                "px-6 text-center max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0 max-[560px]:py-10 " +
                (tall ? "py-16 sm:py-24" : "py-10 sm:py-14")
            }
        >
            <div className="mx-auto max-w-sm space-y-3 max-[560px]:w-full max-[560px]:shrink-0">
                <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                    {title}
                </h2>
                {body ? <p className="text-sm text-[var(--color-ink-soft)]">{body}</p> : null}
                <div className="flex flex-col items-center gap-2 pt-2">{children}</div>
            </div>
        </Card>
    );
}

function DayRailLanding({ date, status, summary, lineup, orphanedEntries = [], savedBy = null, loading, savedNotice = false, onBuildFloor, onContinueSettle, onOpenReview, onEditFloor, onRemoveShift, removingShift = false }) {
    const stage = getLandingStage(status);
    // A refetch of the day already on screen keeps that day on screen - the top
    // progress bar carries the wait. Only a load with nothing to show blanks, which
    // is a first load or a date change (AdminDashboard withholds another date's data).
    const showLoadingCard = loading && !summary && !lineup && !status;
    // On the read-only floor view (settle stage) the rail's active step is Floor -
    // you are looking at the floor. Settle is the reachable "next" pill you tap to
    // advance into the (directly-editable) money screen.
    let railSteps = getRailSteps({ shiftStatus: status });
    if (stage === "settle") {
        railSteps = railSteps.map((s) =>
            s.key === "floor" ? { ...s, state: "active" }
                : s.key === "settle" ? { ...s, state: "pending" }
                    : s
        );
        // Once a floor plan exists the landing can open Review directly, same as
        // Settle. Review derives its numbers from the day's saved floor plan and
        // money, so there is nothing to calculate first - and if those inputs are
        // still too thin, Review says so on its own screen. `getRailSteps` leaves
        // Review unclickable on the landing by default because the landing is the
        // only rail with no Review destination of its own; here we give it one.
        railSteps = railSteps.map((s) => (s.key === "review" ? { ...s, clickable: true } : s));
    }

    const onStepClick = (key) => {
        // Floor = the read-only view you are already on; Edit is entered via the
        // floating ✎ Edit button. Settle and Review open the editor at that step.
        if (key === "settle") onContinueSettle?.();
        if (key === "review") onOpenReview?.();
    };

    return (
        // On phones the landing fills the viewport (100dvh minus the app bar + main
        // padding) so the settle card reaches the bottom of the screen. Its team grid
        // packs snug at the top (content-start) - any leftover height is one clean band
        // above the pinned actions, never gaps between the rows. Desktop keeps its
        // natural top-aligned height.
        <div className="space-y-3 sm:space-y-4 max-[560px]:flex max-[560px]:flex-col max-[560px]:min-h-[calc(100dvh-6rem)]">
            {/* Prototype fix #3: once a shift is fully settled + saved (closed) the
                process is complete, so the step rail is hidden - no steps left to show. */}
            {stage === "closed" ? null : <DayRail steps={railSteps} onStepClick={onStepClick} />}

            {/* The Confirm & Save confirmation lands here, on the day it is about,
                rather than on the editor screen the admin has just left. Inside the
                landing column so it eats into the phone's fill height instead of
                pushing the day off the bottom of it. */}
            {savedNotice ? (
                <div
                    role="status"
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-success)]/25 bg-[var(--color-success-soft)] px-3 py-2 text-sm text-[var(--color-success)]"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Saved. Payouts for this date are recorded.</span>
                </div>
            ) : null}

            {showLoadingCard ? (
                <Card className="px-6 py-16 text-center text-sm text-[var(--color-ink-soft)]">Loading day…</Card>
            ) : stage === "closed" ? (
                <>
                <div className="space-y-3 pb-24">
                    <DayPayoutPanel date={date} summary={summary} status={status} savedBy={savedBy} loading={false} />
                    {onRemoveShift ? (
                        <RemoveDangerZone
                            body="Removing this shift permanently deletes it and every payout on it. This cannot be undone."
                            label="Remove this shift"
                            busyLabel="Removing…"
                            onRemove={onRemoveShift}
                            removing={removingShift}
                        />
                    ) : null}
                </div>
                {/* "Edit shift" is the same floating Edit button as the floor/settle
                    views, switching the saved shift into edit mode. */}
                <EditFab onClick={onEditFloor} label="✎ Edit shift" disabled={removingShift} />
                </>
            ) : stage === "orphaned-payouts" ? (
                <OrphanedPayouts
                    entries={orphanedEntries}
                    onBuildFloor={onBuildFloor}
                    onRemoveShift={onRemoveShift}
                    removingShift={removingShift}
                />
            ) : stage === "settle" ? (
                <FloorLineup lineup={lineup} onEditFloor={onEditFloor} />
            ) : (
                <Hero
                    tall
                    title="Let's set up the floor"
                    body="The day starts with the floor plan. Build today's lineup to begin."
                >
                    <Button size="lg" onClick={onBuildFloor} className="w-full sm:w-auto">
                        Build floor plan →
                    </Button>
                </Hero>
            )}
        </div>
    );
}

export default DayRailLanding;
