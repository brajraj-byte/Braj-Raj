import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Sparkles, Loader2, Target, Mail, Phone, MapPin, Calendar, Trash2, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import DailyHrLeads from "@/components/DailyHrLeads";
import AdminDailyLeads from "@/components/AdminDailyLeads";
import { useAuth } from "@/context/AuthContext";

const STATUS = { new: "bg-blue-50 text-blue-700 border-blue-200", contacted: "bg-amber-50 text-amber-700 border-amber-200", followup: "bg-purple-50 text-purple-700 border-purple-200", closed: "bg-emerald-50 text-emerald-700 border-emerald-200" };
const empty = { company: "", source_type: "manual", source_value: "", hr_contact: "", hr_email: "", hr_mobile: "", vacancy: "", location: "", status: "new", next_followup: "", notes: "" };

export default function BusinessDevelopment({ features }) {
  const { user } = useAuth();
  const [leads, setLeads] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiForm, setAiForm] = useState({ company: "", linkedin_url: "", email: "" });
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(() => { api.get("/bd").then(({ data }) => setLeads(data)); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try { await api.post("/bd", form); toast.success("Lead added"); setOpen(false); setForm(empty); load(); }
    catch (ex) { toast.error(apiError(ex)); }
  };
  const remove = async (id) => { if (!window.confirm("Delete lead?")) return; await api.delete(`/bd/${id}`); load(); };
  const updateStatus = async (lead, status) => { await api.put(`/bd/${lead.id}`, { ...lead, status }); load(); };

  const runAi = async () => {
    setAiLoading(true); setAiResult(null);
    try { const { data } = await api.post("/bd/suggest", aiForm); setAiResult(data); }
    catch (ex) { toast.error(apiError(ex)); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Business Development</h2>
          <p className="text-sm text-slate-500">Track hiring leads & HR contacts · {leads.length} active</p>
        </div>
        <div className="flex gap-2">
          {features?.ai_bd_suggestions !== false && (
            <Dialog open={aiOpen} onOpenChange={setAiOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold" data-testid="ai-suggest-button">
                  <Sparkles className="h-4 w-4 mr-1.5" /> AI HR Suggestions
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg" data-testid="ai-suggest-dialog">
                <DialogHeader><DialogTitle className="font-heading flex items-center gap-2"><Lightbulb className="h-5 w-5 text-orange-500" /> AI HR Contact Suggestions</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-2"><Label>Company name *</Label><Input value={aiForm.company} onChange={(e) => setAiForm({ ...aiForm, company: e.target.value })} data-testid="ai-company-input" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>LinkedIn URL</Label><Input value={aiForm.linkedin_url} onChange={(e) => setAiForm({ ...aiForm, linkedin_url: e.target.value })} /></div>
                    <div className="space-y-2"><Label>Email / domain</Label><Input value={aiForm.email} onChange={(e) => setAiForm({ ...aiForm, email: e.target.value })} /></div>
                  </div>
                  <Button onClick={runAi} disabled={!aiForm.company || aiLoading} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="ai-run-button">
                    {aiLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generating…</> : "Generate suggestions"}
                  </Button>
                  {aiResult && (
                    <div className="space-y-2 pt-2">
                      {(aiResult.suggestions || []).map((s, i) => (
                        <div key={i} className="border border-orange-100 bg-orange-50/50 rounded-lg p-3" data-testid={`ai-suggestion-${i}`}>
                          <p className="font-semibold text-slate-900 text-sm">{s.title}</p>
                          {s.likely_email_pattern && <p className="text-xs text-slate-500 mt-0.5">Email pattern: <span className="font-mono">{s.likely_email_pattern}</span></p>}
                          {s.outreach_tip && <p className="text-xs text-slate-600 mt-1">{s.outreach_tip}</p>}
                        </div>
                      ))}
                      {aiResult.note && <p className="text-xs text-slate-400 italic">{aiResult.note}</p>}
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={() => setForm(empty)} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="add-lead-button"><Plus className="h-4 w-4 mr-1.5" /> Add Lead</Button></DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[88vh] overflow-y-auto" data-testid="lead-dialog">
              <DialogHeader><DialogTitle className="font-heading">Add BD Lead</DialogTitle></DialogHeader>
              <form onSubmit={save} className="space-y-3">
                <div className="space-y-2"><Label>Company *</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} required data-testid="lead-company-input" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Source</Label>
                    <Select value={form.source_type} onValueChange={(v) => setForm({ ...form, source_type: v })}>
                      <SelectTrigger data-testid="lead-source-select"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="manual">Manual</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="linkedin">LinkedIn</SelectItem></SelectContent>
                    </Select></div>
                  <div className="space-y-2"><Label>Source value</Label><Input value={form.source_value} onChange={(e) => setForm({ ...form, source_value: e.target.value })} placeholder="url / email" /></div>
                </div>
                <div className="space-y-2"><Label>Vacancy / Role</Label><Input value={form.vacancy} onChange={(e) => setForm({ ...form, vacancy: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>HR Contact</Label><Input value={form.hr_contact} onChange={(e) => setForm({ ...form, hr_contact: e.target.value })} /></div>
                  <div className="space-y-2"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>HR Email</Label><Input value={form.hr_email} onChange={(e) => setForm({ ...form, hr_email: e.target.value })} /></div>
                  <div className="space-y-2"><Label>HR Mobile</Label><Input value={form.hr_mobile} onChange={(e) => setForm({ ...form, hr_mobile: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="followup">Follow-up</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
                    </Select></div>
                  <div className="space-y-2"><Label>Next follow-up</Label><Input type="date" value={form.next_followup} onChange={(e) => setForm({ ...form, next_followup: e.target.value })} /></div>
                </div>
                <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="lead-save-button">Add Lead</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <DailyHrLeads onTracked={load} />

      {user?.role === "admin" && <AdminDailyLeads />}

      {leads.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No BD leads yet. Add a lead or generate AI HR suggestions.</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          {leads.map((l) => (
            <Card key={l.id} className="p-5" data-testid={`lead-card-${l.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center"><Target className="h-5 w-5 text-orange-600" /></div>
                  <div><p className="font-heading font-semibold text-slate-900">{l.company}</p><p className="text-xs text-slate-500">{l.vacancy || "—"}{l.location ? ` · ${l.location}` : ""}</p></div>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(l.id)} data-testid={`lead-delete-${l.id}`}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {l.hr_contact && <p className="font-medium text-slate-700">{l.hr_contact}</p>}
                {l.hr_email && <a href={`mailto:${l.hr_email}`} className="flex items-center gap-2 hover:text-orange-600"><Mail className="h-3.5 w-3.5" />{l.hr_email}</a>}
                {l.hr_mobile && <a href={`tel:${l.hr_mobile}`} className="flex items-center gap-2 hover:text-orange-600"><Phone className="h-3.5 w-3.5" />{l.hr_mobile}</a>}
                {l.next_followup && <p className="flex items-center gap-2 text-slate-500"><Calendar className="h-3.5 w-3.5" />Follow-up: {l.next_followup}</p>}
                {l.notes && <p className="text-xs text-slate-500 pt-1">{l.notes}</p>}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Select value={l.status} onValueChange={(v) => updateStatus(l, v)}>
                  <SelectTrigger className="h-7 w-auto border-none p-0 gap-1.5" data-testid={`lead-status-${l.id}`}>
                    <Badge variant="outline" className={STATUS[l.status]}>{l.status}</Badge>
                  </SelectTrigger>
                  <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="contacted">Contacted</SelectItem><SelectItem value="followup">Follow-up</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
                </Select>
                <span className="text-xs text-slate-400">by {l.created_by}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
