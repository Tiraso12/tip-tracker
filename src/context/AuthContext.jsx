import React, { createContext, useState, useEffect, useContext } from 'react';
import AuthService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check local storage for persisted session
        const storedUser = localStorage.getItem('tip_tracker_user');
        if (storedUser) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("Failed to parse stored user", e);
                localStorage.removeItem('tip_tracker_user');
            }
        }
        setLoading(false);
    }, []);

    const login = async (username, password) => {
        const loggedInUser = await AuthService.login(username, password);
        setUser(loggedInUser);
        localStorage.setItem('tip_tracker_user', JSON.stringify(loggedInUser));
        return loggedInUser;
    };

    const register = async (username, password) => {
        const newUser = await AuthService.register(username, password);
        setUser(newUser);
        localStorage.setItem('tip_tracker_user', JSON.stringify(newUser));
        return newUser;
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('tip_tracker_user');
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
