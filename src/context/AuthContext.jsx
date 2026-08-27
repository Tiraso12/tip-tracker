import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { auth, db } from '../config/firebase';
import {
    browserLocalPersistence,
    browserSessionPersistence,
    createUserWithEmailAndPassword,
    EmailAuthProvider,
    onAuthStateChanged,
    reauthenticateWithCredential,
    sendPasswordResetEmail,
    setPersistence,
    signInWithEmailAndPassword,
    signOut,
    updatePassword,
} from "firebase/auth";
import { doc, getDoc, writeBatch } from "firebase/firestore";

const AuthContext = createContext(null);
const normalizeUsername = (username) => username.trim().toLowerCase();
const normalizeEmail = (email) => email.trim().toLowerCase();
const EMAIL_EXISTS_MESSAGE = "An account with this email already exists. Log in or reset your password.";
const HANDLE_EXISTS_MESSAGE = "Login handle already in use.";
const PASSWORD_MISMATCH_MESSAGE =
    "An account already uses this email, but that password does not match it. "
    + "Log in with the correct password, or reset it and sign up again with the new one.";

function isEmailAlreadyInUseError(error) {
    return error?.code === "auth/email-already-in-use";
}

// "The password typed does not open this email's account." Firebase reports that as
// auth/invalid-credential once email enumeration protection is on and as the older
// spellings otherwise, and a never-registered email is indistinguishable from a wrong
// password by design - all of them answer the same question the same way.
const CREDENTIAL_MISMATCH_CODES = new Set([
    "auth/wrong-password",
    "auth/invalid-credential",
    "auth/invalid-login-credentials",
    "auth/user-not-found",
]);

const TRANSIENT_SIGN_IN_MESSAGES = {
    "auth/too-many-requests": "Too many attempts. Wait a few minutes, then try again.",
    "auth/network-request-failed": "Could not reach the server. Check your connection and try again.",
};

// Registration signs in to prove the person typing owns an email or handle that is
// already taken. Only a credential failure has a recovery worth naming, and each
// caller names its own; a rate limit or a dead connection is a failure to ask the
// question at all, so it surfaces as itself rather than as a claim about the account
// that sends the captain down a path which cannot work.
function registrationSignInError(error, credentialMessage) {
    if (CREDENTIAL_MISMATCH_CODES.has(error?.code)) return new Error(credentialMessage);
    const transient = TRANSIENT_SIGN_IN_MESSAGES[error?.code];
    return transient ? new Error(transient) : error;
}

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const registrationInProgressRef = useRef(false);

    useEffect(() => {
        let unsubscribe;

        unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Profile state is the authorization source of truth. Missing
                // or unreadable state must not become an active employee.
                let role = "unassigned";
                let status = "profile_error";
                let username = "";
                let firstName = "";
                let lastName = "";
                let createdAt = null;
                // The "Supervisor" switch - the captain tier. The manager sets
                // it, absent means off, and the job title in `role` grants
                // nothing on its own. See src/utils/permissions.js.
                let isSupervisor = false;
                try {
                    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
                    if (userDoc.exists()) {
                        const profile = userDoc.data();
                        role = profile.role || "unassigned";
                        status = profile.status || "pending";
                        username = profile.username || "";
                        firstName = profile.firstName || "";
                        lastName = profile.lastName || "";
                        createdAt = profile.createdAt || null;
                        isSupervisor = profile.isSupervisor === true;
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

                // Who holds the manager tier. It is a singleton pointer rather
                // than a role value, so "exactly one manager" is structural.
                // An absent or unreadable pointer means no manager has been
                // named, which leaves every tier capability resolving the way
                // it did before the tiers existed - see src/utils/permissions.js.
                let managerUid = null;
                try {
                    const configDoc = await getDoc(doc(db, 'restaurant', 'config'));
                    if (configDoc.exists()) {
                        managerUid = configDoc.data().managerUid || null;
                    }
                } catch (e) {
                    console.warn("Could not fetch the manager pointer:", e);
                }

                const mappedUser = {
                    uid: firebaseUser.uid,
                    username,
                    firstName,
                    lastName,
                    email: firebaseUser.email,
                    emailVerified: true, // Default to true as we're removing verification step
                    role,
                    status,
                    isSupervisor,
                    managerUid,
                    createdAt,
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

    const buildRegistrationProfile = (firebaseUser, { email, username, firstName, lastName }) => ({
        uid: firebaseUser.uid,
        username,
        firstName,
        lastName,
        email,
        role: "unassigned",
        status: "pending",
        createdAt: new Date().toISOString()
    });

    const writeRegistrationProfile = async (firebaseUser, profile) => {
        // The profile and login handle must land together. Team -> Pending only
        // sees users/{uid}, while username login depends on the public mapping.
        const batch = writeBatch(db);
        batch.set(doc(db, 'users', firebaseUser.uid), profile);
        batch.set(doc(db, 'usernames', normalizeUsername(profile.username)), {
            uid: firebaseUser.uid,
            username: profile.username,
            email: profile.email,
            createdAt: profile.createdAt
        });
        await batch.commit();
    };

    const deletePartiallyRegisteredAuthUser = async (firebaseUser, email, password) => {
        try {
            await firebaseUser.getIdToken(true);
            await firebaseUser.delete();
        } catch (deleteErr) {
            if (deleteErr?.code !== "auth/requires-recent-login") throw deleteErr;

            const credential = EmailAuthProvider.credential(email, password);
            await reauthenticateWithCredential(firebaseUser, credential);
            await firebaseUser.delete();
        }
    };

    const signInRegistrationUser = async (email, password) => {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const existingUser = userCredential.user;
        await existingUser.getIdToken(true);
        return existingUser;
    };

    const requireAuthOnlyUser = async (existingUser) => {
        const existingProfile = await getDoc(doc(db, 'users', existingUser.uid));
        if (existingProfile.exists()) {
            await signOut(auth);
            throw new Error(EMAIL_EXISTS_MESSAGE);
        }

        return existingUser;
    };

    const getAuthOnlyUserForRegistration = async (email, password) => {
        let existingUser;
        try {
            existingUser = await signInRegistrationUser(email, password);
        } catch (err) {
            // The email is taken and this password does not open it. Telling the
            // captain to "log in" here is a dead end when the account is an Auth-only
            // orphan - onAuthStateChanged signs that user straight back out - so name
            // the one sequence that does work: reset, then sign up again.
            throw registrationSignInError(err, PASSWORD_MISMATCH_MESSAGE);
        }
        return requireAuthOnlyUser(existingUser);
    };

    const register = async (email, password, username, firstName, lastName) => {
        const cleanEmail = normalizeEmail(email);
        const cleanUsername = username.trim();
        const cleanFirstName = firstName.trim();
        const cleanLastName = lastName.trim();
        const usernameKey = normalizeUsername(cleanUsername);
        const usernameRef = doc(db, 'usernames', usernameKey);

        let firebaseUser = null;
        let createdAuthUser = false;
        try {
            registrationInProgressRef.current = true;
            await setPersistence(auth, browserSessionPersistence);

            const existingUsername = await getDoc(usernameRef);
            if (existingUsername.exists()) {
                let existingAuthUser;
                try {
                    existingAuthUser = await signInRegistrationUser(cleanEmail, password);
                } catch (err) {
                    // Failing to sign in here proves nothing about the email - it may
                    // not exist at all. What is certain is that the handle is spoken
                    // for and this attempt did not prove it is theirs.
                    throw registrationSignInError(err, HANDLE_EXISTS_MESSAGE);
                }
                firebaseUser = await requireAuthOnlyUser(existingAuthUser);
                if (existingUsername.data()?.uid !== firebaseUser.uid) {
                    await signOut(auth);
                    throw new Error(HANDLE_EXISTS_MESSAGE);
                }
            } else {
                try {
                    const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
                    firebaseUser = userCredential.user;
                    createdAuthUser = true;
                    await firebaseUser.getIdToken(true);
                } catch (err) {
                    if (!isEmailAlreadyInUseError(err)) throw err;
                    firebaseUser = await getAuthOnlyUserForRegistration(cleanEmail, password);
                }
            }

            const canonicalEmail = normalizeEmail(firebaseUser.email || cleanEmail);
            await writeRegistrationProfile(firebaseUser, buildRegistrationProfile(firebaseUser, {
                email: canonicalEmail,
                username: cleanUsername,
                firstName: cleanFirstName,
                lastName: cleanLastName,
            }));
        } catch (err) {
            if (firebaseUser && createdAuthUser) {
                try {
                    await deletePartiallyRegisteredAuthUser(firebaseUser, cleanEmail, password);
                } catch (deleteErr) {
                    console.warn("Could not delete partially registered auth user:", deleteErr);
                    await signOut(auth);
                }
            } else if (firebaseUser && auth.currentUser?.uid === firebaseUser.uid) {
                await signOut(auth);
            }
            throw err;
        } finally {
            registrationInProgressRef.current = false;
        }

        // A self-registered account is pending with no title and no switch - the
        // same safe defaults firestore.rules enforces on the create.
        setUser(prev => ({
            ...prev,
            username: cleanUsername,
            firstName: cleanFirstName,
            lastName: cleanLastName,
            role: "unassigned",
            status: "pending",
            isSupervisor: false,
            emailVerified: true,
        }));
        return firebaseUser;
    };

    const resetPassword = async (email) => {
        await sendPasswordResetEmail(auth, email);
    };

    const updateSessionProfile = (changes) => {
        setUser((current) => current ? { ...current, ...changes } : current);
    };

    const changePassword = async (currentPassword, nextPassword) => {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser?.email) throw new Error("Your sign-in session is unavailable. Log in again and retry.");
        if (!currentPassword) throw new Error("Enter your current password.");
        if (nextPassword.length < 8) throw new Error("Your new password must be at least 8 characters.");

        const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
        await reauthenticateWithCredential(firebaseUser, credential);
        await updatePassword(firebaseUser, nextPassword);
    };

    return (
        <AuthContext.Provider value={{
            user,
            login,
            register,
            logout,
            loading,
            resetPassword,
            updateSessionProfile,
            changePassword,
        }}>
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
