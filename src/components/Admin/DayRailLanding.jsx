import DayPayoutPanel from "./DayPayoutPanel";
import DayRail from "./DayRail";
import { getRailSteps, getLandingStage } from "../../utils/dayFlow";
import { RUNNER_FLAT_RATE } from "../../utils/constants";
import { Button, Card } from "../ui";

// Approach A landing. The day rail leads with its first incomplete step:
//  - no floor plan yet  -> first-run hero into Floor plan (step 1)
//  - floor built (setup) -> team-by-team floor confirmation, then Settle up
//  - closed / paid       -> the Pay out review (as today), rail all done
//
// The friendly date lives once in the app-bar Bar Date pill, so the heroes no
// longer echo it as an eyebrow.

const plural = (count, one, many) => (count === 1 ? one : many);

// Role -> confirmation label. Restaurant roles keep their name; bartender reads
// "Bar", runner reads "Runner" (both handled explicitly at the row).
const ROLE_LABELS = {
    captain: "Captain",
    server: "Server",
    back: "Back",
    assistant: "Assistant",
    bartender: "Bar",
    runner: "Runner",
};

// Initials for the roster avatar. Skips parenthetical tags so "Temp Staff
// (Temp)" reads "TS", matching the editor's avatar logic.
function getInitials(name = "") {
    const parts = name.trim().split(/\s+/).filter((part) => /[a-z0-9]/i.test(part[0]));
    if (parts.length === 0) {
        const alnum = name.replace(/[^a-z0-9]/gi, "");
        return alnum ? alnum.slice(0, 2).toUpperCase() : "?";
    }
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// The temp seed name is literally "Temp Staff (Temp)"; drop the doubled tag for
// display and surface it once as a small marker instead.
const isTempMember = (member) =>
    /\(temp\)/i.test(member?.name || "") || String(member?.uid || "").startsWith("unreg");
const cleanName = (name = "") => name.replace(/\s*\((?:temp)\)\s*$/i, "").trim() || name;

function Avatar({ name }) {
    return (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[0.6rem] font-bold uppercase leading-none text-[var(--color-accent)]">
            {getInitials(name)}
        </span>
    );
}

function TempTag() {
    return (
        <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            Temp
        </span>
    );
}

// One roster row: avatar · name (+ Temp marker) · role/points on the right.
function PersonRow({ member, kind }) {
    const name = cleanName(member.name || "");
    const roleLabel = kind === "runner"
        ? "Runner"
        : kind === "bar"
            ? "Bar"
            : ROLE_LABELS[member.role] || "Server";

    let meta;
    if (kind === "runner") {
        meta = `Runner · $${member.payoutAmount ?? RUNNER_FLAT_RATE}`;
    } else if (kind === "bar") {
        meta = (
            <span className="inline-flex items-center rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-[0.68rem] font-medium text-[var(--color-ink-soft)]">
                Bar
            </span>
        );
    } else {
        const pts = member.points === null || member.points === undefined || member.points === ""
            ? "Auto pts"
            : `${member.points} ${plural(member.points, "pt", "pts")}`;
        meta = `${roleLabel} · ${pts}`;
    }

    return (
        <div className="flex items-center gap-2.5 px-4 py-2.5 max-[560px]:px-3">
            <Avatar name={name} />
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-sm font-medium text-[var(--color-ink)]">{name}</span>
                {isTempMember(member) ? <TempTag /> : null}
            </div>
            <span className="shrink-0 text-right text-xs font-medium tabular-nums text-[var(--color-ink-soft)]">
                {meta}
            </span>
        </div>
    );
}

function TeamBlock({ title, count, children }) {
    return (
        <section className="border-b border-[var(--color-line)] last:border-b-0">
            <div className="flex items-center justify-between gap-3 bg-[var(--color-surface-muted)]/60 px-4 py-2 max-[560px]:px-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-soft)]">
                    {title}
                </span>
                <span className="text-[11px] font-medium tabular-nums text-[var(--color-ink-muted)]">
                    {count} {plural(count, "person", "people")}
                </span>
            </div>
            <div className="divide-y divide-[var(--color-line)]">{children}</div>
        </section>
    );
}

// Read-only team-by-team confirmation of the saved floor, shown before Settle
// up. No edit controls, drag handles, or +/- here - just the lineup to confirm.
function FloorLineup({ lineup, onContinueSettle, onEditFloor }) {
    const teams = lineup?.teams || [];
    const barMembers = lineup?.barTeam?.members || [];
    const runners = lineup?.runners || [];

    const diningCount = teams.reduce((total, team) => total + (team.members?.length || 0), 0);
    const barCount = barMembers.length;
    const runnerCount = runners.length;
    const floorTotal = diningCount + barCount + runnerCount;

    return (
        <Card className="!p-0">
            <header className="px-5 py-4 border-b border-[var(--color-line)] max-[560px]:px-4">
                <h2 className="font-display text-lg font-medium tracking-tight text-[var(--color-ink)]">
                    Floor plan is set
                </h2>
                <p className="mt-1 text-xs text-[var(--color-ink-soft)] tabular-nums">
                    {floorTotal} on the floor · {diningCount} dining · {barCount} bar · {runnerCount} {plural(runnerCount, "runner", "runners")}
                </p>
            </header>

            <div>
                {teams.map((team, index) => (
                    <TeamBlock key={team.teamId || index} title={`Team ${index + 1}`} count={team.members?.length || 0}>
                        {(team.members || []).map((member) => (
                            <PersonRow key={member.uid} member={member} kind="team" />
                        ))}
                    </TeamBlock>
                ))}

                {barCount > 0 ? (
                    <TeamBlock title="Bar" count={barCount}>
                        {barMembers.map((member) => (
                            <PersonRow key={member.uid} member={member} kind="bar" />
                        ))}
                    </TeamBlock>
                ) : null}

                {runnerCount > 0 ? (
                    <TeamBlock title="Runners" count={runnerCount}>
                        {runners.map((member) => (
                            <PersonRow key={member.uid} member={member} kind="runner" />
                        ))}
                    </TeamBlock>
                ) : null}
            </div>

            <footer className="flex flex-col items-stretch gap-2 border-t border-[var(--color-line)] px-5 py-4 max-[560px]:px-4">
                <Button size="lg" onClick={onContinueSettle} className="w-full">
                    Continue to Settle up →
                </Button>
                <button
                    type="button"
                    onClick={onEditFloor}
                    className="mx-auto text-xs font-medium text-[var(--color-accent)] hover:underline"
                >
                    Edit floor plan
                </button>
            </footer>
        </Card>
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

function DayRailLanding({ date, status, summary, lineup, loading, onBuildFloor, onContinueSettle, onEditFloor }) {
    const stage = getLandingStage(status);
    const railSteps = getRailSteps({ shiftStatus: status });

    const onStepClick = (key) => {
        if (key === "floor") onEditFloor?.();
        else if (key === "settle") onContinueSettle?.();
    };

    return (
        <div className="space-y-3 sm:space-y-4">
            <DayRail steps={railSteps} onStepClick={onStepClick} />

            {loading ? (
                <Card className="px-6 py-16 text-center text-sm text-[var(--color-ink-soft)]">Loading day…</Card>
            ) : stage === "closed" ? (
                <div className="space-y-3">
                    <DayPayoutPanel date={date} summary={summary} status={status} loading={false} />
                    <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={onEditFloor}>
                            Edit shift
                        </Button>
                    </div>
                </div>
            ) : stage === "settle" ? (
                <FloorLineup lineup={lineup} onContinueSettle={onContinueSettle} onEditFloor={onEditFloor} />
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
