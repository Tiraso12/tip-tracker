import { useState } from "react";
import { fmtMoney, selectNegativePayouts, selectNegativePools } from "./shiftEditorUtils";
import { roleLabel } from "../../utils/roleLabels";

// A night that records a negative amount, said plainly.
//
// THE THING TO UNDERSTAND BEFORE CHANGING ANY OF THIS: a negative is CORRECT. The
// bar's Runners Fee comes out of CTP, so on a contract-only night - where the money
// arrives as gratuity and there is no charged tip to draw from - paying the runners
// drives the CTP side below zero. That is the system working. It resolves across the
// week, where the CTP total nets the negative night against the positive ones, which
// is what the pay statement already shows.
//
// So this is a STATEMENT, not an alarm, and it is styled as one: the neutral surface
// every other read-only block uses, never the warning or danger colours that mean "you
// must fix this before saving". Nothing here blocks or clamps anything, and nothing
// should be added that does - the captain was offered a guard against negative payouts
// and declined it deliberately. Making it visible IS the fix.
//
// It reports TWO things, and they are not the same question. A negative PERSON is a
// recorded amount, CTP netted against GRT for one human. A negative POOL is the money
// before it is split. A contract-heavy night can drive the CTP pool under while every
// share still lands positive - so a notice that only ever looked at people said nothing
// on exactly the night the pool went furthest under. The engine's own red "Bar CTP pool
// is negative" used to be the only cue there, and read alone it framed a correct night
// as a fault; that string is now filtered out of the red block in favour of this one
// (`withoutNegativePoolWarnings`). Widening this was the price of removing it, so do not
// narrow it back without putting that warning back first.
//
// Rendered on both sides of the save: Review, before the night is committed, and the
// settled day, where someone reading it back meets the same explanation rather than an
// unexplained minus sign.
function NegativeNightNotice({ payoutRows = [], adjustedPools = {} }) {
    const [isOpen, setIsOpen] = useState(false);
    const negatives = selectNegativePayouts(payoutRows);
    const negativePools = selectNegativePools(adjustedPools);
    const itemCount = negatives.length + negativePools.length;
    if (itemCount === 0) return null;

    const headline = itemCount === 1
        ? "This night records a negative amount"
        : "This night records negative amounts";

    const rows = (
        <ul className="space-y-1">
            {negativePools.map(pool => (
                <li key={pool.key} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[12.5px] text-[var(--color-ink)]">
                        {pool.label}
                        <span className="text-[var(--color-ink-soft)]"> · pool</span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[12.5px] font-semibold text-[var(--color-ink)]">
                        {fmtMoney(pool.total)}
                    </span>
                </li>
            ))}
            {negatives.map(person => (
                <li key={person.uid} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-[12.5px] text-[var(--color-ink)]">
                        {person.name}
                        {person.role ? (
                            <span className="text-[var(--color-ink-soft)]"> · {roleLabel(person.role)}</span>
                        ) : null}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[12.5px] font-semibold text-[var(--color-ink)]">
                        {fmtMoney(person.total)}
                    </span>
                </li>
            ))}
        </ul>
    );

    const explanation = (
        <p className="text-[11.5px] leading-relaxed text-[var(--color-ink-soft)]">
            That is a real amount, not an error. The bar's Runners Fee is paid out of CTP, so a night
            whose money all arrives as gratuity - a contract with no charged tips - leaves the CTP side
            below zero. It balances out over the week: the week's CTP total subtracts this night from
            the nights that were positive, and the pay statement shows the netted week.
        </p>
    );

    return (
        <section data-testid="negative-night-notice">
            {/* Desktop: nothing is hidden. There is room for the whole statement, and a
                figure someone has to tap to see is a figure they will not read. */}
            <div className="max-[560px]:hidden rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] px-4 py-3.5">
                <strong className="block text-[13px] font-semibold text-[var(--color-ink)]">
                    {headline}
                </strong>
                <div className="mt-2">{rows}</div>
                <div className="mt-2.5">{explanation}</div>
            </div>

            {/* Phone: the Shift Audit shape from DayPayoutPanel - a tap-to-open row whose
                collapsed state still carries the headline and every figure as chips, so
                the fact is never behind the tap. Only the explanation is.

                It stays neutral in BOTH states. The collapsed row is the one most likely
                to be restyled for attention later; a danger or warning colour here would
                turn a correct night into a fault at a glance, which is the single thing
                this component exists to prevent. */}
            <div className="hidden max-[560px]:block rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] overflow-hidden">
                <button
                    type="button"
                    onClick={() => setIsOpen(prev => !prev)}
                    className="w-full px-4 py-3 flex items-start justify-between gap-3 text-left"
                    aria-expanded={isOpen}
                >
                    <div className="min-w-0">
                        <div className="text-[12.5px] font-semibold text-[var(--color-ink)]">
                            {headline}
                        </div>
                        {/* Chips are the COLLAPSED summary and nothing else. Open, the
                            rows below say the same figures with room for the pool/role
                            qualifier and an aligned money column, so leaving both on
                            printed every amount twice. */}
                        <div className={"mt-1.5 flex-wrap gap-1.5 text-[0.72rem] text-[var(--color-ink-soft)] " + (isOpen ? "hidden" : "flex")}>
                            {negativePools.map(pool => (
                                <span key={pool.key} className="rounded-full bg-[var(--color-surface)] px-2 py-1">
                                    {pool.label}{" "}
                                    <span className="font-mono tabular-nums text-[var(--color-ink)]">
                                        {fmtMoney(pool.total)}
                                    </span>
                                </span>
                            ))}
                            {negatives.map(person => (
                                <span key={person.uid} className="rounded-full bg-[var(--color-surface)] px-2 py-1">
                                    {person.name}{" "}
                                    <span className="font-mono tabular-nums text-[var(--color-ink)]">
                                        {fmtMoney(person.total)}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                    <span className="shrink-0 text-xs text-[var(--color-accent)]">
                        {isOpen ? "Hide" : "Why"}
                    </span>
                </button>

                {isOpen ? (
                    <div className="px-4 pb-4 space-y-2.5">
                        {rows}
                        {explanation}
                    </div>
                ) : null}
            </div>
        </section>
    );
}

export default NegativeNightNotice;
