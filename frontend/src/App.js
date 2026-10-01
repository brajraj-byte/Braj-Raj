import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import "@/App.css";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { OfflineBanner } from "@/components/OfflineBanner";
import { api, apiError } from "@/lib/api";
import Login from "@/pages/Login";
import AcceptInvite from "@/pages/AcceptInvite";
import Dashboard from "@/pages/Dashboard";
import { Loader2 } from "lucide-react";

function FullLoader() {
  return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>;
}

// Handles Google OAuth return: #session_id=...
function AuthCallback() {
  const navigate = useNavigate();
  const { refreshMe } = useAuth();
  const [error, setError] = useState("");
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = window.location.hash || "";
    const sid = new URLSearchParams(hash.replace(/^#/, "")).get("session_id");
    (async () => {
      try {
        const { data } = await api.post("/auth/google/session", { session_id: sid });
        localStorage.setItem("cb_token", data.token);
        window.history.replaceState(null, "", window.location.pathname);
        await refreshMe();
        navigate("/");
      } catch (ex) {
        setError(apiError(ex));
      }
    })();
  }, [navigate, refreshMe]);

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <p className="font-heading text-lg font-bold text-slate-900">Sign-in failed</p>
          <p className="text-sm text-slate-500">{error}</p>
          <button onClick={() => navigate("/login")} className="text-orange-600 font-semibold text-sm">Back to login</button>
        </div>
      </div>
    );
  return <FullLoader />;
}

function Protected() {
  const { user } = useAuth();
  if (user === null) return <FullLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Dashboard />;
}

function LoginRoute() {
  const { user } = useAuth();
  if (user === null) return <FullLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

function AppRouter() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />
      <Route path="/" element={<Protected />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <OfflineBanner />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
