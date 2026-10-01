import { useState } from "react";
import { api } from "@/lib/api";
import CandidateTable from "@/components/CandidateTable";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, X } from "lucide-react";

const FIELDS = [
  ["name", "Name"], ["mobile", "Mobile Number"], ["email", "Email"], ["city", "City"],
  ["industry", "Industry"], ["present_company", "Present Company"], ["designation", "Designation"],
  ["preferred_location", "Preferred Location"], ["qualification", "Highest Qualification"],
  ["skill", "Skill Set"], ["notice_period", "Notice Period"],
];

export default function SearchTab() {
  const [form, setForm] = useState({});
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (e) => {
    e?.preventDefault();
    setLoading(true);
    const params = Object.fromEntries(Object.entries(form).filter(([, v]) => v && v.trim()));
    try { const { data } = await api.get("/resumes", { params }); setResults(data); }
    finally { setLoading(false); }
  };
  const clear = () => { setForm({}); setResults(null); };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Advanced Search</h2>
        <p className="text-sm text-slate-500">Search the shared resume database across any criteria and download resumes.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={run} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FIELDS.map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <Label className="text-xs">{label}</Label>
              <Input value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                placeholder={`Any ${label.toLowerCase()}`} data-testid={`search-${key}-input`} />
            </div>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={loading} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="run-search-button">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Search className="h-4 w-4 mr-1.5" /> Search</>}
            </Button>
            <Button type="button" variant="outline" onClick={clear} data-testid="clear-search-button"><X className="h-4 w-4 mr-1.5" /> Clear</Button>
          </div>
        </form>
      </Card>

      {results !== null && (
        <div>
          <h3 className="font-heading text-lg font-semibold text-slate-900 mb-3">{results.length} result{results.length !== 1 ? "s" : ""}</h3>
          <CandidateTable candidates={results} emptyText="No candidates match these criteria." />
        </div>
      )}
    </div>
  );
}
