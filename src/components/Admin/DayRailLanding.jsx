import DayPayoutPanel from "./DayPayoutPanel";
import DayRail from "./DayRail";
import { Button, Card } from "../ui";

// Approach A landing. The day rail leads with its first incomplete step:
//  - no floor plan yet  -> first-run hero into Floor plan (step 1)
//  - floor built (setup) -> "continue to settle up", rail pre-advanced to step 2
//  - closed / paid       -> the Pay out review (as today), rail all done

function friendlyDate(dateKey) {
    try {
        const d = new Date(dateKey + "T12:00:00");
        return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    } catch {
        return dateKey;
    }
}

function Hero({ eyebrow, title, body, children }) {
    return (
        <Card className="px-6 py-10 text-center sm:py-14">
            <div className="mx-auto max-w-sm space-y-3">
                <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                    {eyebrow}
                </span>
                <h2 className="font-display text-2xl font-medium tracking-tight text-[var(--color-ink)]">
                    {title}
                </h2>
                {body ? <p className="text-sm text-[var(--color-ink-soft)]">{body}</p> : null}
                <div className="flex flex-col items-center gap-2 pt-2">{children}</div>
            </div>
        </Card>
    );
}

function DayRailLanding({ date, status, summary, loading, onBuildFloor, onContinueSettle, onEditFloor }) {
    const floorDone = status === "setup" || status === "closed";
    const closed = status === "closed";

    const railSteps = [
        { key: "floor", index: 1, label: "Floor", state: floorDone ? "done" : "active", clickable: Boolean(onEditFloor) },
        { key: "settle", index: 2, label: "Settle", state: closed ? "done" : floorDone ? "active" : "pending", clickable: floorDone },
        { key: "review", index: 3, label: "Review", state: closed ? "done" : "pending", clickable: false },
        { key: "payout", index: 4, label: "Pay out", state: closed ? "done" : "end", clickable: false },
    ];

    const onStepClick = (key) => {
        if (key === "floor") onEditFloor?.();
        else if (key === "settle") onContinueSettle?.();
    };

    return (
        <div className="space-y-3 sm:space-y-4">
            <DayRail steps={railSteps} onStepClick={onStepClick} />

            {loading ? (
                <Card className="px-6 py-16 text-center text-sm text-[var(--color-ink-soft)]">Loading day…</Card>
            ) : closed ? (
                <div className="space-y-3">
                    <DayPayoutPanel date={date} summary={summary} status={status} loading={false} />
                    <div className="flex justify-end">
                        <Button variant="secondary" size="sm" onClick={onEditFloor}>
                            Edit shift
                        </Button>
                    </div>
                </div>
            ) : floorDone ? (
                <Hero
                    eyebrow={friendlyDate(date)}
                    title="Floor plan is set"
                    body="The lineup is saved. When service ends, settle up the money to calculate payouts."
                >
                    <Button onClick={onContinueSettle} className="w-full sm:w-auto">
                        Continue to Settle up →
                    </Button>
                    <button
                        type="button"
                        onClick={onEditFloor}
                        className="text-xs font-medium text-[var(--color-accent)] hover:underline"
                    >
                        Edit floor plan
                    </button>
                </Hero>
            ) : (
                <Hero
                    eyebrow={friendlyDate(date)}
                    title="Let's set up the floor"
                    body="The day starts with the floor plan. Build today's lineup to begin."
                >
                    <Button onClick={onBuildFloor} className="w-full sm:w-auto">
                        Build floor plan →
                    </Button>
                </Hero>
            )}
        </div>
    );
}

export default DayRailLanding;
