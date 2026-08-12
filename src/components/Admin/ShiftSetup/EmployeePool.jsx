import React, { useState } from 'react';
import ScrollRail from '../ScrollRail';
import { ASSIGNABLE_ROLES, rolePluralLabel, roleShortLabel } from '../../../utils/roleLabels';

// Captains lead the list per captain direction; the "All" chip is gone - the
// unfiltered view is the default, and tapping the active role chip again clears it.
// Each chip names the GROUP of people in a role, so it reads the plural label.
// "Temp" is not a role - it filters to temporary staff profiles of any role.
const ROLE_FILTERS = [
    ...ASSIGNABLE_ROLES.map(role => ({
        value: role,
        // The bar chip reads "Bar", not the group name "Bar Team": this screen
        // already has a "Bar Team" drop zone, and two controls sharing one name
        // is ambiguous to read and to tap.
        label: role === 'bartender' ? roleShortLabel(role) : rolePluralLabel(role),
    })),
    { value: 'temp', label: 'Temp' },
];

function EmployeePool({
    employees,
    assignedUids,
    onDragStart,
    onEmployeeClick,
    selectedTeamId,
    selectedTargetLabel,
    onAddUnregistered,
    title = 'Available Employees',
    className,
    hideSearch = false,
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [showUnregForm, setShowUnregForm] = useState(false);
    const [unregForm, setUnregForm] = useState({ name: '', role: 'server' });

    const unassigned = employees.filter(emp => !assignedUids.includes(emp.uid));

    const filtered = unassigned.filter(emp => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = emp.name?.toLowerCase().includes(term) || emp.username?.toLowerCase().includes(term);
        const matchesRole = roleFilter === 'all'
            || (roleFilter === 'temp' ? emp.isUnregistered : emp.role === roleFilter);
        return matchesSearch && matchesRole;
    });

    const clickable = !!selectedTeamId;

    const handleCreateUnregistered = () => {
        if (!unregForm.name.trim()) return;
        if (onAddUnregistered) {
            onAddUnregistered(unregForm.name.trim(), unregForm.role);
        }
        setShowUnregForm(false);
        setUnregForm({ name: '', role: 'server' });
    };

    const filterBtnClass = (value) => [
        "flex-none border rounded-[var(--radius-xs)] px-2 py-[0.28rem] text-[0.7rem] font-bold cursor-pointer transition-colors duration-150 max-[560px]:px-3 max-[560px]:py-2",
        roleFilter === value
            ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
            : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]",
    ].join(" ");

    const poolItemClass = [
        "bg-[var(--color-bg)] px-2.5 py-[0.38rem] rounded-[var(--radius-md)] border border-transparent flex justify-between items-center transition-colors duration-150 max-[560px]:min-h-11 max-[560px]:px-3",
        clickable
            ? "cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            : "cursor-grab hover:border-[var(--color-accent)] active:cursor-grabbing",
    ].join(" ");

    const inputClass = "w-full px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)] text-[0.8rem] focus:outline-none focus:border-[var(--color-accent)] max-[560px]:h-11";
    const formInputClass = "w-full px-2 py-[0.35rem] rounded-[var(--radius-xs)] bg-[var(--color-bg)] border border-[var(--color-line)] text-[var(--color-ink)] text-[0.75rem]";

    return (
        <div className={className || "bg-[var(--color-surface-muted)] rounded-[var(--radius-lg)] p-[0.85rem] flex flex-col gap-2.5 overflow-y-auto max-h-full max-[900px]:max-h-none max-[560px]:rounded-[var(--radius-md)] max-[560px]:p-3"}>
            <div className="flex-none flex items-center justify-between gap-3">
                <h3 className="text-[0.7rem] font-bold m-0 uppercase tracking-[0.07em] text-[var(--color-ink-muted)]">{title}</h3>
                <span className="hidden max-[560px]:inline text-[0.7rem] text-[var(--color-ink-muted)]">
                    {filtered.length} available
                </span>
            </div>
            {/* The mobile bottom-sheet picker passes hideSearch: the staff lists are
                short, search is rarely used, and dropping it reclaims vertical space for
                the list. Desktop keeps the search input (no hideSearch prop). */}
            {hideSearch ? null : (
                <input
                    type="text"
                    className={inputClass}
                    placeholder="Search employee..."
                    value={searchTerm}
                    aria-label="Search available employees"
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            )}

            {/* Role filter chips. Desktop/tablet keep the multi-row wrap; on phones the
                seven chips would wrap to 2-3 rows and shove the employee list below the
                fold, so they become a single horizontal scroll rail (shared ScrollRail:
                edge fades + a "›" cue signal the off-screen chips). Tap-to-toggle-off and
                aria-pressed are preserved in both layouts. */}
            {(() => {
                const chipButtons = ROLE_FILTERS.map(filter => (
                    <button
                        key={filter.value}
                        type="button"
                        className={filterBtnClass(filter.value)}
                        aria-pressed={roleFilter === filter.value}
                        onClick={() => setRoleFilter(prev => prev === filter.value ? 'all' : filter.value)}
                    >
                        {filter.label}
                    </button>
                ));
                return (
                    <>
                        <div className="flex-none flex flex-wrap gap-1.5 pb-0.5 max-[560px]:hidden" aria-label="Filter available employees by role">
                            {chipButtons}
                        </div>
                        <div className="hidden max-[560px]:block flex-none">
                            <ScrollRail
                                ariaLabel="Filter available employees by role"
                                depsKey={roleFilter}
                                className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                            >
                                {chipButtons}
                            </ScrollRail>
                        </div>
                    </>
                );
            })()}

            {selectedTeamId && (
                <div className="flex-none bg-[var(--color-accent-soft)] border border-[var(--color-line-strong)] rounded-[var(--radius-xs)] px-[0.55rem] py-[0.28rem] text-[0.7rem] text-[var(--color-accent)] font-semibold text-center">
                    Assigning to {selectedTargetLabel || 'selected team'}. Click employees below.
                </div>
            )}

            <div className="flex-1 flex flex-col gap-1.5 overflow-y-auto min-h-0">
                {filtered.length === 0 ? (
                    <div className="text-[var(--color-ink-muted)] text-[0.78rem] text-center p-3 border border-dashed border-[var(--color-line)] rounded-[var(--radius-md)]">
                        No available employees match this filter.
                    </div>
                ) : filtered.map(emp => (
                    <div
                        key={emp.uid}
                        className={poolItemClass}
                        draggable
                        role={clickable ? "button" : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onDragStart={(e) => onDragStart(e, emp.uid, 'pool')}
                        onClick={() => clickable && onEmployeeClick(emp)}
                        onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEmployeeClick(emp); } } : undefined}
                        title={clickable ? `Assign ${emp.username || emp.name} to selected team` : 'Drag to assign'}
                    >
                        <span className="font-semibold text-[0.8rem]">{emp.name || emp.username}</span>
                        <span className="text-[0.65rem] text-[var(--color-accent)] uppercase tracking-[0.05em] font-bold">{roleShortLabel(emp.role)}</span>
                    </div>
                ))}
            </div>

            {showUnregForm ? (
                <div className="flex-none mt-2 p-2.5 bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-accent)] flex flex-col gap-1.5">
                    <label className="text-[0.7rem] text-[var(--color-ink-muted)] font-semibold -mb-1">Temporary Staff Name</label>
                    <input
                        type="text"
                        className={formInputClass}
                        placeholder="E.g., Guest Server"
                        value={unregForm.name}
                        onChange={(e) => setUnregForm(prev => ({ ...prev, name: e.target.value }))}
                        autoFocus
                    />
                    <p className="m-0 mt-1 mb-0.5 text-[0.75rem] text-[var(--color-ink-muted)] leading-[1.35]">
                        For someone working today who has no account yet. Once their real account
                        is approved, merge this profile into it right away - if a night gets saved
                        under both, the merge is blocked for good.
                    </p>
                    <label className="text-[0.7rem] text-[var(--color-ink-muted)] font-semibold -mb-1">Role</label>
                    <select
                        className={formInputClass}
                        value={unregForm.role}
                        onChange={(e) => setUnregForm(prev => ({ ...prev, role: e.target.value }))}
                    >
                        {ASSIGNABLE_ROLES.map(role => (
                            <option key={role} value={role}>{roleShortLabel(role)}</option>
                        ))}
                    </select>
                    <div className="flex gap-1.5 mt-0.5">
                        <button
                            className="flex-1 py-[0.35rem] rounded-[var(--radius-xs)] text-[0.7rem] font-semibold cursor-pointer transition-opacity duration-150 hover:opacity-80 bg-transparent text-[var(--color-ink-muted)] border border-[var(--color-line)]"
                            onClick={() => setShowUnregForm(false)}
                        >Cancel</button>
                        <button
                            className="flex-1 py-[0.35rem] rounded-[var(--radius-xs)] text-[0.7rem] font-semibold cursor-pointer transition-opacity duration-150 hover:opacity-80 bg-[var(--color-accent)] text-white border-0"
                            onClick={handleCreateUnregistered}
                        >Create Temporary Staff</button>
                    </div>
                </div>
            ) : (
                <button
                    className="flex-none w-full mt-2 py-1.5 bg-[var(--color-surface-muted)] border border-dashed border-[var(--color-line-strong)] rounded-[var(--radius-xs)] text-[var(--color-ink-muted)] text-[0.75rem] font-semibold text-center cursor-pointer transition-all duration-200 hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)]"
                    onClick={() => setShowUnregForm(true)}
                >
                    + Add Temporary Staff
                </button>
            )}
        </div>
    );
}

export default React.memo(EmployeePool);
