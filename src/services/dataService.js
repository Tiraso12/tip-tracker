import { db } from "../config/firebase";
import { doc, getDoc, setDoc, collection, getDocs, onSnapshot } from "firebase/firestore";

const COLLECTION_NAME = "tips";

const DataService = {
    currentUserId: null,

    setUserId: (id) => {
        DataService.currentUserId = id;
    },

    /**
     * Helper to get collection reference for current user
     */
    getCollection: () => {
        if (!DataService.currentUserId) {
            throw new Error("No user logged in");
        }
        return collection(db, "users", DataService.currentUserId, "tips");
    },

    /**
     * Fetch data for a specific date key (YYYY-MM-DD)
     * @param {string} dateKey 
     * @returns {Promise<Object>}
     */
    getData: async (dateKey) => {
        try {
            if (!DataService.currentUserId) return { gratuity: "", tip: "", cash: "" };
            const docRef = doc(db, "users", DataService.currentUserId, "tips", dateKey);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                return docSnap.data();
            } else {
                return { gratuity: "", tip: "", cash: "" };
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            return { gratuity: "", tip: "", cash: "" };
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
     * Subscribe to real-time updates for a set of dates (optional, not used correctly yet in App)
     * Actually, for document IDs, best to just subscribe to the collection or individual docs.
     * Given the small number (7), individual subscriptions or a collection query with FieldPath.documentId() might work 
     * but 'in' query limit is 10, so it fits a week.
     */
    subscribeToWeek: (dateKeys, onUpdate) => {
        // We can't easily query by documentId IN [...list] using the modular SDK comfortably for ids.
        // Easier approach: Listen to the whole collection? No, expensive.
        // Listen to individual documents.

        const unsubscribes = [];
        if (!DataService.currentUserId) return () => { };

        dateKeys.forEach(key => {
            const docRef = doc(db, "users", DataService.currentUserId, "tips", key);
            const unsub = onSnapshot(docRef, (doc) => {
                if (doc.exists()) {
                    onUpdate(key, doc.data());
                } else {
                    // Document might have been deleted or not exist yet
                    onUpdate(key, { gratuity: "", tip: "", cash: "" });
                }
            });
            unsubscribes.push(unsub);
        });

        // Return a function to unsubscribe from all
        return () => unsubscribes.forEach(fn => fn());
    },

    /**
     * Fetch ALL data (for summaries)
     * @returns {Promise<Object>}
     */
    getAllData: async () => {
        try {
            if (!DataService.currentUserId) return {};
            const querySnapshot = await getDocs(DataService.getCollection());
            const result = {};
            querySnapshot.forEach((doc) => {
                result[doc.id] = doc.data();
            });
            return result;
        } catch (error) {
            console.error("Error getting all documents: ", error);
            return {};
        }
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
            await setDoc(doc(db, "users", DataService.currentUserId, "tips", dateKey), data);
            console.log(`Saved data for ${dateKey}:`, data);
        } catch (error) {
            console.error("Error saving document: ", error);
            throw error;
        }
    }
};

export default DataService;
