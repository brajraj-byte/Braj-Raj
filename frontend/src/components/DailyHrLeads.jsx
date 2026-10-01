import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Linkedin, Search, Phone, Mail, RefreshCw, Loader2, Plus, Sun, Building2, Info } from "lucide-react";
import { toast } from "sonner";

export default function DailyHrLeads({ onTracked }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [industry, setIndustry] = useState("");
  const [city, setCity] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/bd/daily");
      setData(data);
      setIndustry(data.industry || "");
      setCity(data.city || "");
    } catch (ex) { toast.error(apiError(ex)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { data } = await api.post("/bd/daily/refresh", { industry, city });
      setData(data);
      toast.success("Today's HR leads refreshed");
    } catch (ex) { toast.error(apiError(ex)); }
    finally { setRefreshing(false); }
  };

  const track = async (l) => {
    try {
      await api.post("/bd", {
        company: l.company, source_type: "linkedin", source_value: l.linkedin_search_url,
        hr_contact: l.hr_name, hr_email: l.likely_email, hr_mobile: "", vacancy: l.title,
        location: l.city, status: "new", notes: l.note,
      });
      toast.success(`${l.company} added to your leads`);
      onTracked?.();
    } catch (ex) { toast.error(apiError(ex)); }
  };

  const leads = data?.leads || [];

  return (
    <Card className="p-5 border-orange-100 bg-gradient-to-br from-orange-50/60 to-white" data-testid="daily-hr-leads">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center"><Sun className="h-5 w-5 text-orange-600" /></div>
          <div>
            <h3 className="font-heading font-bold text-slate-900">Today's HR Leads</h3>
            <p className="text-xs text-slate-500">3 daily prospects with LinkedIn & Google search links{data?.date ? ` · ${data.date}` : ""}</p>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <div className="hidden sm:block">
            <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Industry (optional)" className="h-9 w-40" data-testid="daily-industry-input" />
          </div>
          <div className="hidden sm:block">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City (optional)" className="h-9 w-32" data-testid="daily-city-input" />
          </div>
          <Button onClick={refresh} disabled={refreshing} variant="outline" className="h-9" data-testid="refresh-daily-leads-button">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1.5" /> Refresh</>}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-1.5 mt-3 text-[11px] text-slate-400">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>Names & emails are AI-suggested prospects — open the LinkedIn / Google links to verify the real person and find their number before outreach.</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : leads.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">No leads yet — tap Refresh to generate today's prospects.</div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          {leads.map((l, i) => (
            <div key={`${l.company}-${i}`} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col" data-testid={`daily-lead-${i}`}>
              <div className="flex items-center gap-2 mb-1">
                <Building2 className="h-4 w-4 text-orange-500" />
                <span className="font-semibold text-slate-900 text-sm">{l.company}</span>
              </div>
              <p className="text-sm text-slate-700 font-medium">{l.hr_name || "HR contact"}</p>
              <p className="text-xs text-slate-500">{l.title}{l.city ? ` · ${l.city}` : ""}</p>
              {l.industry && <Badge variant="secondary" className="bg-orange-50 text-orange-700 border border-orange-100 w-fit mt-2 text-[11px]">{l.industry}</Badge>}
              {l.likely_email && <p className="text-xs text-slate-500 mt-2 flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{l.likely_email}</span></p>}
              {l.note && <p className="text-xs text-slate-400 mt-2 flex-1">{l.note}</p>}
              <div className="grid grid-cols-3 gap-1.5 mt-3">
                <a href={l.linkedin_search_url} target="_blank" rel="noreferrer" data-testid={`daily-lead-linkedin-${i}`}>
                  <Button size="sm" variant="outline" className="w-full h-8 px-0 text-[#0A66C2] border-[#0A66C2]/30 hover:bg-[#0A66C2]/5"><Linkedin className="h-3.5 w-3.5" /></Button>
                </a>
                <a href={l.google_search_url} target="_blank" rel="noreferrer" data-testid={`daily-lead-google-${i}`}>
                  <Button size="sm" variant="outline" className="w-full h-8 px-0"><Search className="h-3.5 w-3.5" /></Button>
                </a>
                <a href={l.mobile_search_url} target="_blank" rel="noreferrer" data-testid={`daily-lead-phone-${i}`}>
                  <Button size="sm" variant="outline" className="w-full h-8 px-0"><Phone className="h-3.5 w-3.5" /></Button>
                </a>
              </div>
              <Button size="sm" onClick={() => track(l)} className="w-full mt-2 bg-orange-600 hover:bg-orange-700 text-white h-8" data-testid={`daily-lead-track-${i}`}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Track Lead
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
