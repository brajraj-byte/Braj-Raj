import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { api, apiError } from "@/lib/api";

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = logged out, object = logged in
  const hbRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const bootstrap = useCallback(async () => {
    const token = localStorage.getItem("cb_token");
    if (!token) {
      setUser(false);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("cb_token");
      setUser(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  // Track genuine user activity; an idle user (no interaction) stops sending
  // heartbeats so the admin console can mark them Away / Dormant.
  useEffect(() => {
    const mark = () => { lastActivityRef.current = Date.now(); };
    const evts = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    evts.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    return () => evts.forEach((e) => window.removeEventListener(e, mark));
  }, []);

  // heartbeat for online status (only while the user is actively using the app)
  useEffect(() => {
    if (user && user.id) {
      const ACTIVE_WINDOW = 90000;
      const beat = () => {
        if (Date.now() - lastActivityRef.current < ACTIVE_WINDOW) {
          api.post("/heartbeat").catch(() => {});
        }
      };
      beat();
      hbRef.current = setInterval(beat, 30000);
      return () => clearInterval(hbRef.current);
    }
  }, [user]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("cb_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const acceptInvite = async (payload) => {
    const { data } = await api.post("/auth/accept-invite", payload);
    localStorage.setItem("cb_token", data.token);
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (e) { console.warn("logout notify failed", e); }
    localStorage.removeItem("cb_token");
    setUser(false);
  };

  const refreshMe = async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      console.warn("refreshMe failed", e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, acceptInvite, refreshMe, apiError }}>
      {children}
    </AuthContext.Provider>
  );
}
