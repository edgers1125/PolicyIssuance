import { createContext, useContext, useState, useEffect } from "react";
import { login as loginRequest, getMe } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [permissions, setPermissions] = useState(null);
  const [agent, setAgent] = useState(null);

  useEffect(() => {
    if (!token) {
      setPermissions(null);
      setAgent(null);
      return;
    }
    getMe(token)
      .then((me) => {
        setPermissions(me.permissions);
        setAgent(me.agent || null);
      })
      .catch(() => {
        setPermissions([]);
        setAgent(null);
      });
  }, [token]);

  async function login(email, password) {
    const data = await loginRequest(email, password);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }

  function logout() {
    setToken(null);
    setUser(null);
    setPermissions(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  return (
    <AuthContext.Provider value={{ token, user, permissions, agent, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
