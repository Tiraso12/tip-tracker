import React, { useState } from 'react';
import styles from './ShiftSetup.module.css';
import EmployeePool from './EmployeePool';
import TeamAssignmentPanel from './TeamAssignmentPanel';
import { ROLE_POINTS } from '../../../utils/distributionUtils';

export default function ShiftSetupDnd({
    allEmployees,
    teams, setTeams,
    barTeam, setBarTeam,
    runners, setRunners
}) {
    const [draggedData, setDraggedData] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [selectedTeamId, setSelectedTeamId] = useState(null); // click-to-assign target

    // Get assigned UIDs to hide them from the pool
    const getAssignedUids = () => {
        const uids = new Set();
        teams.forEach(t => t.members.forEach(m => uids.add(m.uid)));
        barTeam.members.forEach(m => uids.add(m.uid));
        runners.forEach(m => uids.add(m.uid));
        return Array.from(uids);
    };

    // ── Drag handlers ────────────────────────────────────
    const handleDragStart = (e, uid, sourceTeamId) => {
        setDraggedData({ uid, sourceTeamId });
        setTimeout(() => { }, 0);
    };

    const handleDragOver = (e, targetTeamId) => {
        e.preventDefault();
        setDragOverId(targetTeamId);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setDragOverId(null);
    };

    const handleDropPool = (e) => {
        e.preventDefault();
        setDragOverId(null);
        if (!draggedData) return;
        const { uid, sourceTeamId } = draggedData;
        if (sourceTeamId !== 'pool') removeEmployee(uid, sourceTeamId);
        setDraggedData(null);
    };

    const handleDropTeam = (e, targetTeamId) => {
        e.preventDefault();
        setDragOverId(null);
        if (!draggedData) return;

        const { uid, sourceTeamId } = draggedData;
        if (sourceTeamId === targetTeamId) { setDraggedData(null); return; }

        const emp = allEmployees.find(user => user.uid === uid);
        if (!emp) return;

        removeEmployee(uid, sourceTeamId);

        const pts = (targetTeamId !== 'runner' && targetTeamId !== 'bar')
            ? (ROLE_POINTS[emp.role] != null ? ROLE_POINTS[emp.role] : 4)
            : undefined;

        addEmployee(emp, targetTeamId, pts);
        setDraggedData(null);
    };

    // ── Click-to-assign ──────────────────────────────────
    const handleTeamClick = (teamId) => {
        // toggle: clicking the same team deselects it
        setSelectedTeamId(prev => prev === teamId ? null : teamId);
    };

    const handlePoolEmployeeClick = (emp) => {
        if (!selectedTeamId) return; // no team selected — nothing to do

        const pts = (selectedTeamId !== 'runner' && selectedTeamId !== 'bar')
            ? (ROLE_POINTS[emp.role] != null ? ROLE_POINTS[emp.role] : 4)
            : undefined;

        addEmployee(emp, selectedTeamId, pts);
        // keep team selected so user can keep clicking more employees
    };

    // ── Core helpers ─────────────────────────────────────
    const removeEmployee = (uid, teamId) => {
        if (teamId === 'pool') return;
        if (teamId === 'bar') {
            setBarTeam(prev => ({ ...prev, members: prev.members.filter(m => m.uid !== uid) }));
        } else if (teamId === 'runner') {
            setRunners(prev => prev.filter(m => m.uid !== uid));
        } else {
            setTeams(prev => prev.map(t =>
                t.teamId === teamId ? { ...t, members: t.members.filter(m => m.uid !== uid) } : t
            ));
        }
    };

    const addEmployee = (emp, targetTeamId, pts) => {
        const newMember = { uid: emp.uid, name: emp.username || emp.name, role: emp.role, points: pts };
        if (targetTeamId === 'bar') {
            setBarTeam(prev => ({ ...prev, members: [...prev.members, { ...newMember, role: 'bartender', points: undefined }] }));
        } else if (targetTeamId === 'runner') {
            setRunners(prev => [...prev, { ...newMember, role: 'runner', points: undefined }]);
        } else {
            setTeams(prev => prev.map(t =>
                t.teamId === targetTeamId ? { ...t, members: [...t.members, newMember] } : t
            ));
        }
    };

    const handleUpdatePoints = (teamId, uid, newPts) => {
        setTeams(prev => prev.map(t =>
            t.teamId === teamId
                ? { ...t, members: t.members.map(m => m.uid === uid ? { ...m, points: newPts } : m) }
                : t
        ));
    };

    const handleAddTeam = () => {
        if (teams.length >= 6) return;
        const newId = `team-${Date.now()}`;
        setTeams(prev => [...prev, { teamId: newId, members: [], pools: { tips: "", gratuity: "", cash: "", sales: "" } }]);
    };

    const handleRemoveTeam = () => {
        if (teams.length <= 1) return;
        const lastTeam = teams[teams.length - 1];
        if (lastTeam.members.length > 0) {
            if (!window.confirm(`Removing Restaurant Team ${teams.length} will return its ${lastTeam.members.length} assigned employees to the Unassigned Pool. Continue?`)) return;
        }
        if (selectedTeamId === lastTeam.teamId) setSelectedTeamId(null);
        setTeams(prev => prev.slice(0, -1));
    };

    return (
        <div className={styles.container}>
            <div
                className={styles.poolWrapper}
                onDragOver={(e) => { e.preventDefault(); setDragOverId('pool'); }}
                onDragLeave={handleDragLeave}
                onDrop={handleDropPool}
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
                <EmployeePool
                    employees={allEmployees}
                    assignedUids={getAssignedUids()}
                    onDragStart={handleDragStart}
                    onEmployeeClick={handlePoolEmployeeClick}
                    selectedTeamId={selectedTeamId}
                />
            </div>

            <TeamAssignmentPanel
                teams={teams}
                barTeam={barTeam}
                runners={runners}
                onAddTeam={handleAddTeam}
                onRemoveTeam={handleRemoveTeam}
                dragOverId={dragOverId}
                selectedTeamId={selectedTeamId}
                onTeamClick={handleTeamClick}
                handlers={{
                    onDragOver: handleDragOver,
                    onDragLeave: handleDragLeave,
                    onDrop: handleDropTeam,
                    onDragStart: handleDragStart,
                    onRemove: removeEmployee,
                    onUpdatePoints: handleUpdatePoints
                }}
            />
        </div>
    );
}
