import { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { FlaskConical, Loader2 } from "lucide-react";
import { AUTH } from "@/constants/testIds";
import { formatApiErrorDetail } from "@/lib/api";

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";
  const [email, setEmail] = useState("edesioalexandre13@gmail.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  if (user) {
    navigate(from, { replace: true });
  }

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Bem-vindo!");
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Erro ao entrar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50">
      <div className="hidden lg:block relative">
        <img
          src="https://images.unsplash.com/photo-1504307651254-35680f356dfd?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzh8MHwxfHNlYXJjaHwxfHxjb25zdHJ1Y3Rpb24lMjBzaXRlJTIwYnVpbGRpbmclMjBlbmdpbmVlcmluZ3xlbnwwfHx8fDE3OTAwNzI4NzV8MA&ixlib=rb-4.1.0&q=85"
          alt="Concreto laboratório"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/85 via-slate-900/70 to-sky-900/60 flex flex-col justify-between p-10 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-sky-500/20 border border-sky-400/40 flex items-center justify-center">
              <FlaskConical className="w-6 h-6 text-sky-300" />
            </div>
            <div className="font-display font-bold text-2xl tracking-tight">LabControl</div>
          </div>
          <div className="max-w-sm">
            <h1 className="font-display text-4xl font-bold leading-tight mb-3">
              Seu laboratório,<br />mais eficiente.
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              Controle tecnológico de concreto e solos — obras, corpos de prova, rupturas, equipamentos e relatórios em um só lugar.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-lg border-slate-200">
          <div className="mb-6">
            <h2 className="font-display text-2xl font-bold text-slate-900">Bem-vindo!</h2>
            <p className="text-sm text-slate-500 mt-1">Faça login para acessar o sistema.</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@empresa.com"
                data-testid={AUTH.loginEmail}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid={AUTH.loginPassword}
                className="mt-1.5"
              />
            </div>
            <div className="flex justify-between items-center text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" className="rounded border-slate-300" />
                Lembrar-me
              </label>
              <Link
                to="/forgot-password"
                data-testid={AUTH.loginForgot}
                className="text-sky-600 hover:text-sky-700 font-medium"
              >
                Recuperar senha
              </Link>
            </div>
            <Button
              type="submit"
              disabled={loading}
              data-testid={AUTH.loginSubmit}
              className="w-full h-11 bg-sky-600 hover:bg-sky-700 text-white font-semibold"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Entrar"}
            </Button>
            <div className="text-[11px] text-slate-400 text-center pt-2">
              Demo: <span className="font-mono">edesioalexandre13@gmail.com</span> / <span className="font-mono">admin123</span>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
