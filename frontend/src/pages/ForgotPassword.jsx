import { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { AUTH } from "@/constants/testIds";
import { FlaskConical, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [debugLink, setDebugLink] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setSent(true);
      if (data._debug_link) setDebugLink(data._debug_link);
      toast.success("Se o e-mail existir, enviaremos instruções.");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <FlaskConical className="w-6 h-6 text-sky-600" />
          <div className="font-display font-bold text-xl">LabControl</div>
        </div>
        <h2 className="font-display text-2xl font-bold mb-2">Recuperar senha</h2>
        <p className="text-sm text-slate-500 mb-6">
          Informe seu e-mail e enviaremos um link para redefinir sua senha.
        </p>
        {sent ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-sky-50 border border-sky-200 text-sm text-sky-900">
              Se o e-mail estiver cadastrado, um link de recuperação foi enviado.
            </div>
            {debugLink && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs">
                <div className="font-semibold text-amber-900 mb-1">Modo demo (link mostrado aqui):</div>
                <Link to={debugLink.split(window.location.origin)[1] || "#"} className="text-sky-700 break-all underline">
                  {debugLink}
                </Link>
              </div>
            )}
            <Link to="/login" className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700">
              <ArrowLeft className="w-4 h-4" /> Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid={AUTH.forgotEmail}
                className="mt-1.5"
              />
            </div>
            <Button
              type="submit"
              data-testid={AUTH.forgotSubmit}
              className="w-full h-11 bg-sky-600 hover:bg-sky-700"
            >
              Enviar link
            </Button>
            <Link to="/login" className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700">
              <ArrowLeft className="w-4 h-4" /> Voltar ao login
            </Link>
          </form>
        )}
      </Card>
    </div>
  );
}
