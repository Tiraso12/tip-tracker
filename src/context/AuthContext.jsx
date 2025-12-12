import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth, db } from '../config/firebase';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc, collection, query, where, getDocs } from "firebase/firestore";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Listen to Firebase Auth state changes
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            console.log("Auth State Changed:", firebaseUser ? "User found" : "No user - Login needed");
            if (firebaseUser) {
                // Map Firebase user to our app's user structure
                const mappedUser = {
                    uid: firebaseUser.uid,
                    username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL
                };
                setUser(mappedUser);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        // Cleanup subscription
        return () => unsubscribe();
    }, []);

    // These functions are less critical now if using FirebaseUI, 
    // but useful if we want to add custom buttons later.
    // We strictly only need logout for now.

    const logout = async () => {
        try {
            await signOut(auth);
            // State update handled by onAuthStateChanged (will revert to DEV_USER)
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    // Keep these empty or throw error if called, 
    // as we are delegating login/register to the UI widget for now.
    const login = async (identifier, password) => {
        let emailToSignIn = identifier;

        // If identifier is NOT an email, look it up
        if (!identifier.includes('@')) {
            const usersRef = collection(db, 'users');
            const q = query(usersRef, where('username', '==', identifier));
            const querySnapshot = await getDocs(q);

            if (querySnapshot.empty) {
                throw new Error("User not found");
            }
            // define emailToSignIn from the found document
            emailToSignIn = querySnapshot.docs[0].data().email;
        }

        return await signInWithEmailAndPassword(auth, emailToSignIn, password);
    };

    const register = async (email, password, username) => {
        // Validation: Check if username is taken
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('username', '==', username));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            throw new Error("Username already taken");
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;

        await updateProfile(firebaseUser, {
            displayName: username
        });

        // Store user in Firestore 'users' collection
        await setDoc(doc(db, 'users', firebaseUser.uid), {
            uid: firebaseUser.uid,
            username: username,
            email: email,
            createdAt: new Date().toISOString()
        });

        // Force update user state with new display name
        setUser(prev => ({ ...prev, username: username }));
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
