import { readFileSync } from "node:fs";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { calculateShift } from "../src/utils/engine.js";
import { mapPayoutsForFirebase } from "../src/components/Admin/shiftEditorUtils.js";
import { buildPayoutLedgerEntry, PAYOUT_LEDGER_VERSION } from "../src/utils/payoutLedger.js";
import { buildClosedShiftPayload, buildShiftSetupDraft } from "../src/utils/shiftPersistence.js";

const PROJECT_ID = getProjectId();
const API_KEY = "demo-api-key";
const PASSWORD = "Password123!";
const FIXED_NOW = "2026-06-01T12:00:00.000Z";
const SETUP_SHIFT_DATE = "2026-06-01";
const CLOSED_SHIFT_DATE = "2026-05-31";

// The seeded restaurant carries all three tiers at once plus today's legacy
// admin, because that is exactly the world the changeover creates: the pointer
// names a manager while `role: "admin"` keeps working alongside it. See
// docs/MANAGER-CHANGEOVER.md.
const authUsers = [
    {
        key: "admin",
        email: "admin@example.com",
        username: "Admin",
        // Today's authority, deliberately NOT the manager. Everything this
        // account can do before the pointer exists it can still do after -
        // that non-regression is what makes the cutover safe to ship.
        role: "admin",
        status: "active",
    },
    {
        key: "manager",
        email: "manager@example.com",
        username: "Manager",
        // The manager tier comes from restaurant/config.managerUid and from
        // nothing else - no job title grants it, which is why this account
        // carries none. They do not work a section and take no share of the
        // pool, so they need no pay weight either.
        //
        // In production the manager is the captain's existing `role: "admin"`
        // account, which is what keeps them off the roster and out of the
        // floor-plan pool; retiring that value is a later, separate step. Here
        // the title is left off so that signing in as this account proves the
        // POINTER carried the tier and nothing else could have.
        role: "unassigned",
        status: "active",
    },
    {
        key: "supervisor",
        email: "supervisor@example.com",
        username: "Captain Supervisor",
        // Supervisor ON: the captain tier. Enters money, builds floor plans,
        // corrects a settled day - and none of the manager-only work.
        role: "captain",
        status: "active",
        isSupervisor: true,
    },
    {
        key: "captain",
        email: "captain@example.com",
        username: "Captain One",
        // Supervisor OFF, which is the default every existing captain starts
        // with. Same job title as the account above, same pay, an ordinary
        // employee's access. The pair is the whole model in one seed.
        role: "captain",
        status: "active",
    },
    {
        key: "server",
        email: "server@example.com",
        username: "Server One",
        role: "server",
        status: "active",
    },
    {
        key: "back",
        email: "back@example.com",
        username: "Back One",
        role: "back",
        status: "active",
    },
    {
        key: "assistant",
        email: "assistant@example.com",
        username: "Assistant One",
        role: "assistant",
        status: "active",
    },
    {
        key: "bartender",
        email: "bartender@example.com",
        username: "Bartender One",
        role: "bartender",
        status: "active",
    },
    {
        key: "runner",
        email: "runner@example.com",
        username: "Runner One",
        role: "runner",
        status: "active",
    },
    {
        key: "pending",
        email: "pending@example.com",
        username: "Pending User",
        role: "unassigned",
        status: "pending",
    },
    {
        key: "inactive",
        email: "inactive@example.com",
        username: "Inactive User",
        role: "server",
        status: "inactive",
    },
];

const tempStaff = {
    uid: "unreg_temp_staff",
    name: "Temp Staff (Temp)",
    username: "Temp Staff",
    role: "server",
    status: "active",
    isUnregistered: true,
    createdAt: FIXED_NOW,
};

function getProjectId() {
    const firebaseConfig = process.env.FIREBASE_CONFIG
        ? JSON.parse(process.env.FIREBASE_CONFIG)
        : {};

    return process.env.GCLOUD_PROJECT
        || process.env.GCP_PROJECT
        || firebaseConfig.projectId
        || process.env.VITE_FIREBASE_PROJECT_ID;
}

function assertEmulatorOnly() {
    const missing = [
        ["FIRESTORE_EMULATOR_HOST", process.env.FIRESTORE_EMULATOR_HOST],
        ["FIREBASE_AUTH_EMULATOR_HOST", process.env.FIREBASE_AUTH_EMULATOR_HOST],
    ].filter(([, value]) => !value);

    if (missing.length > 0) {
        throw new Error(`Refusing to seed without emulator hosts: ${missing.map(([name]) => name).join(", ")}`);
    }

    if (!PROJECT_ID?.startsWith("demo-")) {
        throw new Error(`Refusing to seed non-demo Firebase project: ${PROJECT_ID || "unknown"}`);
    }
}

function authEmulatorUrl(path) {
    const host = process.env.FIREBASE_AUTH_EMULATOR_HOST;
    const origin = host.startsWith("http://") || host.startsWith("https://")
        ? host
        : `http://${host}`;

    return `${origin}${path}`;
}

async function clearAuthUsers() {
    const response = await fetch(authEmulatorUrl(`/emulator/v1/projects/${PROJECT_ID}/accounts`), {
        method: "DELETE",
    });

    if (!response.ok) {
        throw new Error(`Failed to clear Auth emulator users: ${await response.text()}`);
    }
}

async function createAuthUser(user) {
    const response = await fetch(
        authEmulatorUrl(`/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`),
        {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                email: user.email,
                password: PASSWORD,
                displayName: user.username,
                returnSecureToken: true,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to create Auth emulator user ${user.email}: ${await response.text()}`);
    }

    return response.json();
}

async function seedAuthUsers() {
    const createdUsers = await Promise.all(authUsers.map(async (user) => ({
        ...user,
        uid: (await createAuthUser(user)).localId,
    })));

    return Object.fromEntries(createdUsers.map((user) => [user.key, user]));
}

function profileFor(user) {
    return {
        uid: user.uid,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: FIXED_NOW,
        // Absent reads as OFF everywhere, so only the accounts that hold the
        // switch carry the key at all - the same shape a real roster has.
        ...(user.isSupervisor ? { isSupervisor: true } : {}),
    };
}

function usernameKey(username) {
    return username.trim().toLowerCase();
}

function member(seedUsers, key, role, points) {
    return {
        uid: seedUsers[key].uid,
        name: seedUsers[key].username,
        role,
        points,
    };
}

function buildSeedShifts(seedUsers) {
    const setupTeams = [
        {
            teamId: "team-1",
            members: [
                member(seedUsers, "captain", "captain", 4),
                member(seedUsers, "server", "server", 4),
                { uid: tempStaff.uid, name: tempStaff.name, role: "server", points: 4 },
            ],
            pools: { sales: "1800", tips: "", gratuity: "", cash: "", covers: "", contract26Gratuity: "" },
            contracts: [],
        },
    ];
    const setupBarTeam = {
        members: [member(seedUsers, "bartender", "bartender", 1)],
        pools: { sales: "450", tips: "", gratuity: "", covers: "", runners: "" },
    };
    const setupRunners = [
        { ...member(seedUsers, "runner", "runner", null), payoutAmount: 85 },
    ];

    const closedTeams = [
        {
            teamId: "team-1",
            members: [
                member(seedUsers, "captain", "captain", 4),
                member(seedUsers, "server", "server", 4),
                member(seedUsers, "back", "back", 2.5),
                member(seedUsers, "assistant", "assistant", 2),
            ],
            pools: { sales: "3200", tips: "640", gratuity: "180", cash: "120", covers: "96", contract26Gratuity: "" },
            contracts: [],
        },
    ];
    const closedBarTeam = {
        members: [member(seedUsers, "bartender", "bartender", 1)],
        pools: { sales: "900", tips: "160", gratuity: "45", covers: "40", runners: "0" },
    };
    const closedRunners = [
        { ...member(seedUsers, "runner", "runner", null), payoutAmount: 85 },
    ];
    const summary = calculateShift({ teams: closedTeams, barTeam: closedBarTeam, runners: closedRunners });
    const payouts = mapPayoutsForFirebase(summary);

    return {
        setup: buildShiftSetupDraft({
            date: SETUP_SHIFT_DATE,
            teams: setupTeams,
            barTeam: setupBarTeam,
            runners: setupRunners,
            now: FIXED_NOW,
        }),
        closed: buildClosedShiftPayload({
            date: CLOSED_SHIFT_DATE,
            teams: closedTeams,
            barTeam: closedBarTeam,
            runners: closedRunners,
            summary,
            now: FIXED_NOW,
            operationId: "seed-closeout-closed-shift",
            updatedBy: seedUsers.admin.uid,
        }),
        payouts,
    };
}

async function seedFirestore(seedUsers) {
    const testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
            rules: readFileSync("firestore.rules", "utf8"),
        },
    });

    try {
        await testEnv.clearFirestore();

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            const shifts = buildSeedShifts(seedUsers);

            await Promise.all(Object.values(seedUsers).flatMap((user) => [
                setDoc(doc(db, "users", user.uid), profileFor(user)),
                setDoc(doc(db, "usernames", usernameKey(user.username)), {
                    uid: user.uid,
                    username: user.username,
                    email: user.email,
                    createdAt: FIXED_NOW,
                }),
            ]));

            // The manager pointer. One document, one field, one holder - the
            // whole of "who is the manager". Written here with rules disabled
            // for the same reason it is written from the console in production:
            // firestore.rules allows no client to CREATE it, only the sitting
            // manager to retarget it. docs/MANAGER-CHANGEOVER.md is the
            // production procedure this mirrors.
            await setDoc(doc(db, "restaurant", "config"), {
                managerUid: seedUsers.manager.uid,
                updatedAt: FIXED_NOW,
            });

            await setDoc(doc(db, "unregisteredStaff", tempStaff.uid), tempStaff);
            await setDoc(doc(db, "shifts", SETUP_SHIFT_DATE), shifts.setup);
            await setDoc(doc(db, "shifts", CLOSED_SHIFT_DATE), shifts.closed);
            await setDoc(doc(db, "payouts", CLOSED_SHIFT_DATE), {
                date: CLOSED_SHIFT_DATE,
                ledgerVersion: PAYOUT_LEDGER_VERSION,
                updatedAt: FIXED_NOW,
                updatedBy: seedUsers.admin.uid,
                operationId: "seed-closeout-closed-shift",
            });

            await Promise.all(Object.entries(shifts.payouts).map(([uid, payout]) =>
                setDoc(
                    doc(db, "payouts", CLOSED_SHIFT_DATE, "entries", uid),
                    buildPayoutLedgerEntry({
                        date: CLOSED_SHIFT_DATE,
                        uid,
                        payout,
                        operationId: "seed-closeout-closed-shift",
                        updatedAt: FIXED_NOW,
                        updatedBy: seedUsers.admin.uid,
                        source: "seed",
                    })
                )
            ));
        });
    } finally {
        await testEnv.cleanup();
    }
}

assertEmulatorOnly();
await clearAuthUsers();
const seedUsers = await seedAuthUsers();
await seedFirestore(seedUsers);

console.log(`Seeded ${PROJECT_ID} emulators. Password for every account: ${PASSWORD}`);
console.log(`  admin@example.com       legacy admin - the ONLY login that opens the workspace today`);
console.log(`  manager@example.com     manager tier via the pointer, no job title`);
console.log(`  supervisor@example.com  captain tier: Supervisor ON`);
console.log(`  captain@example.com     captain's title, Supervisor OFF`);
console.log(`  server@example.com      employee`);
console.log(`Only the admin sees the workspace: App.jsx still gates on role == "admin" on purpose.`);
console.log(`The other tiers hold real server-side access - see docs/MANAGER-CHANGEOVER.md.`);
console.log(`Setup shift: ${SETUP_SHIFT_DATE}; closed shift: ${CLOSED_SHIFT_DATE}`);
