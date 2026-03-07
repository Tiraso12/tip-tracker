import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendEmailVerification, sendPasswordResetEmail, setPersistence, browserSessionPersistence } from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let unsubscribe;

        setPersistence(auth, browserSessionPersistence)
            .then(() => {
                unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                    console.log("Auth State Changed:", firebaseUser ? "User found" : "No user - Login needed");
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
                            emailVerified: firebaseUser.emailVerified,
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
        let emailToSignIn = identifier;

        if (!identifier.includes('@')) {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('username', '==', identifier));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("User not found");
            }
            emailToSignIn = querySnapshot.docs[0].data().email;
        }

        await setPersistence(auth, browserSessionPersistence);
        return await signInWithEmailAndPassword(auth, emailToSignIn, password);
    };

    const register = async (email, password, username) => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            throw new Error("Username already taken");
        }

        await setPersistence(auth, browserSessionPersistence);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        await updateProfile(firebaseUser, { displayName: username });

        // New users default to pending status
        await setDoc(doc(db, 'users', firebaseUser.uid), {
            uid: firebaseUser.uid,
            username: username,
            email: email,
            role: "unassigned",
            status: "pending",
            createdAt: new Date().toISOString()
        });

        // Send Email Verification
        await sendEmailVerification(firebaseUser);

        setUser(prev => ({ ...prev, username: username, role: "unassigned", status: "pending", emailVerified: false }));
        return firebaseUser;
    };

    const resetPassword = async (email) => {
        await sendPasswordResetEmail(auth, email);
    };

    const resendVerificationEmail = async () => {
        if (auth.currentUser) {
            await sendEmailVerification(auth.currentUser);
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading, resetPassword, resendVerificationEmail }}>
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
