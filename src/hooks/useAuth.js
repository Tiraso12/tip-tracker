import { useState, useEffect } from "react";

export function useAuth() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    useEffect(() => {
        // Check for existing session
        const storedAuth = localStorage.getItem("tip-tracker-auth");
        if (storedAuth === "true") {
            setIsAuthenticated(true);
        }
    }, []);

    const login = () => {
        setIsAuthenticated(true);
        localStorage.setItem("tip-tracker-auth", "true");
    };

    const logout = () => {
        setIsAuthenticated(false);
        localStorage.removeItem("tip-tracker-auth");
    };

    return { isAuthenticated, login, logout };
}
