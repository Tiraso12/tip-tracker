import { initializeApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" && !globalThis.__TIP_TRACKER_EMULATORS_CONNECTED__) {
    const firestoreEmulatorPort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080);
    const authEmulatorPort = Number(import.meta.env.VITE_AUTH_EMULATOR_PORT || 9099);

    connectFirestoreEmulator(db, "127.0.0.1", firestoreEmulatorPort);
    connectAuthEmulator(auth, `http://127.0.0.1:${authEmulatorPort}`, { disableWarnings: true });
    globalThis.__TIP_TRACKER_EMULATORS_CONNECTED__ = true;
}

export { db, auth };
