import { mockApp } from "./mockApp";
import { firebaseApp } from "./firebaseApp";

// CONFIGURATION: Set to true to switch to Firebase
const USE_FIREBASE = false;

const provider = USE_FIREBASE ? firebaseApp : mockApp;

export const DataService = {
    subscribeToWeek: (startOfWeekDate, onUpdate) => {
        return provider.subscribeToWeek(startOfWeekDate, onUpdate);
    },

    updateDay: (dateKey, data) => {
        return provider.updateDay(dateKey, data);
    }
};
