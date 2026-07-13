import { createContext, useContext, useState, useCallback } from "react";
import axios from "axios";

const AuthContext = createContext(null);

const STORAGE_KEY = "wpi_auth_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  });
  const [error, setError] = useState("");

  const login = useCallback(async (username, password) => {
    setError("");
    try {
      const { data } = await axios.post("/api/auth/login", { username, password });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setUser(data);
      return data;
    } catch (err) {
      const msg = err.response?.data?.error || "Login failed";
      setError(msg);
      throw new Error(msg);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, error, setError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
