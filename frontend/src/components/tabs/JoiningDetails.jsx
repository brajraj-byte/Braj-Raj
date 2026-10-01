import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const STATUS = { offered: "bg-amber-50 text-amber-700 border-amber-200", joined: "bg-emerald-50 text-emerald-700 border-emerald-200", dropped: "bg-red-50 text-red-700 border-red-200" };
const empty = { candidate_name: "", client_name: "", designation: "", offered_ctc: "", joining_date: "", status: "offered", notes: "" };

export default function JoiningDetails() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = useCallback(() => { api.get("/joinings").then(({ data }) => setRows(data)); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try { await api.post("/joinings", form); toast.success("Joining record added"); setOpen(false); setForm(empty); load(); }
    catch (ex) { toast.error(apiError(ex)); }
  };
  const remove = async (id) => { if (!window.confirm("Delete record?")) return; await api.delete(`/joinings/${id}`); load(); };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Joining Details</h2>
          <p className="text-sm text-slate-500">{user?.role === "admin" ? "All team placements" : "Your placements (visible to you & admin)"}</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={() => setForm(empty)} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="add-joining-button"><Plus className="h-4 w-4 mr-1.5" /> Add Joining</Button></DialogTrigger>
          <DialogContent className="sm:max-w-lg" data-testid="joining-dialog">
            <DialogHeader><DialogTitle className="font-heading">Add Joining Details</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div className="space-y-2"><Label>Candidate Name *</Label><Input value={form.candidate_name} onChange={(e) => setForm({ ...form, candidate_name: e.target.value })} required data-testid="joining-candidate-input" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Client / Company</Label><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></div>
                <div className="space-y-2"><Label>Designation</Label><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Offered CTC</Label><Input value={form.offered_ctc} onChange={(e) => setForm({ ...form, offered_ctc: e.target.value })} /></div>
                <div className="space-y-2"><Label>Joining Date</Label><Input type="date" value={form.joining_date} onChange={(e) => setForm({ ...form, joining_date: e.target.value })} /></div>
              </div>
              <div className="space-y-2"><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="joining-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="offered">Offered</SelectItem><SelectItem value="joined">Joined</SelectItem><SelectItem value="dropped">Dropped</SelectItem></SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="joining-save-button">Add Record</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No joining records yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm" data-testid="joining-table">
            <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <th className="text-left font-semibold py-3 px-4">Candidate</th>
              <th className="text-left font-semibold py-3 px-4 hidden md:table-cell">Client</th>
              <th className="text-left font-semibold py-3 px-4 hidden lg:table-cell">Designation</th>
              <th className="text-left font-semibold py-3 px-4 hidden lg:table-cell">CTC</th>
              <th className="text-left font-semibold py-3 px-4">Joining</th>
              <th className="text-left font-semibold py-3 px-4">Status</th>
              {user?.role === "admin" && <th className="text-left font-semibold py-3 px-4 hidden xl:table-cell">Recruiter</th>}
              <th className="text-right font-semibold py-3 px-4"></th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-orange-50/40" data-testid={`joining-row-${r.id}`}>
                  <td className="py-3 px-4 font-semibold text-slate-900">{r.candidate_name}</td>
                  <td className="py-3 px-4 hidden md:table-cell text-slate-600">{r.client_name || "—"}</td>
                  <td className="py-3 px-4 hidden lg:table-cell text-slate-600">{r.designation || "—"}</td>
                  <td className="py-3 px-4 hidden lg:table-cell text-slate-600">{r.offered_ctc || "—"}</td>
                  <td className="py-3 px-4 text-slate-600">{r.joining_date || "—"}</td>
                  <td className="py-3 px-4"><Badge variant="outline" className={STATUS[r.status]}>{r.status}</Badge></td>
                  {user?.role === "admin" && <td className="py-3 px-4 hidden xl:table-cell text-slate-500 text-xs">{r.created_by}</td>}
                  <td className="py-3 px-4 text-right"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(r.id)} data-testid={`joining-delete-${r.id}`}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
