import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, apiError } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ChangePasswordDialog({ open, onOpenChange, forced }) {
  const { refreshMe } = useAuth();
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (form.new_password.length < 6) return setErr("Password must be at least 6 characters");
    if (form.new_password !== form.confirm) return setErr("Passwords do not match");
    setSaving(true);
    try {
      await api.post("/auth/change-password", {
        current_password: forced ? undefined : form.current_password,
        new_password: form.new_password,
      });
      toast.success("Password updated");
      await refreshMe();
      onOpenChange(false);
      setForm({ current_password: "", new_password: "", confirm: "" });
    } catch (ex) {
      setErr(apiError(ex));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={forced ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {forced ? "Set a new password" : "Change password"}
          </DialogTitle>
        </DialogHeader>
        {forced && (
          <p className="text-sm text-slate-500 -mt-2">
            For security, please set your own password before continuing.
          </p>
        )}
        <form onSubmit={submit} className="space-y-4">
          {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</div>}
          {!forced && (
            <div className="space-y-2">
              <Label>Current password</Label>
              <Input type="password" value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })} required data-testid="current-password-input" />
            </div>
          )}
          <div className="space-y-2">
            <Label>New password</Label>
            <Input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} required data-testid="new-password-input" />
          </div>
          <div className="space-y-2">
            <Label>Confirm new password</Label>
            <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required data-testid="confirm-password-input" />
          </div>
          <Button type="submit" disabled={saving} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold" data-testid="change-password-submit">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
