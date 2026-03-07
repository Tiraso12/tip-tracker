import React, { useState } from 'react';
import styles from './ShiftSetup.module.css';

function EmployeePool({ employees, assignedUids, onDragStart, onEmployeeClick, selectedTeamId }) {
    const [searchTerm, setSearchTerm] = useState('');

    const unassigned = employees.filter(emp => !assignedUids.includes(emp.uid));

    const filtered = unassigned.filter(emp => {
        const term = searchTerm.toLowerCase();
        return (emp.name?.toLowerCase().includes(term) || emp.username?.toLowerCase().includes(term));
    });

    const clickable = !!selectedTeamId;

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
                {filtered.length === 0 && (
                    <p className={styles.emptyMsg}>No employees found.</p>
                )}
            </div>
        </div>
    );
}

export default React.memo(EmployeePool);
