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

test("A pay statement scopes its reads to the days it actually shows", () => {
    // The statement is where a person's payout documents are read now - one
    // component for your own pay and, through the roster, a colleague's - so
    // this is where the bounded window has to hold.
    const statementSource = readSource("src/components/Pay/PayStatement.jsx");
    const dataServiceSource = readSource("src/services/dataService.js");

    assert.doesNotMatch(
        statementSource,
        /DataService\.subscribeToAllData/,
        "A pay statement should not subscribe to the full historical tips collection."
    );
    assert.match(
        statementSource,
        /getPayStatementSubscriptionKeys/,
        "A pay statement should derive a small date window before subscribing."
    );
    assert.match(
        statementSource,
        /DataService\.subscribeToDatesForUser/,
        "A pay statement should subscribe only to the needed payout documents, for one person."
    );
    assert.match(
        dataServiceSource,
        /subscribeToDatesForUser/,
        "DataService should expose a document-scoped, per-person subscription helper."
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
    // The merge has to find shifts that still name the temp profile but hold no
    // money yet. That lookup must stay an indexed "setup" query - a bare scan of
    // `shifts` grows with every night the restaurant has ever worked.
    assert.match(
        mergePersistenceSource,
        /query\(collection\(db,\s*["']shifts["']\),\s*where\(["']status["'],\s*["']==["'],\s*["']setup["']\)\)/,
        "Temp-staff merge should find open rosters through a status-bounded query, not a full shift scan."
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
