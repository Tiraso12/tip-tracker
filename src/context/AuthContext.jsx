import React, { createContext, useState, useEffect, useContext } from 'react';
import { auth } from '../config/firebase';
import { onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const DEV_USER = {
        uid: 'dev-user',
        username: 'Dev User',
        email: 'dev@local',
        photoURL: null
    };

    useEffect(() => {
        // Listen to Firebase Auth state changes
        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            console.log("Auth State Changed:", firebaseUser ? "User found" : "No user - Defaulting to Dev");
            if (firebaseUser) {
                // Map Firebase user to our app's user structure
                // We use displayName or extract name from email for 'username'
                const mappedUser = {
                    uid: firebaseUser.uid,
                    username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'User',
                    email: firebaseUser.email,
                    photoURL: firebaseUser.photoURL
                };
                setUser(mappedUser);
            } else {
                // BYPASS: Default to Dev User instead of null
                setUser(DEV_USER);
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
    const login = async (email, password) => {
        return await signInWithEmailAndPassword(auth, email, password);
    };

    const register = async (email, password, username) => {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, {
            displayName: username
        });
        // Force update user state with new display name
        setUser(prev => ({ ...prev, username: username }));
        return userCredential.user;
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
