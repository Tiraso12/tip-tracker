import React, { useState } from 'react';

const ROLE_FILTERS = [
    { value: 'all', label: 'All' },
    { value: 'captain', label: 'Captains' },
    { value: 'server', label: 'Servers' },
    { value: 'back', label: 'Backs' },
    { value: 'assistant', label: 'Assistants' },
    { value: 'bartender', label: 'Bar' },
    { value: 'runner', label: 'Runners' },
    { value: 'temp', label: 'Temp' },
];

function EmployeePool({ employees, assignedUids, onDragStart, onEmployeeClick, selectedTeamId, selectedTargetLabel, onAddUnregistered }) {
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
        "flex-none border rounded-[var(--radius-xs)] px-2 py-[0.28rem] text-[0.7rem] font-bold cursor-pointer transition-colors duration-150",
        roleFilter === value
            ? "bg-[var(--color-accent)] border-[var(--color-accent)] text-white"
            : "bg-[var(--color-surface)] border-[var(--color-line)] text-[var(--color-ink-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-ink)]",
    ].join(" ");

    const poolItemClass = [
        "bg-[var(--color-bg)] px-2.5 py-[0.38rem] rounded-[var(--radius-md)] border border-transparent flex justify-between items-center transition-colors duration-150",
        clickable
            ? "cursor-pointer hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
            : "cursor-grab hover:border-[var(--color-accent)] active:cursor-grabbing",
    ].join(" ");

    const inputClass = "w-full px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--color-surface)] border border-[var(--color-line)] text-[var(--color-ink)] text-[0.8rem] focus:outline-none focus:border-[var(--color-accent)]";
    const formInputClass = "w-full px-2 py-[0.35rem] rounded-[var(--radius-xs)] bg-[var(--color-bg)] border border-[var(--color-line)] text-[var(--color-ink)] text-[0.75rem]";

    return (
        <div className="bg-[var(--color-surface-muted)] rounded-[var(--radius-lg)] p-[0.85rem] flex flex-col gap-2.5 overflow-y-auto max-h-full max-[900px]:max-h-none">
            <h3 className="text-[0.7rem] font-bold m-0 uppercase tracking-[0.07em] text-[var(--color-ink-muted)]">Available Employees</h3>
            <input
                type="text"
                className={inputClass}
                placeholder="Search employee..."
                value={searchTerm}
                aria-label="Search available employees"
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className="flex flex-wrap gap-1.5 pb-0.5 max-[900px]:flex-nowrap max-[900px]:overflow-x-auto" aria-label="Filter available employees by role">
                {ROLE_FILTERS.map(filter => (
                    <button
                        key={filter.value}
                        type="button"
                        className={filterBtnClass(filter.value)}
                        onClick={() => setRoleFilter(filter.value)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {selectedTeamId && (
                <div className="bg-[var(--color-accent-soft)] border border-[var(--color-line-strong)] rounded-[var(--radius-xs)] px-[0.55rem] py-[0.28rem] text-[0.7rem] text-[var(--color-accent)] font-semibold text-center">
                    Assigning to {selectedTargetLabel || 'selected team'}. Click employees below.
                </div>
            )}

            <div className="flex flex-col gap-1.5 overflow-y-auto min-h-0">
                {filtered.length === 0 ? (
                    <div className="text-[var(--color-ink-muted)] text-[0.78rem] text-center p-3 border border-dashed border-[var(--color-line)] rounded-[var(--radius-md)]">
                        No available employees match this filter.
                    </div>
                ) : filtered.map(emp => (
                    <div
                        key={emp.uid}
                        className={poolItemClass}
                        draggable
                        onDragStart={(e) => onDragStart(e, emp.uid, 'pool')}
                        onClick={() => clickable && onEmployeeClick(emp)}
                        title={clickable ? `Assign ${emp.username || emp.name} to selected team` : 'Drag to assign'}
                    >
                        <span className="font-semibold text-[0.8rem]">{emp.name || emp.username}</span>
                        <span className="text-[0.65rem] text-[var(--color-accent)] uppercase tracking-[0.05em] font-bold">{emp.role}</span>
                    </div>
                ))}
            </div>

            {showUnregForm ? (
                <div className="mt-2 p-2.5 bg-[var(--color-surface)] rounded-[var(--radius-md)] border border-[var(--color-accent)] flex flex-col gap-1.5">
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
                        Use this for someone working today who has not created an account yet. Their history can be merged into a real account later.
                    </p>
                    <label className="text-[0.7rem] text-[var(--color-ink-muted)] font-semibold -mb-1">Role</label>
                    <select
                        className={formInputClass}
                        value={unregForm.role}
                        onChange={(e) => setUnregForm(prev => ({ ...prev, role: e.target.value }))}
                    >
                        <option value="captain">Captain</option>
                        <option value="server">Server</option>
                        <option value="back">Back</option>
                        <option value="assistant">Assistant</option>
                        <option value="bartender">Bartender</option>
                        <option value="runner">Runner</option>
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
                    className="w-full mt-2 py-1.5 bg-[var(--color-surface-muted)] border border-dashed border-[var(--color-line-strong)] rounded-[var(--radius-xs)] text-[var(--color-ink-muted)] text-[0.75rem] font-semibold text-center cursor-pointer transition-all duration-200 hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-ink)] hover:border-[var(--color-accent)]"
                    onClick={() => setShowUnregForm(true)}
                >
                    + Add Temporary Staff
                </button>
            )}
        </div>
    );
}

export default React.memo(EmployeePool);
