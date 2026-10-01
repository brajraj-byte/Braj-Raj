import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UserPlus, Trash2, Copy, RefreshCw, Loader2, Circle, Link2, Sparkles, Mail } from "lucide-react";
import { toast } from "sonner";

const FEATURE_LABELS = {
  parse_resume: "Parse Resume", candidate_db: "Candidate Database", client_details: "Client Details",
  business_development: "Business Development", joining_details: "Joining Details",
  advanced_search: "Advanced Search", celebrations: "Celebrations", ai_bd_suggestions: "AI BD Suggestions",
  job_tracking: "Job Tracking",
};

export default function AdminConsole({ features, setFeatures }) {
  const [members, setMembers] = useState([]);
  const fmt = (s) => (s ? new Date(s).toLocaleString() : "—");
  const STATE = {
    online: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "text-emerald-500", label: "Online", flash: false },
    away: { cls: "bg-slate-100 text-slate-600 border-slate-200", dot: "text-slate-400", label: "Away", flash: false },
    dormant: { cls: "bg-orange-50 text-orange-700 border-orange-400", dot: "text-orange-500", label: "Dormant", flash: true },
    offline: { cls: "bg-slate-100 text-slate-500 border-slate-200", dot: "text-slate-300", label: "Offline", flash: false },
  };
  const stateOf = (m) => {
    if (!m.last_seen) return "offline";
    const diff = Date.now() - new Date(m.last_seen).getTime();
    if (diff < 120000) return "online";       // active in last 2 min
    if (diff >= 1800000) return "dormant";     // idle 30+ min -> flashing orange
    return "away";
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "" });
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const inviteUrl = (token) => `${window.location.origin}/invite/${token}`;

  const load = useCallback(() => {
    api.get("/admin/members").then(({ data }) => setMembers(data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const { data } = await api.post("/admin/members", form);
      toast.success(`${data.name} added — invite emailed`);
      setForm({ name: "", email: "" });
      setOpen(false);
      load();
    } catch (ex) { toast.error(apiError(ex)); }
    finally { setCreating(false); }
  };

  const remove = async (m) => {
    if (!window.confirm(`Delete team member ${m.name}? This cannot be undone.`)) return;
    await api.delete(`/admin/members/${m.id}`); toast.success("Member removed"); load();
  };

  const regenerate = async (m) => {
    const { data } = await api.post(`/admin/members/${m.id}/regenerate-invite`);
    navigator.clipboard?.writeText(inviteUrl(data.invite_token));
    toast.success("New invite link generated & copied");
    load();
  };

  const copyLink = (token) => { navigator.clipboard?.writeText(inviteUrl(token)); toast.success("Invite link copied"); };

  const toggleFeature = async (key, val) => {
    const next = { ...features, [key]: val };
    setFeatures(next);
    try { const { data } = await api.put("/features", { [key]: val }); setFeatures(data); }
    catch (ex) { toast.error(apiError(ex)); setFeatures(features); }
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Admin Console</h2>
          <p className="text-sm text-slate-500">Manage your team, access links & feature access.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="add-member-button"><UserPlus className="h-4 w-4 mr-1.5" /> Add Team Member</Button></DialogTrigger>
          <DialogContent className="sm:max-w-md" data-testid="member-dialog">
            <DialogHeader><DialogTitle className="font-heading">Add Team Member</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2"><Label>Full name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required data-testid="member-name-input" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required data-testid="member-email-input" /></div>
              <p className="text-xs text-slate-500 flex items-start gap-1.5"><Mail className="h-3.5 w-3.5 mt-0.5" /> A unique activation link will be emailed to them. You can also copy it from the list.</p>
              <Button type="submit" disabled={creating} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="member-create-button">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Send Invite"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Members */}
      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {members.length === 0 && <p className="text-slate-400 text-sm col-span-full text-center py-10">No team members yet. Add your first member above.</p>}
          {members.map((m) => (
            <Card key={m.id} className="p-5" data-testid={`member-card-${m.id}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-heading font-semibold text-slate-900">{m.name}</p>
                  <p className="text-xs text-slate-500">{m.email}</p>
                </div>
                {m.status === "active" ? (() => {
                  const s = stateOf(m);
                  const cfg = STATE[s];
                  return (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.cls} ${cfg.flash ? "cb-flash" : ""}`}
                      data-testid={`member-status-${s}-${m.id}`}>
                      <Circle className={`h-2 w-2 fill-current ${cfg.dot}`} />
                      {cfg.label}
                    </span>
                  );
                })() : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200" data-testid={`member-status-invited-${m.id}`}>Invited</span>
                )}
              </div>

              {m.status === "active" && (
                <div className="mt-3 text-[11px] text-slate-400 space-y-0.5 border-t border-slate-100 pt-2">
                  <p data-testid={`member-login-${m.id}`}>🟢 Logged in: <span className="text-slate-600">{fmt(m.last_login)}</span></p>
                  <p data-testid={`member-logout-${m.id}`}>⚪ Logged off: <span className="text-slate-600">{fmt(m.last_logout)}</span></p>
                  <p>Last active: <span className="text-slate-600">{fmt(m.last_seen)}</span></p>
                </div>
              )}

              {m.status === "invited" && m.invite_token && (
                <div className="mt-3 flex items-center gap-2 bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <Link2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-500 truncate flex-1">{inviteUrl(m.invite_token)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyLink(m.invite_token)} data-testid={`copy-invite-${m.id}`}><Copy className="h-3 w-3" /></Button>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => regenerate(m)} data-testid={`regen-invite-${m.id}`}><RefreshCw className="h-3.5 w-3.5 mr-1" /> New link</Button>
                <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto" onClick={() => remove(m)} data-testid={`delete-member-${m.id}`}><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Feature upgrade */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-5 w-5 text-orange-500" />
          <h3 className="font-heading text-lg font-semibold text-slate-900">Feature Access & Upgrades</h3>
        </div>
        <Card className="p-5">
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1">
            {Object.keys(FEATURE_LABELS).map((key) => (
              <div key={key} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                <span className="text-sm text-slate-700">{FEATURE_LABELS[key]}</span>
                <Switch checked={features?.[key] !== false} onCheckedChange={(v) => toggleFeature(key, v)} data-testid={`feature-toggle-${key}`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">Turn modules on or off for your whole team. Changes apply instantly.</p>
        </Card>
      </div>
    </div>
  );
}
