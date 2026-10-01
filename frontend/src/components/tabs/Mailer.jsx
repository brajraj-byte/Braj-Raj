import { useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Send, Loader2, Info } from "lucide-react";
import { toast } from "sonner";

export default function Mailer() {
  const { user } = useAuth();
  const [form, setForm] = useState({ to: "", subject: "", body: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);

  const load = useCallback(() => { api.get("/mail/sent").then(({ data }) => setSent(data)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const send = async (e) => {
    e.preventDefault();
    if (!form.to.trim() || !form.body.trim()) return toast.error("Recipient and message are required");
    setSending(true);
    try {
      await api.post("/mail/send", form);
      toast.success(`Email sent to ${form.to}`);
      setForm({ to: "", subject: "", body: "" });
      load();
    } catch (ex) { toast.error(apiError(ex)); }
    finally { setSending(false); }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <div>
        <h2 className="font-heading text-2xl font-bold text-slate-900">Send Mail</h2>
        <p className="text-sm text-slate-500">Email anyone directly from Career Buddha 360 Suite.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={send} className="space-y-4">
          <div className="space-y-2">
            <Label>To (email address)</Label>
            <Input type="email" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} placeholder="recipient@example.com" required data-testid="mail-to-input" />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" data-testid="mail-subject-input" />
          </div>
          <div className="space-y-2">
            <Label>Message</Label>
            <Textarea rows={7} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write your message…" required data-testid="mail-body-input" />
          </div>
          <div className="flex items-start gap-1.5 text-[11px] text-slate-400">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>Replies come straight to your login email <span className="font-medium text-slate-600">{user?.email}</span>, so the recipient can respond to you directly.</span>
          </div>
          <Button type="submit" disabled={sending} className="bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="mail-send-button">
            {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</> : <><Send className="h-4 w-4 mr-2" /> Send Email</>}
          </Button>
        </form>
      </Card>

      <div>
        <h3 className="font-heading text-lg font-semibold text-slate-900 mb-3">Sent by you</h3>
        {sent.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">No emails sent yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm" data-testid="mail-sent-table">
              <thead><tr className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
                <th className="text-left font-semibold py-3 px-4">To</th>
                <th className="text-left font-semibold py-3 px-4">Subject</th>
                <th className="text-left font-semibold py-3 px-4 hidden sm:table-cell">When</th>
                <th className="text-left font-semibold py-3 px-4">Status</th>
              </tr></thead>
              <tbody>
                {sent.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100" data-testid={`mail-row-${m.id}`}>
                    <td className="py-3 px-4 text-slate-700">{m.to}</td>
                    <td className="py-3 px-4 text-slate-600">{m.subject}</td>
                    <td className="py-3 px-4 text-slate-500 hidden sm:table-cell">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4"><Badge variant="outline" className={m.status === "sent" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>{m.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
