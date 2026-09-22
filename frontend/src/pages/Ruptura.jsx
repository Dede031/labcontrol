import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gauge, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { RUPTURA } from "@/constants/testIds";

export default function Ruptura() {
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
      toast.success(`Ruptura registrada: ${mpa.toFixed(2)} MPa`);
      setForm({ cp_id: "", idade_real: 28, diametro: 100, carga: 0, observacoes: "" });
      load();
    } catch { toast.error("Erro ao registrar ruptura"); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Ensaio de Ruptura</h1>
        <p className="text-sm text-slate-500">Resistência = (Carga × 10) / Área — resultado em MPa</p>
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
          <h3 className="font-display font-semibold text-slate-900 mb-3">Últimas rupturas</h3>
          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {rupturas.slice(0, 20).map((r) => (
              <div key={r.id} className="p-3 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-semibold">{r.cp_identificacao}</span>
                  <span className="text-lg font-extrabold font-mono text-sky-700">{r.resistencia_mpa} MPa</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {r.obra_nome} · {r.idade_real}d · {new Date(r.data_ensaio).toLocaleDateString("pt-BR")}
                </div>
              </div>
            ))}
            {rupturas.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">Nenhuma ruptura ainda</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
