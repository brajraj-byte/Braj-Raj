import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Users, Loader2, Linkedin, Search, Phone, Mail, Shield } from "lucide-react";

export default function AdminDailyLeads() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get("/bd/daily/all").then(({ data }) => setRows(data)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <Card className="p-5 border-slate-200" data-testid="admin-daily-leads">
      <div className="flex items-center gap-2 mb-1">
        <div className="h-9 w-9 rounded-lg bg-slate-900 flex items-center justify-center"><Shield className="h-5 w-5 text-white" /></div>
        <div>
          <h3 className="font-heading font-bold text-slate-900">Team Daily Leads <span className="text-xs font-normal text-slate-400">(admin)</span></h3>
          <p className="text-xs text-slate-500">Every team member's daily HR leads, across all days.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm">No daily leads generated for any member yet.</div>
      ) : (
        <Accordion type="multiple" className="mt-3">
          {rows.map((r, idx) => (
            <AccordionItem key={`${r.user_id}-${r.date}`} value={`${r.user_id}-${r.date}-${idx}`} data-testid={`admin-daily-group-${idx}`}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 text-left">
                  <Users className="h-4 w-4 text-orange-500" />
                  <div>
                    <span className="font-semibold text-slate-900 text-sm">{r.user_name}</span>
                    <span className="text-xs text-slate-400 ml-2">{r.date}</span>
                  </div>
                  <Badge variant="secondary" className="bg-slate-100 text-slate-600 ml-1">{r.leads.length} leads</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid md:grid-cols-3 gap-3 pt-1">
                  {r.leads.map((l, i) => (
                    <div key={i} className="border border-slate-200 rounded-lg p-3">
                      <p className="font-semibold text-slate-900 text-sm">{l.company}</p>
                      <p className="text-sm text-slate-700">{l.hr_name || "HR contact"}</p>
                      <p className="text-xs text-slate-500">{l.title}{l.city ? ` · ${l.city}` : ""}</p>
                      {l.likely_email && <p className="text-xs text-slate-500 mt-1 flex items-center gap-1 truncate"><Mail className="h-3 w-3" /><span className="truncate">{l.likely_email}</span></p>}
                      <div className="grid grid-cols-3 gap-1.5 mt-2">
                        <a href={l.linkedin_search_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="w-full h-7 px-0 text-[#0A66C2]"><Linkedin className="h-3.5 w-3.5" /></Button></a>
                        <a href={l.google_search_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="w-full h-7 px-0"><Search className="h-3.5 w-3.5" /></Button></a>
                        <a href={l.mobile_search_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="w-full h-7 px-0"><Phone className="h-3.5 w-3.5" /></Button></a>
                      </div>
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </Card>
  );
}
