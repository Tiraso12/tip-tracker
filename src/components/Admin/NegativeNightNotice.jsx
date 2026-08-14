import { fmtMoney, selectNegativePayouts } from "./shiftEditorUtils";
import { roleLabel } from "../../utils/roleLabels";

// A night that records someone at a negative amount, said plainly.
//
// THE THING TO UNDERSTAND BEFORE CHANGING ANY OF THIS: a negative is CORRECT. The
// bar's Runners Fee comes out of CTP, so on a contract-only night - where the money
// arrives as gratuity and there is no charged tip to draw from - paying the runners
// drives the CTP side below zero. That is the system working. It resolves across the
// week, where the CTP total nets the negative night against the positive ones, which
// is what the pay statement already shows.
//
// So this is a STATEMENT, not an alarm, and it is styled as one: the neutral surface
// every other read-only block on Review uses, never the warning or danger colours that
// mean "you must fix this before saving". Nothing here blocks or clamps anything, and
// nothing should be added that does - the captain was offered a guard against negative
// payouts and declined it deliberately. Making it visible IS the fix.
//
// Rendered on both sides of the save: Review, before the night is committed, and the
// settled day, where someone reading it back meets the same explanation rather than an
// unexplained minus sign.
function NegativeNightNotice({ payoutRows = [] }) {
    const negatives = selectNegativePayouts(payoutRows);
    if (negatives.length === 0) return null;

    return (
        <section
            data-testid="negative-night-notice"
            className="rounded-[var(--radius-md)] border border-[var(--color-line-strong)] bg-[var(--color-surface-muted)] px-4 py-3.5"
        >
            <strong className="block text-[13px] font-semibold text-[var(--color-ink)]">
                {negatives.length === 1
                    ? "This night records a negative amount"
                    : "This night records negative amounts"}
            </strong>

            <ul className="mt-2 space-y-1">
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

            <p className="mt-2.5 text-[11.5px] leading-relaxed text-[var(--color-ink-soft)]">
                That is a real amount, not an error. The bar's Runners Fee is paid out of CTP, so a night
                whose money all arrives as gratuity - a contract with no charged tips - leaves the CTP side
                below zero. It balances out over the week: the week's CTP total subtracts this night from
                the nights that were positive, and the pay statement shows the netted week.
            </p>
        </section>
    );
}

export default NegativeNightNotice;
