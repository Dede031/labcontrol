import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gauge, CheckCircle2, XCircle, ShieldCheck, Clock } from "lucide-react";
import { toast } from "sonner";
import { RUPTURA } from "@/constants/testIds";

export default function Ruptura() {
  const { user } = useAuth();
  const canValidate = user?.role === "tecnico" || user?.role === "super_admin";
  const [params] = useSearchParams();
  const preselect = params.get("cp");
  const [cps, setCps] = useState([]);
  const [rupturas, setRupturas] = useState([]);
  const [form, setForm] = useState({
    cp_id: preselect || "",
    idade_real: 28,
    diametro: 100,
    carga: 0,
    observacoes: "",
  });

  // Validation modal
  const [vOpen, setVOpen] = useState(false);
  const [vRuptura, setVRuptura] = useState(null);
  const [vAprovado, setVAprovado] = useState(true);
  const [vObs, setVObs] = useState("");

  const load = async () => {
    const [pendentes, rup] = await Promise.all([
      api.get("/cps", { params: { status: "Pendente" } }),
      api.get("/rupturas"),
    ]);
    setCps(pendentes.data);
    setRupturas(rup.data);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (preselect && cps.length && !form.cp_id) {
      const cp = cps.find((c) => c.id === preselect);
      if (cp) setForm((f) => ({ ...f, cp_id: cp.id, idade_real: cp.idade }));
    }
  }, [cps, preselect]);

  const { area, mpa } = useMemo(() => {
    const d = parseFloat(form.diametro) || 0;
    const c = parseFloat(form.carga) || 0;
    const areaMm2 = (Math.PI * d * d) / 4;
    const areaCm2 = areaMm2 / 100;
    const resist = areaCm2 > 0 ? (c * 10) / areaCm2 : 0;
    return { area: areaCm2, mpa: resist };
  }, [form.diametro, form.carga]);

  const save = async () => {
    if (!form.cp_id) return toast.error("Selecione um corpo de prova");
    try {
      await api.post("/rupturas", {
        cp_id: form.cp_id,
        idade_real: parseInt(form.idade_real),
        diametro: parseFloat(form.diametro),
        carga: parseFloat(form.carga),
        observacoes: form.observacoes,
      });
      toast.success(`Ruptura registrada: ${mpa.toFixed(2)} MPa — aguardando validação`);
      setForm({ cp_id: "", idade_real: 28, diametro: 100, carga: 0, observacoes: "" });
      load();
    } catch { toast.error("Erro ao registrar ruptura"); }
  };

  const openValidar = (r) => {
    setVRuptura(r);
    setVAprovado(true);
    setVObs("");
    setVOpen(true);
  };

  const validar = async () => {
    try {
      await api.put(`/rupturas/${vRuptura.id}/validar`, { aprovado: vAprovado, observacoes: vObs });
      toast.success(vAprovado ? "Ruptura validada" : "Ruptura rejeitada");
      setVOpen(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Erro ao validar");
    }
  };

  const statusBadge = (s) => {
    if (s === "Validado") return { className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-100", icon: CheckCircle2 };
    if (s === "Rejeitado") return { className: "bg-red-100 text-red-800 hover:bg-red-100", icon: XCircle };
    return { className: "bg-sky-100 text-sky-800 hover:bg-sky-100", icon: Clock };
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Ensaio de Ruptura</h1>
          <p className="text-sm text-slate-500">Resistência = (Carga × 10) / Área — resultado em MPa</p>
        </div>
        {canValidate ? (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100"><ShieldCheck className="w-3 h-3 mr-1" /> Técnico validador</Badge>
        ) : (
          <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100">Somente lançamento — validação pelo técnico</Badge>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 p-5">
          <h3 className="font-display font-semibold text-slate-900 mb-4">Registrar ruptura</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>Corpo de prova</Label>
              <Select value={form.cp_id} onValueChange={(v) => {
                const cp = cps.find(c => c.id === v);
                setForm({ ...form, cp_id: v, idade_real: cp?.idade || form.idade_real });
              }}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione o CP pendente" /></SelectTrigger>
                <SelectContent>
                  {cps.map((cp) => (
                    <SelectItem key={cp.id} value={cp.id}>
                      {cp.identificacao} — {cp.obra_nome} ({cp.idade}d)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Idade real (dias)</Label>
              <Input type="number" value={form.idade_real} onChange={(e) => setForm({ ...form, idade_real: e.target.value })} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label>Diâmetro (mm)</Label>
              <Input data-testid={RUPTURA.diametroInput} type="number" step="0.1" value={form.diametro} onChange={(e) => setForm({ ...form, diametro: e.target.value })} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label>Carga de ruptura (kN)</Label>
              <Input data-testid={RUPTURA.cargaInput} type="number" step="0.1" value={form.carga} onChange={(e) => setForm({ ...form, carga: e.target.value })} className="mt-1.5 font-mono" />
            </div>
            <div>
              <Label>Área calculada (cm²)</Label>
              <Input readOnly value={area.toFixed(2)} className="mt-1.5 font-mono bg-slate-50" />
            </div>
            <div className="sm:col-span-2">
              <Label>Observações</Label>
              <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1.5" />
            </div>
          </div>
          <div className="mt-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
            <div data-testid={RUPTURA.resultado} className="px-5 py-3 rounded-xl bg-sky-50 border border-sky-200">
              <div className="text-xs text-sky-700 uppercase tracking-wide">Resultado</div>
              <div className="text-3xl font-extrabold font-mono text-sky-900">
                {mpa.toFixed(2)} <span className="text-lg font-semibold">MPa</span>
              </div>
            </div>
            <Button data-testid={RUPTURA.saveBtn} onClick={save} className="bg-sky-600 hover:bg-sky-700 h-11">
              <Gauge className="w-4 h-4 mr-2" /> Salvar ruptura
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-display font-semibold text-slate-900 mb-3">Rupturas recentes</h3>
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {rupturas.slice(0, 20).map((r) => {
              const b = statusBadge(r.validacao_status);
              const Icon = b.icon;
              return (
                <div key={r.id} className="p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-semibold">{r.cp_identificacao}</span>
                    <span className={`text-lg font-extrabold font-mono ${r.conforme === false ? "text-red-700" : "text-sky-700"}`}>
                      {r.resistencia_mpa} MPa
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {r.obra_nome} · {r.idade_real}d · {new Date(r.data_ensaio).toLocaleDateString("pt-BR")}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1.5 space-y-0.5 border-l-2 border-slate-200 pl-2">
                    <div>📝 Lançado por <span className="font-semibold text-slate-700">{r.created_by_nome || "-"}</span> em {new Date(r.data_ensaio).toLocaleString("pt-BR")}</div>
                    {r.validado_em && (
                      <div>
                        {r.validacao_status === "Rejeitado" ? "❌" : "✅"}
                        {" "}Validado por <span className="font-semibold text-slate-700">{r.validado_por_nome || "-"}</span> em {new Date(r.validado_em).toLocaleString("pt-BR")}
                        {r.validacao_observacoes && <div className="italic text-slate-500">"{r.validacao_observacoes}"</div>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                    <Badge className={b.className}><Icon className="w-3 h-3 mr-1" /> {r.validacao_status}</Badge>
                    {canValidate && r.validacao_status === "Aguardando validação" && (
                      <Button size="sm" variant="outline" onClick={() => openValidar(r)} className="h-7 text-xs">
                        <ShieldCheck className="w-3 h-3 mr-1" /> Validar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            {rupturas.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">Nenhuma ruptura ainda</div>}
          </div>
        </Card>
      </div>

      {/* Validation dialog */}
      <Dialog open={vOpen} onOpenChange={setVOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Validar ruptura {vRuptura?.cp_identificacao}</DialogTitle>
            <DialogDescription>
              {vRuptura?.resistencia_mpa} MPa — FCK nominal {vRuptura?.fck_nominal || "-"} — lançado por {vRuptura?.created_by_nome}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={vAprovado ? "default" : "outline"}
                className={vAprovado ? "bg-emerald-600 hover:bg-emerald-700 flex-1" : "flex-1"}
                onClick={() => setVAprovado(true)}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> Validar
              </Button>
              <Button
                variant={!vAprovado ? "default" : "outline"}
                className={!vAprovado ? "bg-red-600 hover:bg-red-700 flex-1" : "flex-1"}
                onClick={() => setVAprovado(false)}
              >
                <XCircle className="w-4 h-4 mr-2" /> Rejeitar
              </Button>
            </div>
            <div>
              <Label>Observações da validação</Label>
              <Textarea rows={3} value={vObs} onChange={(e) => setVObs(e.target.value)} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setVOpen(false)}>Cancelar</Button>
            <Button onClick={validar} className="bg-sky-600 hover:bg-sky-700">Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
