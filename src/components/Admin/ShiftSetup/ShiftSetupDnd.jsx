import React, { useState, useMemo, useCallback, useEffect } from 'react';
import styles from './ShiftSetup.module.css';
import EmployeePool from './EmployeePool';
import TeamAssignmentPanel from './TeamAssignmentPanel';
import { ROLE_POINTS } from '../../../utils/distributionUtils';
import { db } from '../../../config/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

function ShiftSetupDnd({
    allEmployees,
    teams, setTeams,
    barTeam, setBarTeam,
    runners, setRunners
}) {
    const [draggedData, setDraggedData] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [selectedTeamId, setSelectedTeamId] = useState(null); // click-to-assign target

    // ── Unregistered Staff ──
    const [unregisteredDb, setUnregisteredDb] = useState([]);

    useEffect(() => {
        const fetchUnreg = async () => {
            try {
                const snap = await getDocs(collection(db, "unregisteredStaff"));
                const list = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
                setUnregisteredDb(list);
            } catch (e) {
                console.error("Failed to fetch unregistered staff:", e);
            }
        };
        fetchUnreg();
    }, []);

    const combinedEmployees = useMemo(() => {
        return [...allEmployees, ...unregisteredDb];
    }, [allEmployees, unregisteredDb]);

    const handleAddUnregistered = async (name, role) => {
        // Create permanent placeholder employee
        const newUid = `unreg_${Date.now()}_${name.replace(/\s+/g, '')}`.toLowerCase();
        const unregData = {
            uid: newUid,
            name: `${name} (Temp)`,
            username: name,
            role: role,
            status: "active",
            isUnregistered: true,
            createdAt: new Date().toISOString()
        };

        // Optimistic update
        setUnregisteredDb(prev => [...prev, unregData]);

        try {
            await setDoc(doc(db, "unregisteredStaff", newUid), unregData);
        } catch (e) {
            console.error("Failed to save unregistered staff:", e);
        }
    };

    // Get assigned UIDs to hide them from the pool
    // OPTIMIZATION: Memoize to prevent recalculating on every render
    const assignedUids = useMemo(() => {
        const uids = new Set();
        teams.forEach(t => t.members.forEach(m => uids.add(m.uid)));
        barTeam.members.forEach(m => uids.add(m.uid));
        runners.forEach(m => uids.add(m.uid));
        return Array.from(uids);
    }, [teams, barTeam.members, runners]);

    // ── Drag handlers ────────────────────────────────────
    const handleDragStart = useCallback((e, uid, sourceTeamId) => {
        setDraggedData({ uid, sourceTeamId });
        setTimeout(() => { }, 0);
    }, []);

    const handleDragOver = useCallback((e, targetTeamId) => {
        e.preventDefault();
        // OPTIMIZATION: Only update state if the ID actually changes
        // This stops hundreds of re-renders per second while dragging
        if (dragOverId !== targetTeamId) {
            setDragOverId(targetTeamId);
        }
    }, [dragOverId]);

    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        setDragOverId(null);
    }, []);

    const handleDropPool = useCallback((e) => {
        e.preventDefault();
        setDragOverId(null);
        if (!draggedData) return;
        const { uid, sourceTeamId } = draggedData;
        if (sourceTeamId !== 'pool') removeEmployee(uid, sourceTeamId);
        setDraggedData(null);
    }, [draggedData]);

    const handleDropTeam = useCallback((e, targetTeamId) => {
        e.preventDefault();
        setDragOverId(null);
        if (!draggedData) return;

        const { uid, sourceTeamId } = draggedData;
        if (sourceTeamId === targetTeamId) { setDraggedData(null); return; }

        const emp = combinedEmployees.find(user => user.uid === uid);
        if (!emp) return;

        removeEmployee(uid, sourceTeamId);

        const pts = (targetTeamId !== 'runner' && targetTeamId !== 'bar')
            ? (ROLE_POINTS[emp.role] != null ? ROLE_POINTS[emp.role] : 4)
            : null;

        addEmployee(emp, targetTeamId, pts);
        setDraggedData(null);
    }, [draggedData, combinedEmployees]);

    // ── Click-to-assign ──────────────────────────────────
    const handleTeamClick = useCallback((teamId) => {
        // toggle: clicking the same team deselects it
        setSelectedTeamId(prev => prev === teamId ? null : teamId);
    }, []);

    const handlePoolEmployeeClick = useCallback((emp) => {
        if (!selectedTeamId) return; // no team selected — nothing to do

        const pts = (selectedTeamId !== 'runner' && selectedTeamId !== 'bar')
            ? (ROLE_POINTS[emp.role] != null ? ROLE_POINTS[emp.role] : 4)
            : null;

        addEmployee(emp, selectedTeamId, pts);
        // keep team selected so user can keep clicking more employees
    }, [selectedTeamId]);

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
        const newMember = { uid: emp.uid, name: emp.username || emp.name, role: emp.role || null, points: pts };
        if (targetTeamId === 'bar') {
            setBarTeam(prev => ({ ...prev, members: [...prev.members, { ...newMember, role: 'bartender', points: null }] }));
        } else if (targetTeamId === 'runner') {
            setRunners(prev => [...prev, { ...newMember, role: 'runner', points: null }]);
        } else {
            setTeams(prev => prev.map(t =>
                t.teamId === targetTeamId ? { ...t, members: [...t.members, newMember] } : t
            ));
        }
    };

    const handleUpdateField = useCallback((teamId, uid, field, newPts) => {
        if (teamId === 'runner') {
            setRunners(prev => prev.map(m => m.uid === uid ? { ...m, [field]: newPts } : m));
        } else if (teamId === 'bar') {
            setBarTeam(prev => ({ ...prev, members: prev.members.map(m => m.uid === uid ? { ...m, [field]: newPts } : m) }));
        } else {
            setTeams(prev => prev.map(t =>
                t.teamId === teamId
                    ? { ...t, members: t.members.map(m => m.uid === uid ? { ...m, [field]: newPts } : m) }
                    : t
            ));
        }
    }, [setTeams, setRunners, setBarTeam]);

    const handleAddTeam = useCallback(() => {
        if (teams.length >= 6) return;
        const newId = `team-${Date.now()}`;
        setTeams(prev => [...prev, { teamId: newId, members: [], pools: { tips: "", gratuity: "", cash: "", sales: "" } }]);
    }, [teams.length, setTeams]);

    const handleRemoveTeam = useCallback(() => {
        if (teams.length <= 1) return;
        const lastTeam = teams[teams.length - 1];
        if (lastTeam.members.length > 0) {
            if (!window.confirm(`Removing Restaurant Team ${teams.length} will return its ${lastTeam.members.length} assigned employees to the Unassigned Pool. Continue?`)) return;
        }
        if (selectedTeamId === lastTeam.teamId) setSelectedTeamId(null);
        setTeams(prev => prev.slice(0, -1));
    }, [teams, selectedTeamId, setTeams]);

    const handlers = useMemo(() => ({
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDropTeam,
        onDragStart: handleDragStart,
        onRemove: removeEmployee,
        onUpdateField: handleUpdateField
    }), [handleDragOver, handleDragLeave, handleDropTeam, handleDragStart, handleUpdateField]);

    return (
        <div className={styles.container}>
            <div
                className={styles.poolWrapper}
                onDragOver={(e) => { e.preventDefault(); if (dragOverId !== 'pool') setDragOverId('pool'); }}
                onDragLeave={handleDragLeave}
                onDrop={handleDropPool}
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            >
                <EmployeePool
                    employees={combinedEmployees}
                    assignedUids={assignedUids}
                    onDragStart={handleDragStart}
                    onEmployeeClick={handlePoolEmployeeClick}
                    selectedTeamId={selectedTeamId}
                    onAddUnregistered={handleAddUnregistered}
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
                handlers={handlers}
            />
        </div>
    );
}

// OPTIMIZATION: Memoize the entire setup component to ignore rapid typing state updates from Parent (ShiftModal)
// We deeply compare the MEMBERS array length/content of teams, but ignore the `pools` typing data
// so that typing Tip/Cash numbers doesn't force this massive component to recalculate its lists.
export default React.memo(ShiftSetupDnd, (prevProps, nextProps) => {
    // If employees changed, re-render
    if (prevProps.allEmployees !== nextProps.allEmployees) return false;
    // If runners or barTeam length changed, re-render
    if (prevProps.runners.length !== nextProps.runners.length) return false;
    if (prevProps.barTeam.members.length !== nextProps.barTeam.members.length) return false;
    // If number of teams changed, re-render
    if (prevProps.teams.length !== nextProps.teams.length) return false;

    // Check if team members changed deep structure (ignoring pools which change repeatedly on typing)
    for (let i = 0; i < prevProps.teams.length; i++) {
        const prevT = prevProps.teams[i];
        const nextT = nextProps.teams[i];
        if (prevT.teamId !== nextT.teamId) return false;
        if (prevT.members.length !== nextT.members.length) return false;
        // Check exact member configuration
        for (let j = 0; j < prevT.members.length; j++) {
            if (prevT.members[j].uid !== nextT.members[j].uid) return false;
            if (prevT.members[j].points !== nextT.members[j].points) return false;
            if (prevT.members[j].isCaptainActive !== nextT.members[j].isCaptainActive) return false;
        }
    }

    // Check barTeam deeply
    for (let j = 0; j < prevProps.barTeam.members.length; j++) {
        const pm = prevProps.barTeam.members[j];
        const nm = nextProps.barTeam.members[j];
        if (pm.uid !== nm.uid || pm.points !== nm.points || pm.isCaptainActive !== nm.isCaptainActive) return false;
    }

    // Check runners deeply
    for (let j = 0; j < prevProps.runners.length; j++) {
        const pr = prevProps.runners[j];
        const nr = nextProps.runners[j];
        if (pr.uid !== nr.uid) return false;
        if (pr.payoutAmount !== nr.payoutAmount) return false;
        if (pr.fundingSourceMode !== nr.fundingSourceMode) return false;
        if (pr.sourceA !== nr.sourceA) return false;
        if (pr.sourceB !== nr.sourceB) return false;
        if (pr.amountFromSourceA !== nr.amountFromSourceA) return false;
        if (pr.percentFromSourceA !== nr.percentFromSourceA) return false;
    }

    return true; // Members are identical, ignore `pools` changes safely.
});
