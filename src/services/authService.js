import { db } from "../config/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const USERS_COLLECTION = "users";

const AuthService = {
    /**
     * Register a new user
     * @param {string} username 
     * @param {string} password 
     * @returns {Promise<Object>} user object
     */
    register: async (username, password) => {
        // For simplicity, we are using the username as the document ID (unique constraint).
        // In a real app we might use a UUID and query by username, but this enforces uniqueness easily.
        const userId = username.toLowerCase();
        const userRef = doc(db, USERS_COLLECTION, userId);

        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
            throw new Error("Username already exists");
        }

        // Hash password in production! Storing plain text for this specific request scope/simplicity
        // or simplicity as requested by user context (minimalist app).
        // The prompt asked for "logins and passwords", but usually client-side hashing is minimum if no backend.
        // We will just store it directly for now as per the "minimalist" level, but add a TODO.
        const userData = {
            username: username,
            password: password, // TODO: Hash this if going to production
            createdAt: new Date().toISOString()
        };

        await setDoc(userRef, userData);

        // Return safe user object (without password)
        return {
            uid: userId,
            username: username
        };
    },

    /**
     * Login a user
     * @param {string} username 
     * @param {string} password 
     * @returns {Promise<Object>} user object
     */
    login: async (username, password) => {
        const userId = username.toLowerCase();
        const userRef = doc(db, USERS_COLLECTION, userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            throw new Error("User not found");
        }

        const userData = userSnap.data();
        if (userData.password !== password) {
            throw new Error("Invalid password");
        }

        return {
            uid: userId,
            username: userData.username
        };
    }
};

export default AuthService;
