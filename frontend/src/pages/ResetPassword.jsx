import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { AUTH } from "@/constants/testIds";
import { FlaskConical } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Senha redefinida! Faça login novamente.");
      navigate("/login");
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
        <h2 className="font-display text-2xl font-bold mb-6">Nova senha</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="password">Nova senha</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid={AUTH.resetPassword}
              className="mt-1.5"
            />
          </div>
          <Button type="submit" data-testid={AUTH.resetSubmit} className="w-full h-11 bg-sky-600 hover:bg-sky-700">
            Redefinir senha
          </Button>
          <Link to="/login" className="text-sm text-sky-600 hover:text-sky-700">
            Voltar ao login
          </Link>
        </form>
      </Card>
    </div>
  );
}
