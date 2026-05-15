import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail, setPersistence, browserSessionPersistence } from "firebase/auth";
import { doc, getDoc, runTransaction } from "firebase/firestore";

const AuthContext = createContext(null);
const normalizeUsername = (username) => username.trim().toLowerCase();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribe;

        setPersistence(auth, browserSessionPersistence)
            .then(() => {
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
            })
            .catch((error) => {
                console.error("Auth persistence error:", error);
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

    const login = async (identifier, password) => {
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

        await setPersistence(auth, browserSessionPersistence);
        return await signInWithEmailAndPassword(auth, emailToSignIn, password);
    };

    const register = async (email, password, username) => {
        const cleanEmail = email.trim();
        const cleanUsername = username.trim();
        const usernameKey = normalizeUsername(cleanUsername);
        const usernameRef = doc(db, 'usernames', usernameKey);
        const usernameDoc = await getDoc(usernameRef);

        if (usernameDoc.exists()) {
            throw new Error("Username already taken");
        }

        await setPersistence(auth, browserSessionPersistence);
        const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        const firebaseUser = userCredential.user;

        await updateProfile(firebaseUser, { displayName: cleanUsername });

        // Atomically claim the username and create the user doc.
        // If two registrations race for the same username, only one transaction
        // succeeds; the loser deletes its Firebase Auth account and surfaces an error.
        try {
            await runTransaction(db, async (transaction) => {
                const usernameSnap = await transaction.get(usernameRef);
                if (usernameSnap.exists()) {
                    throw new Error("Username already taken");
                }
                transaction.set(doc(db, 'users', firebaseUser.uid), {
                    uid: firebaseUser.uid,
                    username: cleanUsername,
                    email: cleanEmail,
                    role: "unassigned",
                    status: "pending",
                    createdAt: new Date().toISOString()
                });
                transaction.set(usernameRef, {
                    uid: firebaseUser.uid,
                    username: cleanUsername,
                    email: cleanEmail,
                    createdAt: new Date().toISOString()
                });
            });
        } catch (err) {
            await firebaseUser.delete();
            throw err;
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
