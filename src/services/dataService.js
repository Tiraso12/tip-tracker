import { db } from "../config/firebase";
import { getDoc, onSnapshot } from "firebase/firestore";
import { EMPTY_EMPLOYEE_PAYOUT, ledgerEntryToEmployeeData, payoutLedgerEntryRef } from "../utils/payoutLedger";

const DataService = {
    currentUserId: null,

    setUserId: (id) => {
        DataService.currentUserId = id;
    },

    /**
     * Helper to get the current user's payout ledger query
     */
    getCollection: () => {
        if (!DataService.currentUserId) {
            throw new Error("No user logged in");
        }
        throw new Error("Use bounded payout ledger date reads");
    },

    /**
     * Fetch data for a specific date key (YYYY-MM-DD)
     * @param {string} dateKey 
     * @returns {Promise<Object>}
     */
    getData: async (dateKey) => {
        try {
            if (!DataService.currentUserId) return { ...EMPTY_EMPLOYEE_PAYOUT };
            const docRef = payoutLedgerEntryRef(db, dateKey, DataService.currentUserId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return ledgerEntryToEmployeeData({ uid: docSnap.id, ...docSnap.data() });
            } else {
                return { ...EMPTY_EMPLOYEE_PAYOUT };
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            return { ...EMPTY_EMPLOYEE_PAYOUT };
        }
    },

    /**
     * Fetch data for a range of dates
     * @param {string[]} dateKeys - Array of YYYY-MM-DD strings
     * @returns {Promise<Object>} - Map of dateKey -> data object
     */
    getRange: async (dateKeys) => {
        // Firestore doesn't support "IN" queries for document IDs directly in a way that maps easily 
        // without fetching them individually or using 'where' clause on a field.
        // For simplicity and since the range is usually small (e.g. 2 weeks), we can fetch them in parallel.
        const result = {};
        const promises = dateKeys.map(async (key) => {
            const data = await DataService.getData(key);
            result[key] = data;
        });
        await Promise.all(promises);
        return result;
    },

    /**
     * Subscribe to real-time updates for a bounded set of date-key documents.
     * This avoids listening to the user's full historical tips collection.
     */
    subscribeToDates: (dateKeys, onUpdate, onError) => {
        const unsubscribes = [];
        if (!DataService.currentUserId) return () => { };

        dateKeys.forEach(key => {
            const docRef = payoutLedgerEntryRef(db, key, DataService.currentUserId);
            const unsub = onSnapshot(docRef, (doc) => {
                if (doc.exists()) {
                    onUpdate(key, ledgerEntryToEmployeeData({ uid: doc.id, ...doc.data() }));
                } else {
                    // Document might have been deleted or not exist yet
                    onUpdate(key, { ...EMPTY_EMPLOYEE_PAYOUT });
                }
            }, (error) => {
                console.error("Error subscribing to tip document:", error);
                if (onError) onError(error);
            });
            unsubscribes.push(unsub);
        });

        // Return a function to unsubscribe from all
        return () => unsubscribes.forEach(fn => fn());
    },

    subscribeToWeek: (dateKeys, onUpdate, onError) => {
        return DataService.subscribeToDates(dateKeys, onUpdate, onError);
    },

    /**
     * Legacy whole-history helper. Employee payout reads should stay date-bounded.
     * @returns {Promise<Object>}
     */
    getAllData: async () => {
        return {};
    },

    /**
     * Legacy whole-history subscription. Employee payout reads should stay date-bounded.
     * @param {(data: Object) => void} onUpdate
     * @param {(error: Error) => void} onError
     * @returns {Function}
     */
    subscribeToAllData: (onUpdate, onError) => {
        if (!DataService.currentUserId) return () => { };

        onUpdate({});
        if (onError) onError(new Error("Use bounded payout ledger date subscriptions"));
        return () => { };
    },

    /**
     * Save data for a specific date
     * @param {string} dateKey 
     * @param {Object} data 
     * @returns {Promise<void>}
     */
    saveData: async (dateKey, data) => {
        try {
            if (!DataService.currentUserId) throw new Error("No user logged in");
            void dateKey;
            void data;
            throw new Error("Payout ledger entries are created by admin closeout only");
        } catch (error) {
            console.error("Error saving document: ", error);
            throw error;
        }
    }
};

export default DataService;
