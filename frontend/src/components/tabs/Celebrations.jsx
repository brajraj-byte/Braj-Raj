import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cake, PartyPopper, Loader2, Building2 } from "lucide-react";

const Item = ({ c }) => {
  const isBday = c.type === "Birthday";
  return (
    <Card className={`p-4 border ${c.days_until === 0 ? "border-orange-300 bg-orange-50" : "border-slate-200"}`} data-testid="celebration-card">
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${isBday ? "bg-pink-50 text-pink-500" : "bg-amber-50 text-amber-500"}`}>
          {isBday ? <Cake className="h-5 w-5" /> : <PartyPopper className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900 truncate">{c.name || "Unknown"}</p>
          <p className="text-xs text-slate-500">{c.type} · {c.who}</p>
          {c.present_company && <p className="text-xs text-slate-400 flex items-center gap-1 mt-1"><Building2 className="h-3 w-3" />{c.present_company}</p>}
        </div>
        <div className="text-right shrink-0">
          {c.days_until === 0 ? <Badge className="bg-orange-600 text-white">Today! 🎉</Badge>
            : <span className="text-xs text-slate-500">in {c.days_until}d</span>}
          <p className="text-[11px] text-slate-400 mt-1">{c.date}</p>
        </div>
      </div>
    </Card>
  );
};

export default function Celebrations() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.get("/celebrations").then(({ data }) => setItems(data)).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>;

  const today = items.filter((i) => i.days_until === 0);
  const week = items.filter((i) => i.days_until > 0 && i.days_until <= 7);
  const upcoming = items.filter((i) => i.days_until > 7 && i.days_until < 400);

  const Section = ({ title, list }) => list.length > 0 && (
    <div className="space-y-3">
      <h3 className="font-heading text-lg font-semibold text-slate-900">{title}</h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{list.map((c, i) => <Item key={i} c={c} />)}</div>
    </div>
  );

  return (
    <div className="space-y-8 animate-fade-up">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Celebrations</h2>
        <p className="text-sm text-slate-500">Birthdays & work anniversaries of your team and candidates.</p>
      </div>
      {items.length === 0 ? (
        <div className="text-center py-16 text-slate-400 text-sm">No celebrations yet. They appear as team members join and resumes are parsed with a date of birth.</div>
      ) : (
        <>
          <Section title="🎉 Today" list={today} />
          <Section title="This week" list={week} />
          <Section title="Upcoming" list={upcoming} />
        </>
      )}
    </div>
  );
}
