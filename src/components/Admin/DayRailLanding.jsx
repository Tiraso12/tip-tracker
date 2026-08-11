import DayPayoutPanel from "./DayPayoutPanel";
import DayRail from "./DayRail";
import { getRailSteps, getLandingStage } from "../../utils/dayFlow";
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
const ROLE_BADGES = { captain: "C", server: "S", back: "B", assistant: "A" };

// The temp seed name is literally "Temp Staff (Temp)"; the saved lineup usually
// stores the plain username, but strip a trailing "(Temp)" defensively so chips
// read "Frankie Lee", not "Frankie Lee (Temp)".
const cleanName = (name = "") => name.replace(/\s*\((?:temp)\)\s*$/i, "").trim() || name;

// Role tag for a chip badge. One visual family for all chips: dining carries a
// role letter + points ("S·4", "C·4"); bar and runners genuinely have no points,
// so they read as a compact role label of the same size ("BAR", "RUN") - never a
// faked "·0". Matches the editor's chips exactly.
const memberTag = (member, kind) => {
    if (kind === "runner") return "Run";
    if (kind === "bar") return "Bar";
    const badge = ROLE_BADGES[member.role] || "S";
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

// Read-only card grid of the saved floor, shown before Settle up. Same two-up
// card layout and chips as the editor - just no drag/select/step controls - so
// the floor is consistent to read whether building or confirming.
function FloorLineup({ lineup, onEditFloor }) {
    const teams = lineup?.teams || [];
    const barMembers = lineup?.barTeam?.members || [];
    const runners = lineup?.runners || [];

    const diningCount = teams.reduce((total, team) => total + (team.members?.length || 0), 0);
    const barCount = barMembers.length;
    const runnerCount = runners.length;
    const floorTotal = diningCount + barCount + runnerCount;

    return (
        <>
        <Card className="!p-0 max-[560px]:flex max-[560px]:flex-1 max-[560px]:flex-col max-[560px]:min-h-0">
            <header className="px-5 py-4 border-b border-[var(--color-line)] max-[560px]:px-4 max-[560px]:shrink-0">
                <h2 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                    Floor plan is set
                </h2>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)] tabular-nums">
                    {floorTotal} on the floor · {diningCount} dining · {barCount} bar · {runnerCount} {plural(runnerCount, "runner", "runners")}
                </p>
            </header>

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
        {/* PROTOTYPE: floating Edit FAB - the floor is edited in place (no separate
            screen). Settle up is reached from the day rail above. */}
        <button
            type="button"
            onClick={onEditFloor}
            className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95"
        >
            ✎ Edit
        </button>
        </>
    );
}

function Hero({ title, body, tall = false, children }) {
    return (
        <Card className={"px-6 text-center " + (tall ? "py-16 sm:py-24" : "py-10 sm:py-14")}>
            <div className="mx-auto max-w-sm space-y-3">
                <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                    {title}
                </h2>
                {body ? <p className="text-sm text-[var(--color-ink-soft)]">{body}</p> : null}
                <div className="flex flex-col items-center gap-2 pt-2">{children}</div>
            </div>
        </Card>
    );
}

function DayRailLanding({ date, status, summary, lineup, loading, onBuildFloor, onContinueSettle, onEditFloor, onRemoveShift, removingShift = false }) {
    const stage = getLandingStage(status);
    // On the read-only floor view (settle stage) the rail's active step is Floor -
    // you are looking at the floor. Settle is the reachable "next" pill you tap to
    // advance. (Prototype fix #2: the old focus highlighted Settle here, so tapping
    // Done read as "jumped to Settle".)
    let railSteps = getRailSteps({ shiftStatus: status });
    if (stage === "settle") {
        railSteps = railSteps.map((s) =>
            s.key === "floor" ? { ...s, state: "active" }
                : s.key === "settle" ? { ...s, state: "pending" }
                    : s
        );
    }

    const onStepClick = (key) => {
        // Prototype fix #1: Floor = the read-only view you are already on. Edit is
        // entered ONLY via the floating ✎ Edit button, so tapping Floor never drops
        // into edit mode. Settle advances to the money step.
        if (key === "settle") onContinueSettle?.();
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

            {loading ? (
                <Card className="px-6 py-16 text-center text-sm text-[var(--color-ink-soft)]">Loading day…</Card>
            ) : stage === "closed" ? (
                <>
                <div className="space-y-3 max-[560px]:pb-24">
                    <DayPayoutPanel date={date} summary={summary} status={status} loading={false} />
                    {onRemoveShift ? (
                        <div className="flex">
                            <button
                                type="button"
                                onClick={onRemoveShift}
                                disabled={removingShift}
                                className="text-xs font-medium text-[var(--color-danger)] hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
                            >
                                {removingShift ? "Removing…" : "Remove this shift"}
                            </button>
                        </div>
                    ) : null}
                </div>
                {/* Prototype fix #4: "Edit shift" is a floating button (same feel as
                    the floor's ✎ Edit) that switches the saved shift into edit mode.
                    Destination (onEditFloor) and the closed-shift save-safety path are
                    unchanged - only the affordance moved. */}
                <button
                    type="button"
                    onClick={onEditFloor}
                    disabled={removingShift}
                    className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-3.5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(47,111,79,0.35)] transition-transform active:scale-95 disabled:opacity-60"
                >
                    ✎ Edit shift
                </button>
                </>
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
