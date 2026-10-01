import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageCircle, X, Send, Circle } from "lucide-react";

const DOT = { online: "text-emerald-500", away: "text-slate-400", dormant: "text-orange-500", offline: "text-slate-300" };

export default function ChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [presence, setPresence] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try { const { data } = await api.get("/chat/messages"); setMessages(data); } catch (e) { /* offline */ }
  }, []);
  const loadPresence = useCallback(async () => {
    try { const { data } = await api.get("/chat/presence"); setPresence(data); } catch (e) { /* offline */ }
  }, []);

  useEffect(() => {
    loadPresence();
    const t = setInterval(loadPresence, 20000);
    return () => clearInterval(t);
  }, [loadPresence]);

  useEffect(() => {
    if (!open) return;
    loadMessages();
    const t = setInterval(loadMessages, 3000);
    return () => clearInterval(t);
  }, [open, loadMessages]);

  useEffect(() => { if (open) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, open]);

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSending(true);
    setText("");
    try { await api.post("/chat/messages", { text: t }); await loadMessages(); }
    catch (ex) { setText(t); }
    finally { setSending(false); }
  };

  const onlineCount = presence.filter((p) => p.state === "online").length;

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} data-testid="chat-toggle-button"
        className="fixed bottom-5 right-5 z-[90] h-14 w-14 rounded-full bg-orange-600 hover:bg-orange-700 text-white shadow-lg flex items-center justify-center transition-transform hover:scale-105">
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        {!open && onlineCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 min-w-[1.25rem] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">{onlineCount}</span>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 z-[90] w-[22rem] max-w-[92vw] h-[32rem] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-fade-up" data-testid="chat-panel">
          <div className="px-4 py-3 bg-orange-600 text-white">
            <p className="font-heading font-bold">Team Chat</p>
            <p className="text-xs text-orange-50 flex items-center gap-1"><Circle className="h-2 w-2 fill-current text-emerald-300" /> {onlineCount} online</p>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 overflow-x-auto">
            {presence.length === 0 && <span className="text-xs text-slate-400">No team members yet</span>}
            {presence.map((p) => (
              <div key={p.id} className="flex items-center gap-1 shrink-0 bg-slate-50 rounded-full pl-1.5 pr-2 py-1" data-testid={`chat-presence-${p.id}`} title={p.state}>
                <Circle className={`h-2 w-2 fill-current ${DOT[p.state]} ${p.state === "dormant" ? "cb-flash" : ""}`} />
                <span className="text-xs text-slate-600 whitespace-nowrap">{p.self ? "You" : p.name}</span>
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50/40">
            {messages.length === 0 && <p className="text-center text-xs text-slate-400 py-8">No messages yet. Say hello 👋</p>}
            {messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`} data-testid={`chat-message-${m.id}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${mine ? "bg-orange-600 text-white rounded-br-sm" : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"}`}>
                    {!mine && <p className="text-[11px] font-semibold text-orange-600 mb-0.5">{m.sender_name}</p>}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>
                    <p className={`text-[10px] mt-0.5 ${mine ? "text-orange-100" : "text-slate-400"}`}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <form onSubmit={send} className="p-2 border-t border-slate-100 flex items-center gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="flex-1" data-testid="chat-input" />
            <Button type="submit" disabled={sending || !text.trim()} className="bg-orange-600 hover:bg-orange-700 text-white h-9 w-9 p-0" data-testid="chat-send-button"><Send className="h-4 w-4" /></Button>
          </form>
        </div>
      )}
    </>
  );
}
