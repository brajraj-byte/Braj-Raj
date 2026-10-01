import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck } from "lucide-react";
import { apiError } from "@/lib/api";
import { GoogleButton } from "@/components/GoogleButton";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (ex) {
      setErr(apiError(ex));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-orange-600 to-amber-500 text-white relative overflow-hidden">
        <div className="relative z-10">
          <Logo showTagline={false} />
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="font-heading text-4xl font-extrabold leading-tight">
            Recruitment, intervened powerfully.
          </h1>
          <p className="text-orange-50 text-base max-w-md">
            Parse resumes with AI, build a shared candidate database, track clients, business
            development and joinings — all in one elegant console.
          </p>
        </div>
        <div className="absolute -right-20 -bottom-20 w-96 h-96 rounded-full bg-white/10" />
        <div className="absolute right-20 top-10 w-40 h-40 rounded-full bg-white/10" />
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6 animate-fade-up" data-testid="login-form">
          <div className="lg:hidden mb-4"><Logo /></div>
          <div>
            <h2 className="font-heading text-2xl font-bold text-slate-900">Welcome back</h2>
            <p className="text-sm text-slate-500 mt-1">Sign in to your Career Buddha console.</p>
          </div>

          {err && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="login-error">
              {err}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com" required data-testid="login-email-input" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" required data-testid="login-password-input" />
          </div>

          <Button type="submit" disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold h-11"
            data-testid="login-submit-button">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-xs text-slate-400">or</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <GoogleButton />

          <div className="flex items-center gap-2 text-xs text-slate-400 pt-2">
            <ShieldCheck className="h-3.5 w-3.5" /> Secure access · Team members use their invite link
          </div>
        </form>
      </div>
    </div>
  );
}
