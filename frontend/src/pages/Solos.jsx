import { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Layers, LineChart as LineIcon, Activity, Zap } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceDot } from "recharts";

// --- Amostras Panel ---
function AmostrasPanel({ obras, amostras, reload }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ obra_id: "", identificacao: "", local: "", profundidade: "", descricao: "", data_coleta: "", observacoes: "" });

  const save = async () => {
    try {
      await api.post("/solos/amostras", form);
      toast.success("Amostra cadastrada");
      setOpen(false);
      setForm({ obra_id: "", identificacao: "", local: "", profundidade: "", descricao: "", data_coleta: "", observacoes: "" });
      reload();
    } catch { toast.error("Erro ao salvar"); }
  };
  const del = async (id) => {
    if (!window.confirm("Remover amostra e ensaios ligados?")) return;
    await api.delete(`/solos/amostras/${id}`);
    reload();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="font-display font-semibold">Amostras de Solo</h3><p className="text-xs text-slate-500">Cadastre a amostra antes de lançar ensaios</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="bg-sky-600 hover:bg-sky-700"><Plus className="w-4 h-4 mr-1" /> Nova amostra</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova amostra</DialogTitle><DialogDescription>Identifique o solo para vincular ensaios de PDL, Compactação e Hilf.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div><Label>Obra</Label>
                <Select value={form.obra_id} onValueChange={(v) => setForm({ ...form, obra_id: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>{obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Identificação</Label><Input value={form.identificacao} onChange={(e) => setForm({ ...form, identificacao: e.target.value })} placeholder="Ex: AM-01 Aterro Bloco A" className="mt-1.5" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Local</Label><Input value={form.local} onChange={(e) => setForm({ ...form, local: e.target.value })} className="mt-1.5" /></div>
                <div><Label>Profundidade</Label><Input value={form.profundidade} onChange={(e) => setForm({ ...form, profundidade: e.target.value })} placeholder="0-30cm" className="mt-1.5" /></div>
              </div>
              <div><Label>Descrição</Label><Textarea rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} className="mt-1.5" /></div>
              <div><Label>Data da coleta</Label><Input type="date" value={form.data_coleta} onChange={(e) => setForm({ ...form, data_coleta: e.target.value })} className="mt-1.5" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} className="bg-sky-600 hover:bg-sky-700">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Identificação</TableHead><TableHead>Obra</TableHead><TableHead>Local</TableHead><TableHead>Profundidade</TableHead><TableHead>Coleta</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {amostras.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono font-medium">{a.identificacao}</TableCell>
                <TableCell className="text-sm">{a.obra_nome}</TableCell>
                <TableCell className="text-sm text-slate-600">{a.local}</TableCell>
                <TableCell className="font-mono text-xs">{a.profundidade}</TableCell>
                <TableCell className="font-mono text-xs">{a.data_coleta ? new Date(a.data_coleta).toLocaleDateString("pt-BR") : "-"}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => del(a.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
            {amostras.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-6">Nenhuma amostra ainda</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// --- PDL Panel ---
function PDLPanel({ amostras, ensaios, reload }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amostra_id: "", data_ensaio: "", operador: "", observacoes: "" });
  const [pontos, setPontos] = useState([{ profundidade_cm: 10, golpes: 0 }]);

  const addPonto = () => setPontos([...pontos, { profundidade_cm: (pontos[pontos.length-1]?.profundidade_cm || 0) + 10, golpes: 0 }]);
  const setPonto = (i, k, v) => {
    const arr = [...pontos];
    arr[i] = { ...arr[i], [k]: parseFloat(v) || 0 };
    setPontos(arr);
  };
  const rmPonto = (i) => setPontos(pontos.filter((_, idx) => idx !== i));

  const save = async () => {
    try {
      await api.post("/solos/pdl", { ...form, pontos });
      toast.success("Ensaio PDL registrado");
      setOpen(false);
      setForm({ amostra_id: "", data_ensaio: "", operador: "", observacoes: "" });
      setPontos([{ profundidade_cm: 10, golpes: 0 }]);
      reload();
    } catch { toast.error("Erro ao salvar"); }
  };
  const del = async (id) => { if (!window.confirm("Remover?")) return; await api.delete(`/solos/pdl/${id}`); reload(); };

  const [expanded, setExpanded] = useState(null);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="font-display font-semibold">PDL — Penetração Dinâmica Leve</h3><p className="text-xs text-slate-500">Golpes por profundidade</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="bg-sky-600 hover:bg-sky-700"><Plus className="w-4 h-4 mr-1" /> Novo ensaio PDL</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo ensaio PDL</DialogTitle><DialogDescription>Informe golpes por profundidade</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amostra</Label>
                  <Select value={form.amostra_id} onValueChange={(v) => setForm({ ...form, amostra_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione amostra" /></SelectTrigger>
                    <SelectContent>{amostras.map((a) => <SelectItem key={a.id} value={a.id}>{a.identificacao} — {a.obra_nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Data</Label><Input type="date" value={form.data_ensaio} onChange={(e) => setForm({ ...form, data_ensaio: e.target.value })} className="mt-1.5" /></div>
              </div>
              <div><Label>Operador</Label><Input value={form.operador} onChange={(e) => setForm({ ...form, operador: e.target.value })} className="mt-1.5" /></div>
              <div>
                <Label>Pontos (profundidade cm × nº golpes)</Label>
                <div className="space-y-2 mt-1.5">
                  {pontos.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input type="number" placeholder="Prof cm" value={p.profundidade_cm} onChange={(e) => setPonto(i, "profundidade_cm", e.target.value)} className="font-mono" />
                      <Input type="number" placeholder="Golpes" value={p.golpes} onChange={(e) => setPonto(i, "golpes", e.target.value)} className="font-mono" />
                      <Button variant="ghost" size="icon" onClick={() => rmPonto(i)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addPonto}><Plus className="w-3 h-3 mr-1" /> Adicionar ponto</Button>
                </div>
              </div>
              <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1.5" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} className="bg-sky-600 hover:bg-sky-700">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-3">
        {ensaios.map((e) => (
          <div key={e.id} className="p-3 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-mono font-semibold">{e.amostra_identificacao} — {e.obra_nome}</div>
                <div className="text-xs text-slate-500">{new Date(e.data_ensaio).toLocaleDateString("pt-BR")} · Operador: {e.operador || "-"} · {e.pontos?.length || 0} pontos</div>
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>{expanded === e.id ? "Ocultar" : "Ver gráfico"}</Button>
                <Button variant="ghost" size="icon" onClick={() => del(e.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
              </div>
            </div>
            {expanded === e.id && (
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={e.pontos} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="golpes" type="number" label={{ value: "Golpes", position: "bottom", fontSize: 11 }} />
                    <YAxis dataKey="profundidade_cm" type="number" reversed label={{ value: "Prof. (cm)", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="profundidade_cm" stroke="#0284c7" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ))}
        {ensaios.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">Nenhum ensaio PDL</div>}
      </div>
    </Card>
  );
}

// --- Compactação Panel ---
function CompactacaoPanel({ amostras, ensaios, reload }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amostra_id: "", data_ensaio: "", energia: "Normal", observacoes: "" });
  const [pontos, setPontos] = useState([
    { umidade: 8, densidade_seca: 1.72 },
    { umidade: 10, densidade_seca: 1.79 },
    { umidade: 12, densidade_seca: 1.83 },
    { umidade: 14, densidade_seca: 1.80 },
    { umidade: 16, densidade_seca: 1.74 },
  ]);

  const addPonto = () => setPontos([...pontos, { umidade: 0, densidade_seca: 0 }]);
  const setPonto = (i, k, v) => { const a = [...pontos]; a[i] = { ...a[i], [k]: parseFloat(v) || 0 }; setPontos(a); };
  const rmPonto = (i) => setPontos(pontos.filter((_, idx) => idx !== i));

  const save = async () => {
    try {
      await api.post("/solos/compactacao", { ...form, pontos });
      toast.success("Ensaio de compactação registrado");
      setOpen(false);
      setForm({ amostra_id: "", data_ensaio: "", energia: "Normal", observacoes: "" });
      setPontos([{ umidade: 8, densidade_seca: 1.72 }, { umidade: 10, densidade_seca: 1.79 }, { umidade: 12, densidade_seca: 1.83 }, { umidade: 14, densidade_seca: 1.80 }, { umidade: 16, densidade_seca: 1.74 }]);
      reload();
    } catch { toast.error("Erro ao salvar"); }
  };
  const del = async (id) => { if (!window.confirm("Remover?")) return; await api.delete(`/solos/compactacao/${id}`); reload(); };
  const [expanded, setExpanded] = useState(null);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="font-display font-semibold">Compactação (Proctor)</h3><p className="text-xs text-slate-500">Curva umidade × densidade, com identificação automática da umidade ótima</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="bg-sky-600 hover:bg-sky-700"><Plus className="w-4 h-4 mr-1" /> Novo Proctor</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo ensaio de compactação</DialogTitle><DialogDescription>A curva e umidade ótima são calculadas automaticamente.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2"><Label>Amostra</Label>
                  <Select value={form.amostra_id} onValueChange={(v) => setForm({ ...form, amostra_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{amostras.map((a) => <SelectItem key={a.id} value={a.id}>{a.identificacao} — {a.obra_nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Energia</Label>
                  <Select value={form.energia} onValueChange={(v) => setForm({ ...form, energia: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Normal">Normal</SelectItem><SelectItem value="Intermediária">Intermediária</SelectItem><SelectItem value="Modificada">Modificada</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Data</Label><Input type="date" value={form.data_ensaio} onChange={(e) => setForm({ ...form, data_ensaio: e.target.value })} className="mt-1.5" /></div>
              <div>
                <Label>Pontos (umidade % × densidade seca g/cm³)</Label>
                <div className="space-y-2 mt-1.5">
                  {pontos.map((p, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input type="number" step="0.1" placeholder="Umid %" value={p.umidade} onChange={(e) => setPonto(i, "umidade", e.target.value)} className="font-mono" />
                      <Input type="number" step="0.01" placeholder="Dens. seca g/cm³" value={p.densidade_seca} onChange={(e) => setPonto(i, "densidade_seca", e.target.value)} className="font-mono" />
                      <Button variant="ghost" size="icon" onClick={() => rmPonto(i)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addPonto}><Plus className="w-3 h-3 mr-1" /> Ponto</Button>
                </div>
              </div>
              <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1.5" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} className="bg-sky-600 hover:bg-sky-700">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-3">
        {ensaios.map((e) => {
          const sorted = [...(e.pontos || [])].sort((a, b) => a.umidade - b.umidade);
          return (
            <div key={e.id} className="p-3 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="font-mono font-semibold">{e.amostra_identificacao} — {e.obra_nome}</div>
                  <div className="text-xs text-slate-500">{new Date(e.data_ensaio).toLocaleDateString("pt-BR")} · Energia {e.energia}</div>
                </div>
                <div className="flex gap-4 items-center">
                  <div className="text-xs">
                    <div className="text-slate-500">Umidade ótima</div>
                    <div className="font-mono font-bold text-sky-700">{e.umidade_otima ?? "-"} %</div>
                  </div>
                  <div className="text-xs">
                    <div className="text-slate-500">Dens. máx.</div>
                    <div className="font-mono font-bold text-sky-700">{e.densidade_max ?? "-"} g/cm³</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>{expanded === e.id ? "Ocultar" : "Ver curva"}</Button>
                  <Button variant="ghost" size="icon" onClick={() => del(e.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                </div>
              </div>
              {expanded === e.id && (
                <div className="mt-3 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sorted} margin={{ top: 15, right: 30, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="umidade" type="number" domain={['auto','auto']} label={{ value: "Umidade (%)", position: "bottom", fontSize: 11 }} tickFormatter={(v)=>v.toFixed(1)} />
                      <YAxis dataKey="densidade_seca" type="number" domain={['auto','auto']} label={{ value: "Densidade seca (g/cm³)", angle: -90, position: "insideLeft", fontSize: 11 }} tickFormatter={(v)=>v.toFixed(2)} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="densidade_seca" stroke="#0284c7" strokeWidth={2} name="Curva Proctor" />
                      {e.umidade_otima != null && e.densidade_max != null && (
                        <ReferenceDot x={e.umidade_otima} y={e.densidade_max} r={6} fill="#dc2626" stroke="#991b1b" label={{ value: `Ótimo ${e.umidade_otima}%`, position: "top", fontSize: 10, fill: "#991b1b" }} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
        {ensaios.length === 0 && <div className="text-center text-slate-400 py-6 text-sm">Nenhum ensaio de compactação</div>}
      </div>
    </Card>
  );
}

// --- Hilf Panel ---
function HilfPanel({ amostras, ensaios, compactacoes, reload }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    amostra_id: "", data_ensaio: "",
    umidade_campo: 0, densidade_campo: 0,
    densidade_max_lab: 0, umidade_otima_lab: 0,
    grau_compactacao_meta: 100, observacoes: "",
  });

  // Auto-fill from compactacao when amostra selected
  useEffect(() => {
    if (form.amostra_id) {
      const c = compactacoes.find((x) => x.amostra_id === form.amostra_id);
      if (c && c.densidade_max && c.umidade_otima) {
        setForm((f) => ({ ...f, densidade_max_lab: c.densidade_max, umidade_otima_lab: c.umidade_otima }));
      }
    }
  }, [form.amostra_id, compactacoes]);

  const preview = useMemo(() => {
    const dSeca = form.densidade_campo / (1 + (form.umidade_campo || 0) / 100);
    const gc = form.densidade_max_lab > 0 ? (dSeca / form.densidade_max_lab) * 100 : 0;
    return { dSeca, gc };
  }, [form.umidade_campo, form.densidade_campo, form.densidade_max_lab]);

  const save = async () => {
    try {
      await api.post("/solos/hilf", form);
      toast.success("Ensaio Hilf registrado");
      setOpen(false);
      setForm({ amostra_id: "", data_ensaio: "", umidade_campo: 0, densidade_campo: 0, densidade_max_lab: 0, umidade_otima_lab: 0, grau_compactacao_meta: 100, observacoes: "" });
      reload();
    } catch { toast.error("Erro ao salvar"); }
  };
  const del = async (id) => { if (!window.confirm("Remover?")) return; await api.delete(`/solos/hilf/${id}`); reload(); };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div><h3 className="font-display font-semibold">Hilf — Verificação rápida in situ</h3><p className="text-xs text-slate-500">Grau de compactação calculado automaticamente</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm" className="bg-sky-600 hover:bg-sky-700"><Plus className="w-4 h-4 mr-1" /> Novo Hilf</Button></DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Novo ensaio Hilf</DialogTitle><DialogDescription>Se houver Proctor da amostra, os valores de referência são preenchidos automaticamente.</DialogDescription></DialogHeader>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Amostra</Label>
                  <Select value={form.amostra_id} onValueChange={(v) => setForm({ ...form, amostra_id: v })}>
                    <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{amostras.map((a) => <SelectItem key={a.id} value={a.id}>{a.identificacao} — {a.obra_nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Data</Label><Input type="date" value={form.data_ensaio} onChange={(e) => setForm({ ...form, data_ensaio: e.target.value })} className="mt-1.5" /></div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-semibold uppercase text-slate-500">Campo</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Umidade campo (%)</Label><Input type="number" step="0.1" value={form.umidade_campo} onChange={(e) => setForm({ ...form, umidade_campo: parseFloat(e.target.value) || 0 })} className="mt-1.5 font-mono" /></div>
                  <div><Label>Densidade aparente campo (g/cm³)</Label><Input type="number" step="0.01" value={form.densidade_campo} onChange={(e) => setForm({ ...form, densidade_campo: parseFloat(e.target.value) || 0 })} className="mt-1.5 font-mono" /></div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 space-y-3">
                <div className="text-xs font-semibold uppercase text-sky-700">Laboratório (referência Proctor)</div>
                <div className="grid grid-cols-3 gap-3">
                  <div><Label>Umidade ótima (%)</Label><Input type="number" step="0.1" value={form.umidade_otima_lab} onChange={(e) => setForm({ ...form, umidade_otima_lab: parseFloat(e.target.value) || 0 })} className="mt-1.5 font-mono" /></div>
                  <div><Label>Densidade máx (g/cm³)</Label><Input type="number" step="0.01" value={form.densidade_max_lab} onChange={(e) => setForm({ ...form, densidade_max_lab: parseFloat(e.target.value) || 0 })} className="mt-1.5 font-mono" /></div>
                  <div><Label>GC meta (%)</Label><Input type="number" step="0.1" value={form.grau_compactacao_meta} onChange={(e) => setForm({ ...form, grau_compactacao_meta: parseFloat(e.target.value) || 0 })} className="mt-1.5 font-mono" /></div>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-emerald-700">Dens. seca de campo</div><div className="font-mono font-bold text-lg">{preview.dSeca.toFixed(3)} g/cm³</div></div>
                <div><div className="text-emerald-700">Grau de compactação</div><div className={`font-mono font-bold text-lg ${preview.gc >= form.grau_compactacao_meta ? "text-emerald-700" : "text-red-700"}`}>{preview.gc.toFixed(2)} %</div></div>
              </div>
              <div><Label>Observações</Label><Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1.5" /></div>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={save} className="bg-sky-600 hover:bg-sky-700">Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Amostra</TableHead><TableHead>Obra</TableHead><TableHead>Data</TableHead><TableHead>Umid. campo</TableHead><TableHead>Dens. seca</TableHead><TableHead>GC</TableHead><TableHead>Status</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {ensaios.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="font-mono">{e.amostra_identificacao}</TableCell>
                <TableCell className="text-sm">{e.obra_nome}</TableCell>
                <TableCell className="font-mono text-xs">{new Date(e.data_ensaio).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell className="font-mono">{e.umidade_campo}%</TableCell>
                <TableCell className="font-mono">{e.densidade_seca_campo} g/cm³</TableCell>
                <TableCell className="font-mono font-semibold">{e.grau_compactacao}%</TableCell>
                <TableCell><Badge className={e.conforme ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : "bg-red-100 text-red-800 hover:bg-red-100"}>{e.conforme ? "Conforme" : "Não conforme"}</Badge></TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => del(e.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button></TableCell>
              </TableRow>
            ))}
            {ensaios.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-slate-400 py-6">Nenhum ensaio Hilf</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// --- Main page ---
export default function Solos() {
  const [obras, setObras] = useState([]);
  const [amostras, setAmostras] = useState([]);
  const [pdl, setPdl] = useState([]);
  const [comp, setComp] = useState([]);
  const [hilf, setHilf] = useState([]);

  const load = async () => {
    const [o, a, p, c, h] = await Promise.all([
      api.get("/obras"),
      api.get("/solos/amostras"),
      api.get("/solos/pdl"),
      api.get("/solos/compactacao"),
      api.get("/solos/hilf"),
    ]);
    setObras(o.data);
    setAmostras(a.data);
    setPdl(p.data);
    setComp(c.data);
    setHilf(h.data);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-2"><Layers className="w-7 h-7 text-sky-600" /> Controle de Solos</h1>
          <p className="text-sm text-slate-500">Amostras · PDL · Compactação (Proctor) · Hilf in situ</p>
        </div>
      </div>

      <Tabs defaultValue="amostras" className="space-y-5">
        <TabsList className="bg-slate-100 h-auto p-1 flex-wrap">
          <TabsTrigger value="amostras" data-testid="solos-tab-amostras" className="data-[state=active]:bg-white"><Layers className="w-4 h-4 mr-1.5" /> Amostras</TabsTrigger>
          <TabsTrigger value="pdl" data-testid="solos-tab-pdl" className="data-[state=active]:bg-white"><Zap className="w-4 h-4 mr-1.5" /> PDL</TabsTrigger>
          <TabsTrigger value="compactacao" data-testid="solos-tab-compactacao" className="data-[state=active]:bg-white"><LineIcon className="w-4 h-4 mr-1.5" /> Compactação</TabsTrigger>
          <TabsTrigger value="hilf" data-testid="solos-tab-hilf" className="data-[state=active]:bg-white"><Activity className="w-4 h-4 mr-1.5" /> Hilf</TabsTrigger>
        </TabsList>
        <TabsContent value="amostras"><AmostrasPanel obras={obras} amostras={amostras} reload={load} /></TabsContent>
        <TabsContent value="pdl"><PDLPanel amostras={amostras} ensaios={pdl} reload={load} /></TabsContent>
        <TabsContent value="compactacao"><CompactacaoPanel amostras={amostras} ensaios={comp} reload={load} /></TabsContent>
        <TabsContent value="hilf"><HilfPanel amostras={amostras} ensaios={hilf} compactacoes={comp} reload={load} /></TabsContent>
      </Tabs>
    </div>
  );
}
