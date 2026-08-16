import React, { useState, useMemo, useCallback, useEffect } from 'react';
import ScrollRail from '../ScrollRail';
import { ROLE_POINTS, RUNNER_FLAT_RATE } from '../../../utils/constants';
import { ASSIGNABLE_ROLES, FLOOR_PLAN_ROLES, roleInitial, roleLabel, rolePluralLabel, roleShortLabel } from '../../../utils/roleLabels';
import { firstNameFor, tempStaffNameFor, tempStaffRosterNameFor } from '../../../utils/userNames';
import { db } from '../../../config/firebase';
import { collection, getDocs, doc, setDoc } from 'firebase/firestore';

const plural = (count, one, many) => count === 1 ? one : many;

const ROLE_FILTERS = [
    { value: 'all', label: 'All' },
    ...ASSIGNABLE_ROLES.map(role => ({
        value: role,
        label: role === 'bartender' ? roleShortLabel(role) : rolePluralLabel(role),
    })),
    { value: 'temp', label: 'Temp' },
];

const poolNameFor = (employee) => employee?.isUnregistered
    ? tempStaffNameFor(employee)
    : firstNameFor(employee);

const poolActionNameFor = (employee) => employee?.isUnregistered
    ? tempStaffRosterNameFor(employee)
    : firstNameFor(employee);

const memberTag = (member) => {
    const points = member.points;
    const tag = roleInitial(member.role);
    return points === null || points === undefined || points === ""
        ? tag
        : `${tag} · ${points}`;
};

function TeamMemberChip({ member, teamId, canEditRole, draggable, onDragStart, onRemove, onRoleChange }) {
    const tag = memberTag(member);

    return (
        <span
            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] pl-2.5 pr-1 text-[12.5px] font-medium text-[var(--color-ink)] shadow-[0_1px_0_rgba(15,23,42,0.02)]"
            draggable={draggable}
            onDragStart={onDragStart}
        >
            <span className="min-w-0 max-w-[8.5rem] truncate">{member.name}</span>
            {canEditRole ? (
                <span className="relative shrink-0">
                    <span className="inline-flex h-[22px] items-center text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-accent)]">
                        {tag}
                    </span>
                    <select
                        name={`floor-role-${member.uid}`}
                        value={FLOOR_PLAN_ROLES.includes(member.role) ? member.role : "server"}
                        onChange={(e) => onRoleChange(teamId, member.uid, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label={`${member.name} worked role`}
                    >
                        {FLOOR_PLAN_ROLES.map(role => (
                            <option key={role} value={role}>{roleShortLabel(role)}</option>
                        ))}
                    </select>
                </span>
            ) : (
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-accent)]">
                    {tag}
                </span>
            )}
            <button
                type="button"
                onClick={onRemove}
                aria-label={`Remove ${member.name}`}
                className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-sm leading-none text-[var(--color-ink-muted)] transition-colors hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
            >
                ×
            </button>
        </span>
    );
}

function TeamCard({
    section,
    isOver,
    interactive,
    onOpen,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragStart,
    onRemove,
    onRoleChange,
    onAddTeam,
    onRemoveTeam,
}) {
    const { id, title, members, canEditRole, canAddTeam, canRemoveTeam, removeTeamDisabled } = section;
    const populated = members.length > 0;

    return (
        <section
            className={[
                "rounded-[12px] border bg-[var(--color-surface)] shadow-[0_1px_4px_rgba(15,23,42,0.04)] transition-colors",
                isOver ? "border-dashed border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-line)]",
            ].join(" ")}
            onDragOver={(e) => interactive && onDragOver(e, id)}
            onDragLeave={interactive ? onDragLeave : undefined}
            onDrop={(e) => interactive && onDrop(e, id)}
        >
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                <h3 className="m-0 min-w-0 truncate text-[13px] font-semibold text-[var(--color-ink)]">
                    {title}
                </h3>
                <span className="shrink-0 text-[11px] font-medium text-[var(--color-ink-muted)]">
                    {members.length} {plural(members.length, 'person', 'people')}
                </span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-3.5 pb-3">
                {populated ? members.map(member => (
                    <TeamMemberChip
                        key={member.uid}
                        member={member}
                        teamId={id}
                        canEditRole={interactive && canEditRole}
                        draggable={interactive}
                        onDragStart={(e) => onDragStart(e, member.uid, id)}
                        onRemove={() => onRemove(member.uid, id)}
                        onRoleChange={onRoleChange}
                    />
                )) : null}
                {interactive ? (
                    <button
                        type="button"
                        onClick={() => onOpen(id)}
                        className="inline-flex h-8 items-center rounded-full border border-dashed border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 text-[12.5px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-surface)]"
                    >
                        + Add
                    </button>
                ) : null}
                {interactive && canAddTeam ? (
                    <button
                        type="button"
                        onClick={onAddTeam}
                        className="hidden h-8 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[12.5px] font-semibold text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-line-strong)] max-[560px]:inline-flex"
                    >
                        + Team
                    </button>
                ) : null}
                {interactive && canRemoveTeam ? (
                    <button
                        type="button"
                        onClick={onRemoveTeam}
                        disabled={removeTeamDisabled}
                        className="hidden h-8 items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[12.5px] font-semibold text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-line-strong)] disabled:cursor-not-allowed disabled:opacity-35 max-[560px]:inline-flex"
                    >
                        − Team
                    </button>
                ) : null}
            </div>
        </section>
    );
}

function TeamTargetRail({ sections, selectedTeamId, onSelect }) {
    return (
        <ScrollRail
            ariaLabel="Choose the team to assign into"
            depsKey={`${selectedTeamId}-${sections.length}`}
            className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {sections.map(section => {
                const selected = selectedTeamId === section.id;
                return (
                    <button
                        key={section.id}
                        type="button"
                        onClick={() => onSelect(section.id)}
                        aria-pressed={selected}
                        className={[
                            "h-8 flex-none rounded-full border px-3 text-[11.5px] font-semibold transition-colors",
                            selected
                                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                                : "border-[var(--color-line)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]",
                        ].join(" ")}
                    >
                        {section.title}
                    </button>
                );
            })}
        </ScrollRail>
    );
}

function RoleFilterRail({ roleFilter, counts, onChange }) {
    return (
        <ScrollRail
            ariaLabel="Filter available employees by role"
            depsKey={`${roleFilter}-${counts.all}`}
            className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
            {ROLE_FILTERS.map(filter => {
                const selected = roleFilter === filter.value;
                return (
                    <button
                        key={filter.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => onChange(prev => prev === filter.value ? 'all' : filter.value)}
                        className={[
                            "h-8 flex-none rounded-full border px-3 text-[12px] font-medium transition-colors",
                            selected
                                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                                : "border-[var(--color-line)] bg-[var(--color-surface-muted)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]",
                        ].join(" ")}
                    >
                        {filter.label}
                        <span className={[
                            "ml-1 font-mono text-[10px]",
                            selected ? "text-white/75" : "text-[var(--color-ink-muted)]",
                        ].join(" ")}>
                            {counts[filter.value] || 0}
                        </span>
                    </button>
                );
            })}
        </ScrollRail>
    );
}

function ShiftSetupDnd({
    allEmployees,
    teams, setTeams,
    barTeam, setBarTeam,
    runners, setRunners,
    readOnly = false,
    onSheetOpenChange
}) {
    const [draggedData, setDraggedData] = useState(null);
    const [dragOverId, setDragOverId] = useState(null);
    const [selectedTeamId, setSelectedTeamId] = useState(null); // click-to-assign target
    const [mobilePickerOpen, setMobilePickerOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [roleFilter, setRoleFilter] = useState('all');
    const [showTempForm, setShowTempForm] = useState(false);
    const [tempForm, setTempForm] = useState({ name: '', role: 'server' });

    // ── Unregistered Staff ──
    const [unregisteredDb, setUnregisteredDb] = useState([]);

    const getRestaurantRole = useCallback((role) => (
        ROLE_POINTS[role] != null ? role : 'server'
    ), []);

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

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 560px)");
        const handleChange = () => setIsMobile(mediaQuery.matches);
        handleChange();
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    const combinedEmployees = useMemo(() => {
        return [...allEmployees, ...unregisteredDb];
    }, [allEmployees, unregisteredDb]);

    const floorSections = useMemo(() => ([
        ...teams.map((team, index) => ({
            id: team.teamId,
            title: `Team ${index + 1}`,
            members: team.members,
            canEditRole: true,
            canAddTeam: index === teams.length - 1 && teams.length < 6,
            canRemoveTeam: index === teams.length - 1,
            removeTeamDisabled: teams.length <= 1,
        })),
        {
            id: "bar",
            title: "Bar Team",
            members: barTeam.members,
            canEditRole: false,
        },
        {
            id: "runner",
            title: "Runners",
            members: runners,
            canEditRole: false,
        },
    ]), [barTeam.members, runners, teams]);

    const handleAddUnregistered = useCallback(async (name, role) => {
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
    }, []);

    // Get assigned UIDs to hide them from the pool
    // OPTIMIZATION: Memoize to prevent recalculating on every render
    const assignedUids = useMemo(() => {
        const uids = new Set();
        teams.forEach(t => t.members.forEach(m => uids.add(m.uid)));
        barTeam.members.forEach(m => uids.add(m.uid));
        runners.forEach(m => uids.add(m.uid));
        return Array.from(uids);
    }, [teams, barTeam.members, runners]);

    const selectedTargetLabel = useMemo(() => {
        return floorSections.find(section => section.id === selectedTeamId)?.title || "";
    }, [floorSections, selectedTeamId]);

    // F10 is scoped to phones: a closed shift's floor is view-only until the admin
    // taps "Edit roster". Desktop behavior is intentionally unchanged.
    const mobileReadOnly = readOnly && isMobile;
    const sheetOpen = Boolean(mobilePickerOpen && selectedTeamId && !mobileReadOnly);

    useEffect(() => {
        if (!onSheetOpenChange) return undefined;
        onSheetOpenChange(sheetOpen);
        return () => onSheetOpenChange(false);
    }, [onSheetOpenChange, sheetOpen]);

    // ── Core helpers ─────────────────────────────────────
    const removeEmployee = useCallback((uid, teamId) => {
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
    }, [setBarTeam, setRunners, setTeams]);

    const addEmployee = useCallback((emp, targetTeamId, pts) => {
        const restaurantRole = getRestaurantRole(emp.role);
        const name = emp.isUnregistered ? tempStaffRosterNameFor(emp) : firstNameFor(emp);
        const newMember = { uid: emp.uid, name, role: restaurantRole, points: pts };
        if (targetTeamId === 'bar') {
            setBarTeam(prev => ({ ...prev, members: [...prev.members, { ...newMember, role: 'bartender', points: null }] }));
        } else if (targetTeamId === 'runner') {
            setRunners(prev => [...prev, { ...newMember, role: 'runner', points: null, payoutAmount: RUNNER_FLAT_RATE }]);
        } else {
            setTeams(prev => prev.map(t =>
                t.teamId === targetTeamId ? { ...t, members: [...t.members, newMember] } : t
            ));
        }
    }, [getRestaurantRole, setBarTeam, setRunners, setTeams]);

    const updateMemberRole = useCallback((teamId, uid, role) => {
        if (teamId === 'bar' || teamId === 'runner') return;
        const nextRole = getRestaurantRole(role);
        setTeams(prev => prev.map(team =>
            team.teamId === teamId
                ? {
                    ...team,
                    members: team.members.map(member =>
                        member.uid === uid
                            ? { ...member, role: nextRole, points: ROLE_POINTS[nextRole] }
                            : member
                    )
                }
                : team
        ));
    }, [getRestaurantRole, setTeams]);

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
    }, [draggedData, removeEmployee]);

    const handleDropTeam = useCallback((e, targetTeamId) => {
        e.preventDefault();
        setDragOverId(null);
        if (!draggedData) return;

        const { uid, sourceTeamId } = draggedData;
        if (sourceTeamId === targetTeamId) { setDraggedData(null); return; }

        const emp = combinedEmployees.find(user => user.uid === uid);
        if (!emp) return;

        removeEmployee(uid, sourceTeamId);

        const restaurantRole = getRestaurantRole(emp.role);
        const pts = (targetTeamId !== 'runner' && targetTeamId !== 'bar')
            ? ROLE_POINTS[restaurantRole]
            : null;

        addEmployee(emp, targetTeamId, pts);
        setDraggedData(null);
    }, [draggedData, combinedEmployees, removeEmployee, addEmployee, getRestaurantRole]);

    // ── Click-to-assign ──────────────────────────────────
    const openPickerForTeam = useCallback((teamId) => {
        if (mobileReadOnly) return;
        setSelectedTeamId(teamId);
        setMobilePickerOpen(true);
        setRoleFilter('all');
    }, [mobileReadOnly]);

    // Closing the mobile picker also clears the selection. Leaving a team selected
    // after "Done"/scrim-dismiss made the next tap silently toggle it off (dead
    // first tap), and left a lingering "active" fill + pulsing dot on a card whose
    // picker is closed - a selection glow only makes sense while the sheet is open.
    const closeMobilePicker = useCallback(() => {
        setMobilePickerOpen(false);
        setSelectedTeamId(null);
        setShowTempForm(false);
    }, []);

    const handlePoolEmployeeClick = useCallback((emp) => {
        if (!selectedTeamId) return; // no team selected — nothing to do

        const restaurantRole = getRestaurantRole(emp.role);
        const pts = (selectedTeamId !== 'runner' && selectedTeamId !== 'bar')
            ? ROLE_POINTS[restaurantRole]
            : null;

        addEmployee(emp, selectedTeamId, pts);
        // keep team selected so user can keep clicking more employees
    }, [selectedTeamId, addEmployee, getRestaurantRole]);

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
        if (selectedTeamId === lastTeam.teamId) {
            setSelectedTeamId(null);
            setMobilePickerOpen(false);
        }
        setTeams(prev => prev.slice(0, -1));
    }, [teams, selectedTeamId, setTeams]);

    const handlers = useMemo(() => ({
        onDragOver: handleDragOver,
        onDragLeave: handleDragLeave,
        onDrop: handleDropTeam,
        onDragStart: handleDragStart,
        onRemove: removeEmployee,
        onRoleChange: updateMemberRole
    }), [handleDragOver, handleDragLeave, handleDropTeam, handleDragStart, removeEmployee, updateMemberRole]);

    const unassignedEmployees = useMemo(() => (
        combinedEmployees.filter(emp => !assignedUids.includes(emp.uid))
    ), [assignedUids, combinedEmployees]);

    const roleCounts = useMemo(() => {
        const counts = { all: unassignedEmployees.length, temp: 0 };
        ASSIGNABLE_ROLES.forEach(role => { counts[role] = 0; });
        unassignedEmployees.forEach(emp => {
            if (emp.isUnregistered) counts.temp += 1;
            if (ASSIGNABLE_ROLES.includes(emp.role)) counts[emp.role] += 1;
        });
        return counts;
    }, [unassignedEmployees]);

    const visibleEmployees = useMemo(() => (
        unassignedEmployees.filter(emp => (
            roleFilter === 'all'
                || (roleFilter === 'temp' ? emp.isUnregistered : emp.role === roleFilter)
        ))
    ), [roleFilter, unassignedEmployees]);

    const handleCreateTempStaff = useCallback(() => {
        const name = tempForm.name.trim();
        if (!name) return;
        handleAddUnregistered(name, tempForm.role);
        setTempForm({ name: '', role: 'server' });
        setShowTempForm(false);
    }, [handleAddUnregistered, tempForm.name, tempForm.role]);

    return (
        <div className="relative flex min-h-[420px] flex-col gap-3 max-[560px]:min-h-0 max-[560px]:flex-1 max-[560px]:overflow-hidden">
            <div
                className="hidden"
                onDragOver={(e) => { e.preventDefault(); if (dragOverId !== 'pool') setDragOverId('pool'); }}
                onDragLeave={handleDragLeave}
                onDrop={handleDropPool}
            />

            <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 max-[560px]:hidden">
                <div className="min-w-0 text-[0.78rem] font-medium text-[var(--color-ink-soft)]">
                    {teams.reduce((total, team) => total + team.members.length, 0)} dining / {barTeam.members.length} bar / {runners.length} {plural(runners.length, 'runner', 'runners')}
                </div>
                {mobileReadOnly ? null : (
                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-base font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-line-strong)] disabled:cursor-not-allowed disabled:opacity-40 max-[560px]:h-10 max-[560px]:w-10"
                            onClick={handleRemoveTeam}
                            disabled={teams.length <= 1}
                            title="Remove last team"
                            aria-label="Remove last restaurant team"
                        >
                            −
                        </button>
                        <span className="min-w-5 text-center text-sm font-bold text-[var(--color-ink)]">{teams.length}</span>
                        <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] text-base font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-line-strong)] disabled:cursor-not-allowed disabled:opacity-40 max-[560px]:h-10 max-[560px]:w-10"
                            onClick={handleAddTeam}
                            title="Add team"
                            aria-label="Add restaurant team"
                            disabled={teams.length >= 6}
                        >
                            +
                        </button>
                    </div>
                )}
            </div>

            <div className="grid flex-1 grid-cols-2 content-start gap-2.5 overflow-y-auto pb-32 pr-1 max-[900px]:grid-cols-1 max-[560px]:grid-cols-1 max-[560px]:gap-2 max-[560px]:pb-28">
                {floorSections.map(section => (
                    <TeamCard
                        key={section.id}
                        section={section}
                        isOver={dragOverId === section.id}
                        interactive={!mobileReadOnly}
                        onOpen={openPickerForTeam}
                        onAddTeam={handleAddTeam}
                        onRemoveTeam={handleRemoveTeam}
                        {...handlers}
                    />
                ))}
            </div>

            {!mobilePickerOpen && !mobileReadOnly ? (
                <button
                    type="button"
                    onClick={() => openPickerForTeam(floorSections[0]?.id || "team-1")}
                    className="fixed bottom-[5.75rem] left-3 right-3 z-20 flex items-center justify-between gap-3 rounded-full bg-[var(--color-bar-bg)] px-4 py-3 text-left text-[var(--color-surface)] shadow-[0_14px_34px_rgba(15,23,42,0.28)] sm:left-auto sm:right-6 sm:w-[22rem] max-[560px]:relative max-[560px]:bottom-auto max-[560px]:left-auto max-[560px]:right-auto max-[560px]:mb-[5.75rem] max-[560px]:mt-1 max-[560px]:w-auto max-[560px]:shrink-0"
                >
                    <span className="text-[13px] font-medium">{unassignedEmployees.length} not on the floor</span>
                    <span className="text-[12px] font-semibold text-[var(--color-bar-ink-soft)]">Add people ↑</span>
                </button>
            ) : null}

            {sheetOpen ? (
            <div className="fixed inset-0 z-20">
                <button
                    type="button"
                    aria-label="Close employee picker"
                    className="absolute inset-0 bg-[var(--color-ink)]/30"
                    onClick={closeMobilePicker}
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Add employees to ${selectedTargetLabel || 'selected team'}`}
                    className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[72vh] min-h-[26rem] max-w-3xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-b-0 border-[var(--color-line)] bg-[var(--color-surface)] shadow-[0_-12px_36px_rgba(15,23,42,0.22)] max-[560px]:max-h-[70vh] max-[560px]:min-h-0"
                >
                    <button
                        type="button"
                        aria-label="Close employee picker"
                        onClick={closeMobilePicker}
                        className="mx-auto mt-2 h-5 w-12 flex-none rounded-full bg-transparent p-0"
                    >
                        <span className="mx-auto block h-1 w-9 rounded-full bg-[var(--color-line-strong)]" />
                    </button>
                    <div className="flex-none border-b border-[var(--color-line)] px-4 pb-3 pt-2">
                        <div className="mb-2.5 flex items-center gap-3">
                            <h3 className="m-0 min-w-0 truncate font-display text-[19px] font-medium text-[var(--color-ink)]">
                                Add to
                            </h3>
                        </div>
                        <TeamTargetRail
                            sections={floorSections}
                            selectedTeamId={selectedTeamId}
                            onSelect={setSelectedTeamId}
                        />
                        <div className="mt-2.5">
                            <RoleFilterRail
                                roleFilter={roleFilter}
                                counts={roleCounts}
                                onChange={setRoleFilter}
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto bg-[var(--color-surface)] pb-28">
                        {visibleEmployees.length === 0 ? (
                            <p className="m-0 px-4 py-5 text-center text-sm text-[var(--color-ink-muted)]">
                                {unassignedEmployees.length === 0 ? 'Everyone is on the floor.' : `No ${ROLE_FILTERS.find(filter => filter.value === roleFilter)?.label.toLowerCase() || 'people'} left off the floor.`}
                            </p>
                        ) : visibleEmployees.map(emp => (
                            <button
                                key={emp.uid}
                                type="button"
                                onClick={() => handlePoolEmployeeClick(emp)}
                                className="flex min-h-12 w-full items-center justify-between gap-3 border-t border-[var(--color-line)] bg-transparent px-4 py-2 text-left transition-colors hover:bg-[var(--color-surface-muted)]"
                                title={`Assign ${poolActionNameFor(emp)} to ${selectedTargetLabel || 'selected team'}`}
                            >
                                <span className="flex min-w-0 flex-col gap-0.5">
                                    <span className="truncate text-sm font-medium text-[var(--color-ink)]">{poolNameFor(emp)}</span>
                                    <span className="text-[11px] text-[var(--color-ink-muted)]">{roleLabel(emp.role)}</span>
                                </span>
                                <span className="shrink-0 text-[12px] font-semibold text-[var(--color-accent)]">
                                    Add to {selectedTargetLabel || 'selected team'} →
                                </span>
                            </button>
                        ))}

                        <div className="border-t border-[var(--color-line)]">
                            {showTempForm ? (
                                <div className="flex flex-col gap-2 bg-[var(--color-surface-muted)] px-4 py-3">
                                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Temporary staff name</label>
                                    <input
                                        name="temporary-staff-name"
                                        type="text"
                                        value={tempForm.name}
                                        onChange={(e) => setTempForm(prev => ({ ...prev, name: e.target.value }))}
                                        autoFocus
                                        placeholder="Guest server"
                                        className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/15"
                                    />
                                    <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">Role</label>
                                    <select
                                        name="temporary-staff-role"
                                        value={tempForm.role}
                                        onChange={(e) => setTempForm(prev => ({ ...prev, role: e.target.value }))}
                                        className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-ink)] focus:border-[var(--color-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/15"
                                    >
                                        {ASSIGNABLE_ROLES.map(role => (
                                            <option key={role} value={role}>{roleShortLabel(role)}</option>
                                        ))}
                                    </select>
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setShowTempForm(false)}
                                            className="h-10 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-sm font-semibold text-[var(--color-ink-soft)]"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleCreateTempStaff}
                                            className="h-10 flex-1 rounded-full bg-[var(--color-accent)] text-sm font-bold text-white disabled:opacity-50"
                                            disabled={!tempForm.name.trim()}
                                        >
                                            Create
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowTempForm(true)}
                                    className="flex min-h-12 w-full items-center px-4 text-left text-[13px] font-semibold text-[var(--color-accent)] transition-colors hover:bg-[var(--color-surface-muted)]"
                                >
                                    + Add temp staff
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            ) : null}
        </div>
    );
}

// OPTIMIZATION: Memoize the entire setup component to ignore rapid typing state updates from Parent (ShiftModal)
// We deeply compare the MEMBERS array length/content of teams, but ignore the `pools` typing data
// so that typing Tip/Cash numbers doesn't force this massive component to recalculate its lists.
export default React.memo(ShiftSetupDnd, (prevProps, nextProps) => {
    // If the read-only (closed-shift Edit roster) gate changed, re-render
    if (prevProps.readOnly !== nextProps.readOnly) return false;
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
            if (prevT.members[j].role !== nextT.members[j].role) return false;
            if (prevT.members[j].points !== nextT.members[j].points) return false;
            if (prevT.members[j].isCaptainActive !== nextT.members[j].isCaptainActive) return false;
        }
    }

    // Check barTeam deeply
    for (let j = 0; j < prevProps.barTeam.members.length; j++) {
        const pm = prevProps.barTeam.members[j];
        const nm = nextProps.barTeam.members[j];
        if (pm.uid !== nm.uid || pm.role !== nm.role || pm.points !== nm.points || pm.isCaptainActive !== nm.isCaptainActive) return false;
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
