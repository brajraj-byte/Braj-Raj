import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Save, Trash2, ListChecks, Users } from "lucide-react";
import { toast } from "sonner";

const FIELDS = [
  ["date", "Date", "date", "w-36"],
  ["candidate_name", "Candidate Name", "text", "w-44"],
  ["age", "Age", "text", "w-16"],
  ["email", "Email", "text", "w-52"],
  ["total_experience", "Total Exp (yrs)", "text", "w-28"],
  ["organisation", "Organisation", "text", "w-44"],
  ["job_title", "Job Title", "text", "w-44"],
  ["present_location", "Present Location", "text", "w-40"],
  ["present_ctc", "Present CTC", "text", "w-28"],
  ["notice_period", "Notice Period", "text", "w-32"],
];

const blankRow = () => ({
  _new: true, _tmp: Date.now() + Math.random(), date: new Date().toISOString().slice(0, 10),
  candidate_name: "", age: "", email: "", total_experience: "", organisation: "",
  job_title: "", present_location: "", present_ctc: "", notice_period: "",
});

export default function JobTracking() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState([]);
  const [dateFilter, setDateFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/job-tracking", { params: dateFilter ? { date: dateFilter } : {} });
      setRows(data);
    } finally { setLoading(false); }
  }, [dateFilter]);
  useEffect(() => { load(); }, [load]);

  const key = (r) => r.id || r._tmp;
  const addRow = () => setRows((prev) => [blankRow(), ...prev]);
  const setField = (k, field, val) => setRows((prev) => prev.map((r) => (key(r) === k ? { ...r, [field]: val } : r)));

  const payloadOf = (r) => ({
    date: r.date, candidate_name: r.candidate_name, age: r.age, email: r.email,
    total_experience: r.total_experience, organisation: r.organisation, job_title: r.job_title,
    present_location: r.present_location, present_ctc: r.present_ctc, notice_period: r.notice_period,
  });

  const saveRow = async (r) => {
    if (!r.candidate_name?.trim()) return toast.error("Candidate name is required");
    setSavingId(key(r));
    try {
      if (r._new) {
        const { data } = await api.post("/job-tracking", payloadOf(r));
        setRows((prev) => prev.map((x) => (key(x) === key(r) ? data : x)));
      } else {
        await api.put(`/job-tracking/${r.id}`, payloadOf(r));
      }
      toast.success("Saved");
    } catch (ex) { toast.error(apiError(ex)); }
    finally { setSavingId(null); }
  };

  const deleteRow = async (r) => {
    if (r._new) return setRows((prev) => prev.filter((x) => key(x) !== key(r)));
    if (!window.confirm("Delete this entry?")) return;
    try {
      await api.delete(`/job-tracking/${r.id}`);
      setRows((prev) => prev.filter((x) => key(x) !== key(r)));
      toast.success("Deleted");
    } catch (ex) { toast.error(apiError(ex)); }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ListChecks className="h-6 w-6 text-orange-600" /> Job Tracking Sheet
          </h2>
          <p className="text-sm text-slate-500">
            {isAdmin ? "Every team member's tracking sheet — filter by any day." : "Your personal daily candidate tracker. Click Save on a row to store it."}
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Filter by date</label>
            <Input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} className="h-9 w-40" data-testid="jobtrack-date-filter" />
          </div>
          {!isAdmin && (
            <Button onClick={addRow} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold h-9" data-testid="jobtrack-add-row">
              <Plus className="h-4 w-4 mr-1.5" /> Add Row
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm" data-testid="jobtrack-empty">
          {isAdmin ? "No tracking entries from any member yet." : "No entries yet. Tap \u201cAdd Row\u201d to start your tracker."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="text-sm" data-testid="jobtrack-table">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                {isAdmin && <th className="text-left font-semibold py-3 px-3"><Users className="h-3.5 w-3.5 inline mr-1" />User</th>}
                {FIELDS.map(([f, label]) => <th key={f} className="text-left font-semibold py-3 px-3 whitespace-nowrap">{label}</th>)}
                <th className="text-right font-semibold py-3 px-3 sticky right-0 bg-slate-50">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={key(r)} className="border-t border-slate-100" data-testid={`jobtrack-row-${key(r)}`}>
                  {isAdmin && <td className="py-2 px-3 whitespace-nowrap font-medium text-slate-700">{r.user_name || "—"}</td>}
                  {FIELDS.map(([f, , type, w]) => (
                    <td key={f} className="py-2 px-2">
                      <Input type={type} value={r[f] || ""} disabled={isAdmin}
                        onChange={(e) => setField(key(r), f, e.target.value)}
                        className={`h-9 ${w} ${isAdmin ? "border-transparent bg-transparent disabled:opacity-100" : ""}`}
                        data-testid={`jobtrack-${f}-${key(r)}`} />
                    </td>
                  ))}
                  <td className="py-2 px-3 text-right whitespace-nowrap sticky right-0 bg-white">
                    {isAdmin ? (
                      <span className="text-xs text-slate-300">read-only</span>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" onClick={() => saveRow(r)} disabled={savingId === key(r)} className="bg-orange-600 hover:bg-orange-700 text-white h-8" data-testid={`jobtrack-save-${key(r)}`}>
                          {savingId === key(r) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50 h-8" onClick={() => deleteRow(r)} data-testid={`jobtrack-delete-${key(r)}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
