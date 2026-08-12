import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const readSource = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("App loads the admin workspace through a lazy boundary", () => {
    const source = readSource("src/App.jsx");

    assert.doesNotMatch(
        source,
        /import\s+AdminDashboard\s+from\s+["']\.\/components\/Admin\/AdminDashboard["']/,
        "AdminDashboard should not be eagerly imported into the main app chunk."
    );
    assert.match(source, /lazy\(\(\)\s*=>\s*import\(["']\.\/components\/Admin\/AdminDashboard["']\)\)/);
});

test("AdminDashboard defers employee collection reads until employee data is needed", () => {
    const source = readSource("src/components/Admin/AdminDashboard.jsx");

    assert.doesNotMatch(
        source,
        /useEffect\(\(\)\s*=>\s*{\s*fetchEmployees\(\);\s*}\s*,\s*\[fetchEmployees\]\s*\)/s,
        "AdminDashboard should not fetch all users on initial mount."
    );
    assert.match(
        source,
        /loadEmployeesIfNeeded/,
        "AdminDashboard should expose a guarded employee loader."
    );
    assert.match(
        source,
        /setActiveTabWithData/,
        "AdminDashboard should load employee data before opening employee-dependent tabs."
    );
});

test("Firebase emulator ports are configurable for local port conflicts", () => {
    const source = readSource("src/config/firebase.js");

    assert.doesNotMatch(
        source,
        /connectFirestoreEmulator\(db,\s*["']127\.0\.0\.1["'],\s*8080\)/,
        "Firestore emulator port should not be hardcoded because local tools may use 8080."
    );
    assert.match(source, /VITE_FIRESTORE_EMULATOR_PORT/);
});

test("Shift editor isolates money closeout entry from unrelated input rerenders", () => {
    const source = readSource("src/components/Admin/ShiftEditorPanel.jsx");

    // The team-switcher renders one fixed-height entry panel and a rail of memoized
    // pills, so only the focused group's inputs (plus the pill whose pool changed) react
    // to a keystroke - the roster no longer renders as a growing stack of cards.
    assert.match(
        source,
        /const\s+RailPill\s*=\s*memo\(/,
        "Switcher rail pills should be memoized so unrelated teams don't rerender on every keystroke."
    );
    assert.match(
        source,
        /function\s+CloseoutEntryPanel\(/,
        "Money inputs should render through a single fixed-height entry panel."
    );
    assert.match(
        source,
        /const\s+updatePool\s*=\s*useCallback\(/,
        "Dining pool updates should use a stable callback."
    );
    assert.match(
        source,
        /const\s+updateBarPool\s*=\s*useCallback\(/,
        "Bar pool updates should use a stable callback."
    );
});

test("Employee dashboard scopes tip subscriptions to the visible date window", () => {
    const appSource = readSource("src/App.jsx");
    const dataServiceSource = readSource("src/services/dataService.js");

    assert.doesNotMatch(
        appSource,
        /DataService\.subscribeToAllData/,
        "Employee sessions should not subscribe to the full historical tips collection."
    );
    assert.match(
        appSource,
        /getEmployeeTipSubscriptionDateKeys/,
        "App should derive a small date window for employee tip subscriptions."
    );
    assert.match(
        appSource,
        /DataService\.subscribeToDates/,
        "Employee sessions should subscribe only to the needed tip documents."
    );
    assert.match(
        dataServiceSource,
        /subscribeToDates/,
        "DataService should expose a document-scoped subscription helper."
    );
});

test("Team Management delegates temp merge payout ownership to the ledger utility", () => {
    const teamManagementSource = readSource("src/components/Admin/TeamManagement.jsx");
    const shiftEditorSource = readSource("src/components/Admin/ShiftEditorPanel.jsx");
    const mergePersistenceSource = readSource("src/utils/tempStaffMergePersistence.js");

    assert.match(
        teamManagementSource,
        /mergeTempStaffIntoAccount/,
        "Team Management should delegate temp-staff merge persistence to a tested utility."
    );
    assert.doesNotMatch(
        teamManagementSource,
        /collection\(db,\s*["']shifts["']\)/,
        "Team Management should not scan every shift while rendering merge controls."
    );
    assert.match(
        mergePersistenceSource,
        /collection\(db,\s*PAYOUT_LEDGER_COLLECTION\)/,
        "Temp-staff merge should discover payout ownership through canonical ledger dates."
    );
    assert.match(
        shiftEditorSource,
        /markUserHistoryFlags/,
        "Shift saves should mark involved real users with history metadata."
    );
    assert.match(
        shiftEditorSource,
        /getHistoryFlagUpdate/,
        "Shift saves should use explicit history flag updates."
    );
});
