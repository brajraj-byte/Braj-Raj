import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, PartyPopper } from "lucide-react";

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { acceptInvite } = useAuth();
  const [invite, setInvite] = useState(null);
  const [status, setStatus] = useState("loading");
  const [form, setForm] = useState({ password: "", confirm: "", date_of_birth: "", work_anniversary: "", mobile: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/auth/invite/${token}`)
      .then(({ data }) => { setInvite(data); setStatus("ok"); })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (form.password.length < 6) return setErr("Password must be at least 6 characters");
    if (form.password !== form.confirm) return setErr("Passwords do not match");
    setSaving(true);
    try {
      await acceptInvite({
        token, password: form.password, date_of_birth: form.date_of_birth,
        work_anniversary: form.work_anniversary, mobile: form.mobile,
      });
      navigate("/");
    } catch (ex) {
      setErr(apiError(ex));
    } finally {
      setSaving(false);
    }
  };

  if (status === "loading")
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-orange-600" /></div>;

  if (status === "invalid")
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div className="max-w-sm space-y-3">
          <Logo />
          <h2 className="font-heading text-xl font-bold text-slate-900 pt-4">Invite not valid</h2>
          <p className="text-sm text-slate-500">This invite link is invalid or has already been used. Please ask your admin for a new one.</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-orange-50 to-white">
      <form onSubmit={submit} className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-5 animate-fade-up" data-testid="accept-invite-form">
        <Logo />
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-100 rounded-lg p-3">
          <PartyPopper className="h-5 w-5 text-orange-600 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-900">Welcome, {invite?.name}!</p>
            <p className="text-xs text-slate-500">Set up your account for {invite?.email}</p>
          </div>
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2 col-span-2">
            <Label>Create password</Label>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required data-testid="invite-password-input" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Confirm password</Label>
            <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required data-testid="invite-confirm-input" />
          </div>
          <div className="space-y-2">
            <Label>Date of birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} data-testid="invite-dob-input" />
          </div>
          <div className="space-y-2">
            <Label>Work anniversary</Label>
            <Input type="date" value={form.work_anniversary} onChange={(e) => setForm({ ...form, work_anniversary: e.target.value })} data-testid="invite-anniversary-input" />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Mobile (optional)</Label>
            <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} data-testid="invite-mobile-input" />
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold h-11" data-testid="invite-submit-button">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate my account"}
        </Button>
      </form>
    </div>
  );
}
