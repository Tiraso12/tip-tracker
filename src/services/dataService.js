import { db } from "../config/firebase";
import { doc, getDoc, setDoc, collection, getDocs, writeBatch, onSnapshot } from "firebase/firestore";

const COLLECTION_NAME = "tips";

const DataService = {
    /**
     * Fetch data for a specific date key (YYYY-MM-DD)
     * @param {string} dateKey 
     * @returns {Promise<Object>}
     */
    getData: async (dateKey) => {
        try {
            const docRef = doc(db, COLLECTION_NAME, dateKey);
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
        dateKeys.forEach(key => {
            const unsub = onSnapshot(doc(db, COLLECTION_NAME, key), (doc) => {
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
            const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
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
            await setDoc(doc(db, COLLECTION_NAME, dateKey), data);
            console.log(`Saved data for ${dateKey}:`, data);
        } catch (error) {
            console.error("Error saving document: ", error);
            throw error;
        }
    }
};

export default DataService;
