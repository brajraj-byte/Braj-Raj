import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Logo } from "@/components/Logo";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import ParseResume from "@/components/tabs/ParseResume";
import CandidateDatabase from "@/components/tabs/CandidateDatabase";
import ClientDetails from "@/components/tabs/ClientDetails";
import BusinessDevelopment from "@/components/tabs/BusinessDevelopment";
import JoiningDetails from "@/components/tabs/JoiningDetails";
import SearchTab from "@/components/tabs/SearchTab";
import Celebrations from "@/components/tabs/Celebrations";
import AdminConsole from "@/components/tabs/AdminConsole";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { FileText, Database, Building2, Target, ClipboardCheck, Search, Cake, Shield, LogOut, KeyRound, Circle, ChevronDown } from "lucide-react";

const TABS = [
  { key: "parse_resume", label: "Parse Resume", icon: FileText, comp: ParseResume },
  { key: "candidate_db", label: "Candidate Database", icon: Database, comp: CandidateDatabase },
  { key: "client_details", label: "Client Details", icon: Building2, comp: ClientDetails },
  { key: "business_development", label: "Business Development", icon: Target, comp: BusinessDevelopment },
  { key: "joining_details", label: "Joining Details", icon: ClipboardCheck, comp: JoiningDetails },
  { key: "advanced_search", label: "Search", icon: Search, comp: SearchTab },
  { key: "celebrations", label: "Celebrations", icon: Cake, comp: Celebrations },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [active, setActive] = useState("parse_resume");
  const [features, setFeatures] = useState({});
  const [pwOpen, setPwOpen] = useState(false);

  const loadFeatures = useCallback(() => { api.get("/features").then(({ data }) => setFeatures(data)).catch(() => {}); }, []);
  useEffect(() => { loadFeatures(); }, [loadFeatures]);

  const isAdmin = user?.role === "admin";
  const forcedPw = user?.must_change_password;

  const visibleTabs = TABS.filter((t) => isAdmin || features[t.key] !== false);
  const ActiveComp = (active === "admin"
    ? null
    : (visibleTabs.find((t) => t.key === active) || visibleTabs[0])?.comp) || ParseResume;

  const extraProps = {};
  if (active === "business_development") extraProps.features = features;

  return (
    <div className="min-h-screen bg-white">
      {forcedPw && <ChangePasswordDialog open forced onOpenChange={() => {}} />}
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200" data-testid="self-online-badge">
              <Circle className="h-2 w-2 fill-current text-emerald-500" /> Online
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2" data-testid="user-menu-button">
                  <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center font-semibold text-sm">
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="hidden sm:block text-left leading-tight">
                    <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
                    <p className="text-[11px] text-slate-400 capitalize">{user?.role}</p>
                  </div>
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setPwOpen(true)} data-testid="menu-change-password"><KeyRound className="h-4 w-4 mr-2" /> Change password</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-red-600" data-testid="menu-logout"><LogOut className="h-4 w-4 mr-2" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center gap-1 overflow-x-auto pb-2 -mb-px" data-testid="tab-nav">
            {visibleTabs.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.key} onClick={() => setActive(t.key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active === t.key ? "bg-orange-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
                  data-testid={`tab-${t.key}`}>
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
            {isAdmin && (
              <button onClick={() => setActive("admin")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${active === "admin" ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
                data-testid="tab-admin">
                <Shield className="h-4 w-4" /> Admin Console
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {active === "admin" && isAdmin
          ? <AdminConsole features={features} setFeatures={setFeatures} />
          : <ActiveComp {...extraProps} />}
      </main>
    </div>
  );
}
