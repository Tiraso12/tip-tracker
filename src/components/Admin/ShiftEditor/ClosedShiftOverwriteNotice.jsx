// Shown on every editor step of a closed shift, from the moment the editor
// opens - not only on Review immediately before Confirm & Save. Same copy and
// banner style on Floor plan, Settle up, and Review so a paid-out day is never
// silent while it is being edited.
export function ClosedShiftOverwriteNotice({ date }) {
    if (!date) return null;
    return (
        <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--color-warning)]">
            <span aria-hidden="true">⚠</span>
            <span>Re-saving overwrites the saved payouts for {date}.</span>
        </p>
    );
}
