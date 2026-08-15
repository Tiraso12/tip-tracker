// The jump out of a read-only row to the screen where that thing is actually edited.
// Full width rather than a right-aligned link: the save button floats bottom-right, so
// a short right-aligned action sits exactly where the pill lands and reads as missing.
export function FixJump({ label, onClick }) {
    return (
        <button
            type="button"
            onClick={() => onClick?.()}
            className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-semibold text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)]"
        >
            {label} <span aria-hidden="true">→</span>
        </button>
    );
}
