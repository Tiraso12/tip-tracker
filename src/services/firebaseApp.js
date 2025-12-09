// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";

// Your web app's Firebase configuration
// TODO: Replace with your actual config
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const db = getFirestore(app);

export const firebaseApp = {
    subscribeToWeek: (startOfWeekDate, onUpdate) => {
        console.warn("Firebase not properly configured yet. Using mock implementation.");
        return () => { };

        /* implementation draft:
        const q = query(collection(db, "tips")); 
        // In reality we might want to query by date range, but for now getting all is fine for small data
        
        const unsubscribe = onSnapshot(collection(db, "tips"), (snapshot) => {
            const data = {};
            snapshot.forEach(doc => {
                data[doc.id] = doc.data();
            });
            onUpdate(data);
        });
        return unsubscribe;
        */
    },

    updateDay: async (dateKey, data) => {
        console.warn("Firebase update not implemented.");
        /*
        await setDoc(doc(db, "tips", dateKey), data, { merge: true });
        */
    }
};
