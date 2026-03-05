import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, getDocs } from "firebase/firestore";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            console.log("Auth State Changed:", firebaseUser ? "User found" : "No user - Login needed");
            if (firebaseUser) {
                // Fetch role from Firestore
                let role = "employee"; // default
                try {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        role = userDoc.data().role || "employee";
                    }
                } catch (e) {
                    console.warn("Could not fetch user role:", e);
                }

                const mappedUser = {
                    uid: firebaseUser.uid,
                    username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL,
                    role,
                };
                setUser(mappedUser);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
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

        return await signInWithEmailAndPassword(auth, emailToSignIn, password);
    };

    const register = async (email, password, username) => {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            throw new Error("Username already taken");
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        await updateProfile(firebaseUser, { displayName: username });

        // New users default to "employee" role
        await setDoc(doc(db, 'users', firebaseUser.uid), {
            uid: firebaseUser.uid,
            username: username,
            email: email,
            role: "employee",
            createdAt: new Date().toISOString()
        });

        setUser(prev => ({ ...prev, username: username, role: "employee" }));
        return firebaseUser;
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
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
