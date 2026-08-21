import { ROLE_POINTS } from "../../../utils/constants";
import { roleLabel } from "../../../utils/roleLabels";
import {
    fmtAmount,
    getPayoutNonCashTotal,
    isNegativeMoney,
    toMoney,
} from "../shiftEditorUtils";

// The "everyone" roster under the spot-check card. Three money columns just wide
// enough for a four-figure payout, so a 390px phone still leaves the name column
// enough room to read; the columns are fixed rather than fluid so the digits stay in
// their own vertical run down the list.
// One figure, rendered for the eye to compare against a spreadsheet column. The "$"
// is small, muted and floats with the digits instead of sitting in its own column -
// a pinned "$" would push a 3-digit figure out of alignment with a 2-digit one, and
// the decimal points lining up is the whole point of the card. Always two decimals:
// the captain's tolerance is measured in cents, so the cents are load-bearing.
function HeroMoney({ value, className = "" }) {
    return (
        <span className={"inline-flex items-baseline whitespace-nowrap font-mono tabular-nums " + className}>
            {isNegativeMoney(value) ? <span aria-hidden="true">−</span> : null}
            <span className="text-[0.55em] font-normal text-[var(--color-ink-muted)] mr-px">$</span>
            {fmtAmount(value)}
        </span>
    );
}

// A row of the spot-check card: label hard left, figure hard right, nothing in
// between, hairline underneath. The hairline is what re-anchors the eye each time it
// comes back from the spreadsheet, so a row is never silently skipped.
function SpotCheckRow({ label, sub, value, rule = "hairline", emphasis = false, testId }) {
    const ruleClass = rule === "total"
        ? "border-b-2 border-[var(--color-ink)]/70"
        : rule === "none"
            ? ""
            : "border-b border-[var(--color-line)]";
    return (
        <div data-testid={testId} className={"flex items-baseline justify-between gap-4 px-4 py-3 min-h-[44px] " + ruleClass}>
            <span className="flex flex-col">
                <span className={"text-[13px] font-semibold uppercase tracking-[0.1em] "
                    + (emphasis ? "text-[var(--color-ink)]" : "text-[var(--color-ink-soft)]")}>
                    {label}
                </span>
                {/* Sub-lines stay lowercase: uppercased they are wide enough to wrap
                    beside a 28px figure on a 390px phone, which breaks the row rhythm. */}
                {sub ? (
                    <span className="mt-0.5 text-[10px] tracking-[0.02em] text-[var(--color-ink-muted)]">{sub}</span>
                ) : null}
            </span>
            <HeroMoney
                value={value}
                className={"text-[22px] leading-none max-[380px]:text-[20px] "
                    + (emphasis ? "font-semibold text-[var(--color-accent)]" : "text-[var(--color-ink)]")}
            />
        </div>
    );
}

// The whole point of the Review step. One person, their figures, laid out as the
// vertical column a spreadsheet is read from. Nothing on the page outranks these
// figures - the card carries no eyebrow label, because the screen is the spot check.
export function SpotCheckCard({ subject }) {
    const { payout, atFullPoints, isCaptain } = subject;
    const isRunner = payout.role === "runner";
    // A runner has no CTP/GRT/cash in the engine at all - only a flat payout
    // (engine.js:99-110). Rendering the usual three rows would show two convincing
    // $0.00 figures that mean nothing, so a runner gets a single Runner pay figure.
    const points = toMoney(payout.points);

    return (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-accent)]/25 bg-[var(--color-surface)] overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
            <div className="px-4 pt-3 pb-2.5 border-b border-[var(--color-line)]">
                <div className="text-lg font-semibold leading-tight text-[var(--color-ink)]">{payout.name}</div>
                <div className="mt-0.5 text-[11px] text-[var(--color-ink-soft)]">
                    {roleLabel(payout.role)}
                    {isRunner ? null : <> · {points} {points === 1 ? "pt" : "pts"}</>}
                    {payout.teamId ? <> · {payout.teamId}</> : null}
                </div>
            </div>

            {/* The subject is the first captain at full point weighting. When there is
                none, say so out loud: a captain who left early takes home less than the
                full-shift captain the spreadsheet is read from, and a silent swap would
                read as a mismatch that is not one. */}
            {!atFullPoints ? (
                <p className="px-4 py-2 border-b border-[var(--color-line)] bg-[var(--color-warning-soft)] text-[11px] leading-snug text-[var(--color-warning)]">
                    {isCaptain
                        ? `No captain at full points tonight - this one worked ${points} of ${ROLE_POINTS.captain}, so expect less than your sheet's full-shift captain.`
                        : "No captain on this shift - checking the first payout instead."}
                </p>
            ) : null}

            {isRunner ? (
                <SpotCheckRow
                    label="Runner pay"
                    sub="flat rate · not pooled"
                    value={getPayoutNonCashTotal(payout)}
                    rule="none"
                    emphasis
                />
            ) : (
                <>
                    <SpotCheckRow label="CTP" value={payout.tips} />
                    <SpotCheckRow label="GRT" value={payout.gratuity} />
                    <SpotCheckRow label="Cash" value={payout.cash} rule="none" />
                    {/* Total reads last and is the one row lifted onto its own background,
                        closed by the accent bar - it is the bottom line, so it is what the
                        card emphasises. Cash needs no fencing of its own: the "CTP + GRT"
                        line under the figure already says what is in it, and staff know cash
                        is paid out separately. Computed from tips + gratuity rather than read
                        from the stored per-person `total`: the stored field now agrees (it is
                        CTP + GRT for every role), but ledger docs written before that rule
                        still fold cash in for dining staff, so the card computes and stays
                        right on old shifts too. */}
                    <div className="border-t-[3px] border-[var(--color-accent)] bg-[var(--color-surface-muted)]">
                        <SpotCheckRow
                            label="Total"
                            sub="CTP + GRT"
                            value={getPayoutNonCashTotal(payout)}
                            rule="none"
                            emphasis
                            testId="spot-check-total"
                        />
                    </div>
                </>
            )}
        </div>
    );
}
