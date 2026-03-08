import React, { useState } from 'react';
import styles from './ShiftSetup.module.css';

function EmployeePool({ employees, assignedUids, onDragStart, onEmployeeClick, selectedTeamId, onAddUnregistered }) {
    const [searchTerm, setSearchTerm] = useState('');
    const [showUnregForm, setShowUnregForm] = useState(false);
    const [unregForm, setUnregForm] = useState({ name: '', role: 'server' });

    const unassigned = employees.filter(emp => !assignedUids.includes(emp.uid));

    const filtered = unassigned.filter(emp => {
        const term = searchTerm.toLowerCase();
        return (emp.name?.toLowerCase().includes(term) || emp.username?.toLowerCase().includes(term));
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

            {selectedTeamId && (
                <div className={styles.clickHint}>
                    Click an employee to assign →
                </div>
            )}

            <div className={styles.employeeList}>
                {filtered.map(emp => (
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
                    <label>Temp Staff Name</label>
                    <input
                        type="text"
                        placeholder="E.g., Guest Server"
                        value={unregForm.name}
                        onChange={(e) => setUnregForm(prev => ({ ...prev, name: e.target.value }))}
                        autoFocus
                    />
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
                        <button className={styles.unregFormSave} onClick={handleCreateUnregistered}>Create</button>
                    </div>
                </div>
            ) : (
                <button className={styles.addUnregBtn} onClick={() => setShowUnregForm(true)}>
                    + Add Unregistered Staff
                </button>
            )}
        </div>
    );
}

export default React.memo(EmployeePool);
