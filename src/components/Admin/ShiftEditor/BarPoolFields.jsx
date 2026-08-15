import { isRunnersFeeDerived, isRunnersFeeOverridden } from "../shiftEditorUtils";
import { PoolField } from "./PoolField";

// The one signal the captain asked for on the Runners Fee: this amount was set by
// hand, not derived. Nothing more - no history, no who-and-when, no diff against the
// computed figure. A fee sitting at 3% of food sales is the norm and stays silent,
// because marking every ordinary shift would be noise rather than information.
function EditedBadge() {
    return (
        <span
            className="inline-flex h-[15px] items-center rounded-full bg-[var(--color-warning-soft)] px-1.5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.06em] text-[var(--color-warning)]"
            title="Set by hand - this is not 3% of the food sales entered"
        >
            Edited
        </span>
    );
}

// Money inputs for the bar pool. Rendered inside the single entry panel.
//
// Food Sales and Runners Fee are a PAIR and are laid out as one: the fee is 3% of the
// bar's food sales, prefilled from the field beside it. Only the fee is money that
// moves - it comes off the bar's CTP and lands on the dining pool, exactly as it did
// when it was typed blind (engine.js §6). Food sales is context that funds nothing,
// which is why the engine records it and spends none of it.
export function BarPoolFields({ barTeam, onBarPoolChange, onBarFoodSalesChange }) {
    const pools = barTeam.pools || {};
    const overridden = isRunnersFeeOverridden(pools);
    const derived = isRunnersFeeDerived(pools);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            <PoolField label="Bar Sales" value={pools.sales} onChange={(value) => onBarPoolChange("sales", value)} />
            <PoolField label="Tips (CTP)" value={pools.tips} onChange={(value) => onBarPoolChange("tips", value)} />
            <PoolField label="Gratuity" value={pools.gratuity} onChange={(value) => onBarPoolChange("gratuity", value)} />
            <PoolField label="Covers" money={false} value={pools.covers} onChange={(value) => onBarPoolChange("covers", value)} />
            <PoolField
                label="Food Sales"
                value={pools.foodSales}
                onChange={onBarFoodSalesChange}
                note="The bar's total food sales. The Runners Fee is 3% of it."
            />
            <PoolField
                label="Runners Fee"
                value={pools.runners}
                onChange={(value) => onBarPoolChange("runners", value)}
                badge={overridden ? <EditedBadge /> : null}
                // The amount is the field, so the note never argues with what is typed:
                // it says where the number came from while it is still the derived 3%,
                // and steps back once someone has set their own rate.
                note={derived
                    ? "3% of food sales. Edit the amount to use a different rate."
                    : overridden
                        ? "Set by hand - not 3% of the food sales entered."
                        : "Enter food sales above to fill this at 3%."}
            />
        </div>
    );
}
