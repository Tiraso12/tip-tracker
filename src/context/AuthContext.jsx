import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { auth, db } from '../config/firebase';
import {
    browserLocalPersistence,
    browserSessionPersistence,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
} from "firebase/auth";
import { doc, getDoc, writeBatch } from "firebase/firestore";

const AuthContext = createContext(null);
const normalizeUsername = (username) => username.trim().toLowerCase();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const registrationInProgressRef = useRef(false);

    useEffect(() => {
        let unsubscribe;

        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Fetch role and status from Firestore
                let role = "employee"; // default fallback
                let status = "active"; // default fallback
                try {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        role = userDoc.data().role || "employee";
                        status = userDoc.data().status || "active";
                    } else if (registrationInProgressRef.current) {
                        role = "unassigned";
                        status = "pending";
                    } else {
                        // User was deleted from Firestore by an Admin
                        console.warn("User document not found. Auto-logging out.");
                        await signOut(auth);
                        setUser(null);
                        setLoading(false);
                        return;
                    }
                } catch (e) {
                    console.warn("Could not fetch user data:", e);
                }

                const mappedUser = {
                    uid: firebaseUser.uid,
                    username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                    email: firebaseUser.email,
                    emailVerified: true, // Default to true as we're removing verification step
                    role,
                    status,
                };
                setUser(mappedUser);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const login = async (identifier, password, rememberMe = false) => {
        const trimmedIdentifier = identifier.trim();
        let emailToSignIn = trimmedIdentifier;

        if (!trimmedIdentifier.includes('@')) {
            const usernameKey = normalizeUsername(trimmedIdentifier);
            const usernameDoc = await getDoc(doc(db, 'usernames', usernameKey));

            if (!usernameDoc.exists()) {
                throw new Error("User not found");
            }
            emailToSignIn = usernameDoc.data().email;
        }

        await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
        return await signInWithEmailAndPassword(auth, emailToSignIn, password);
    };

    const register = async (email, password, username) => {
        const cleanEmail = email.trim();
        const cleanUsername = username.trim();
        const usernameKey = normalizeUsername(cleanUsername);
        const usernameRef = doc(db, 'usernames', usernameKey);

        let firebaseUser = null;
        try {
            registrationInProgressRef.current = true;
            await setPersistence(auth, browserSessionPersistence);
            const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
            firebaseUser = userCredential.user;

            await updateProfile(firebaseUser, { displayName: cleanUsername });

            // Atomically claim the username and create the user doc without a
            // client-side username read. Firestore rules allow creating the
            // username mapping, but deny updating it, so an existing username
            // fails the batch instead of being overwritten.
            const batch = writeBatch(db);
            batch.set(doc(db, 'users', firebaseUser.uid), {
                uid: firebaseUser.uid,
                username: cleanUsername,
                email: cleanEmail,
                role: "unassigned",
                status: "pending",
                createdAt: new Date().toISOString()
            });
            batch.set(usernameRef, {
                uid: firebaseUser.uid,
                username: cleanUsername,
                email: cleanEmail,
                createdAt: new Date().toISOString()
            });
            await batch.commit();
        } catch (err) {
            if (firebaseUser) {
                try {
                    await firebaseUser.delete();
                } catch (deleteErr) {
                    console.warn("Could not delete partially registered auth user:", deleteErr);
                    await signOut(auth);
                }
            }
            throw err;
        } finally {
            registrationInProgressRef.current = false;
        }

        setUser(prev => ({ ...prev, username: cleanUsername, role: "unassigned", status: "pending", emailVerified: true }));
        return firebaseUser;
    };

    const resetPassword = async (email) => {
        await sendPasswordResetEmail(auth, email);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading, resetPassword }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
