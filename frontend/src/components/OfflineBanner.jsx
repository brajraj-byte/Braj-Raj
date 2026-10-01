import { useState, useEffect } from "react";
import { WifiOff } from "lucide-react";

export const OfflineBanner = () => {
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);
  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (!offline) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 bg-slate-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg animate-fade-up" data-testid="offline-banner">
      <WifiOff className="h-4 w-4 text-amber-400" />
      You're offline — showing cached data. AI parsing & live updates resume when back online.
    </div>
  );
};
