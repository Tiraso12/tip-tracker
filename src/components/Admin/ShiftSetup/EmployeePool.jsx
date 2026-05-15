import React, { useState } from 'react';
import styles from './ShiftSetup.module.css';

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

    return (
        <div className={styles.poolPanel}>
            <h3 className={styles.panelTitle}>Available Employees</h3>
            <input
                type="text"
                className={styles.searchInput}
                placeholder="Search employee..."
                value={searchTerm}
                aria-label="Search available employees"
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <div className={styles.roleFilters} aria-label="Filter available employees by role">
                {ROLE_FILTERS.map(filter => (
                    <button
                        key={filter.value}
                        type="button"
                        className={`${styles.roleFilterBtn} ${roleFilter === filter.value ? styles.roleFilterActive : ''}`}
                        onClick={() => setRoleFilter(filter.value)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>

            {selectedTeamId && (
                <div className={styles.clickHint}>
                    Assigning to {selectedTargetLabel || 'selected team'}. Click employees below.
                </div>
            )}

            <div className={styles.employeeList}>
                {filtered.length === 0 ? (
                    <div className={styles.emptyMsg}>No available employees match this filter.</div>
                ) : filtered.map(emp => (
                    <div
                        key={emp.uid}
                        className={`${styles.poolItem} ${clickable ? styles.poolItemClickable : ''}`}
                        draggable
                        onDragStart={(e) => onDragStart(e, emp.uid, 'pool')}
                        onClick={() => clickable && onEmployeeClick(emp)}
                        title={clickable ? `Assign ${emp.username || emp.name} to selected team` : 'Drag to assign'}
                    >
                        <span className={styles.empName}>{emp.name || emp.username}</span>
                        <span className={styles.empRole}>{emp.role}</span>
                    </div>
                ))}
            </div>

            {showUnregForm ? (
                <div className={styles.addUnregForm}>
                    <label>Temporary Staff Name</label>
                    <input
                        type="text"
                        placeholder="E.g., Guest Server"
                        value={unregForm.name}
                        onChange={(e) => setUnregForm(prev => ({ ...prev, name: e.target.value }))}
                        autoFocus
                    />
                    <p style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                        Use this for someone working today who has not created an account yet. Their history can be merged into a real account later.
                    </p>
                    <label>Role</label>
                    <select
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
                    <div className={styles.unregFormActions}>
                        <button className={styles.unregFormCancel} onClick={() => setShowUnregForm(false)}>Cancel</button>
                        <button className={styles.unregFormSave} onClick={handleCreateUnregistered}>Create Temporary Staff</button>
                    </div>
                </div>
            ) : (
                <button className={styles.addUnregBtn} onClick={() => setShowUnregForm(true)}>
                    + Add Temporary Staff
                </button>
            )}
        </div>
    );
}

export default React.memo(EmployeePool);
