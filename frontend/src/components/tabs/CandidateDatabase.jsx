import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import CandidateTable from "@/components/CandidateTable";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";

export default function CandidateDatabase() {
  const [q, setQ] = useState("");
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (query) => {
    setLoading(true);
    try {
      const { data } = await api.get("/resumes", { params: query ? { q: query } : {} });
      setData(data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(""); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold text-slate-900">Candidate Database</h2>
          <p className="text-sm text-slate-500">{data.length} candidates · shared across the whole team</p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, skill, company, city…"
            className="pl-9" data-testid="candidate-search-input" />
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : (
        <CandidateTable candidates={data} emptyText="No candidates match your search." />
      )}
    </div>
  );
}
