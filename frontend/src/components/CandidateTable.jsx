import { useState, useEffect } from "react";
import { fileUrl, api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import CandidateDetailDialog from "@/components/CandidateDetailDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, User, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function CandidateTable({ candidates, emptyText = "No candidates yet.", onChanged }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(candidates || []);

  useEffect(() => { setRows(candidates || []); }, [candidates]);

  const remove = async (c) => {
    if (!window.confirm(`Delete ${c.name || "this candidate"} from the database? This cannot be undone.`)) return;
    try {
      await api.delete(`/resumes/${c.id}`);
      setRows((prev) => prev.filter((r) => r.id !== c.id));
      toast.success("Candidate deleted");
      onChanged?.();
    } catch (ex) { toast.error(apiError(ex)); }
  };

  if (!rows || rows.length === 0)
    return <div className="text-center py-16 text-slate-400 text-sm" data-testid="candidate-table-empty">{emptyText}</div>;

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" data-testid="candidate-table">
          <thead>
            <tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
              <th className="text-left font-semibold py-3 px-4">Candidate</th>
              <th className="text-left font-semibold py-3 px-4 hidden md:table-cell">Designation</th>
              <th className="text-left font-semibold py-3 px-4 hidden lg:table-cell">Company</th>
              <th className="text-left font-semibold py-3 px-4 hidden lg:table-cell">City</th>
              <th className="text-left font-semibold py-3 px-4 hidden xl:table-cell">CTC</th>
              <th className="text-left font-semibold py-3 px-4 hidden xl:table-cell">Parsed By</th>
              <th className="text-right font-semibold py-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-slate-100 hover:bg-orange-50/40 transition-colors" data-testid={`candidate-row-${c.id}`}>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg overflow-hidden bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                      {c.photo_path ? <img src={fileUrl(c.photo_path)} alt="" className="h-full w-full object-cover" /> : <User className="h-4 w-4 text-orange-300" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                        {c.name || "Unknown"}
                        {c.is_duplicate && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5 shrink-0" title={`Possible duplicate of ${c.duplicate_name || "existing candidate"}`}>DUP</span>}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{c.email || c.mobile_number || "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-4 hidden md:table-cell text-slate-600">{c.designation || "—"}</td>
                <td className="py-3 px-4 hidden lg:table-cell text-slate-600">{c.present_company || "—"}</td>
                <td className="py-3 px-4 hidden lg:table-cell text-slate-600">{c.city || "—"}</td>
                <td className="py-3 px-4 hidden xl:table-cell text-slate-600">{c.ctc || "—"}</td>
                <td className="py-3 px-4 hidden xl:table-cell">
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-medium">{c.parsed_by_name || "—"}</Badge>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setSelected(c); setOpen(true); }} data-testid={`candidate-view-${c.id}`}>
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    {c.resume_path && (
                      <a href={fileUrl(c.resume_path)} target="_blank" rel="noreferrer" download data-testid={`candidate-download-${c.id}`}>
                        <Button size="sm" className="bg-orange-600 hover:bg-orange-700 text-white"><Download className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                    {isAdmin && (
                      <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => remove(c)} data-testid={`candidate-delete-${c.id}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CandidateDetailDialog candidate={selected} open={open} onOpenChange={setOpen} />
    </>
  );
}
