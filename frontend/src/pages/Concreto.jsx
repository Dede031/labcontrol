import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { CONCRETO, CP } from "@/constants/testIds";

const nowLocal = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString().slice(0, 16);
};

const EMPTY = {
  obra_id: "", data_hora: nowLocal(), fornecedor: "", nota: "",
  fck: 30, volume: 1, elemento: "", slump: 100, observacoes: "",
};

export default function Concreto() {
  const [items, setItems] = useState([]);
  const [obras, setObras] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  // CP batch modal state
  const [cpOpen, setCpOpen] = useState(false);
  const [cpConcreto, setCpConcreto] = useState(null);
  const [cpForm, setCpForm] = useState({ prefixo: "CP", quantidade: 2, idades: "7,28", observacoes: "" });

  const load = async () => {
    const [c, o] = await Promise.all([api.get("/concretos"), api.get("/obras")]);
    setItems(c.data);
    setObras(o.data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = { ...form, data_hora: new Date(form.data_hora).toISOString() };
      const { data } = await api.post("/concretos", payload);
      toast.success("Concreto registrado");
      setOpen(false);
      setForm(EMPTY);
      load();
      // Open CP batch dialog directly
      setCpConcreto(data);
      setCpForm({ prefixo: `CP-${(new Date(payload.data_hora)).toISOString().slice(2,10).replace(/-/g,'')}`, quantidade: 2, idades: "7,28", observacoes: "" });
      setCpOpen(true);
    } catch { toast.error("Erro ao salvar"); }
  };

  const del = async (id) => {
    if (!window.confirm("Remover este concreto e seus CPs?")) return;
    await api.delete(`/concretos/${id}`);
    toast.success("Removido");
    load();
  };

  const createCPs = async () => {
    try {
      const idades = cpForm.idades.split(",").map((s) => parseInt(s.trim())).filter(Boolean);
      await api.post("/cps/batch", {
        concreto_id: cpConcreto.id,
        prefixo: cpForm.prefixo,
        quantidade: parseInt(cpForm.quantidade) || 2,
        data_moldagem: cpConcreto.data_hora,
        idades,
        observacoes: cpForm.observacoes,
      });
      toast.success("Corpos de prova gerados");
      setCpOpen(false);
    } catch { toast.error("Erro ao gerar CPs"); }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Controle de Concreto</h1>
          <p className="text-sm text-slate-500">Registre recebimentos e gere corpos de prova</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid={CONCRETO.newBtn} className="bg-sky-600 hover:bg-sky-700 h-10">
              <Plus className="w-4 h-4 mr-2" /> Novo recebimento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Novo recebimento de concreto</DialogTitle>
              <DialogDescription>Registre o concreto recebido e siga para a moldagem dos CPs.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Obra</Label>
                <Select value={form.obra_id} onValueChange={(v) => setForm({ ...form, obra_id: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione a obra" /></SelectTrigger>
                  <SelectContent>
                    {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data e hora</Label>
                <Input type="datetime-local" value={form.data_hora} onChange={(e) => setForm({ ...form, data_hora: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input value={form.fornecedor} onChange={(e) => setForm({ ...form, fornecedor: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Nota / Documento</Label>
                <Input value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>FCK especificado (MPa)</Label>
                <Input type="number" step="0.1" value={form.fck} onChange={(e) => setForm({ ...form, fck: parseFloat(e.target.value) })} className="mt-1.5" />
              </div>
              <div>
                <Label>Volume (m³)</Label>
                <Input type="number" step="0.1" value={form.volume} onChange={(e) => setForm({ ...form, volume: parseFloat(e.target.value) })} className="mt-1.5" />
              </div>
              <div>
                <Label>Elemento concretado</Label>
                <Input value={form.elemento} onChange={(e) => setForm({ ...form, elemento: e.target.value })} className="mt-1.5" placeholder="Ex: Pilar P12" />
              </div>
              <div className="sm:col-span-2">
                <Label>Slump / Abatimento (mm)</Label>
                <Input type="number" value={form.slump} onChange={(e) => setForm({ ...form, slump: parseFloat(e.target.value) })} className="mt-1.5" />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button data-testid={CONCRETO.saveBtn} onClick={save} className="bg-sky-600 hover:bg-sky-700">Próximo: Moldagem dos CPs</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Obra</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>FCK</TableHead>
              <TableHead>Volume</TableHead>
              <TableHead>Elemento</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id} data-testid={CONCRETO.row(c.id)}>
                <TableCell className="font-medium">{c.obra_nome}</TableCell>
                <TableCell className="text-xs font-mono">{new Date(c.data_hora).toLocaleString("pt-BR")}</TableCell>
                <TableCell>{c.fornecedor}</TableCell>
                <TableCell className="font-mono">{c.fck} MPa</TableCell>
                <TableCell className="font-mono">{c.volume} m³</TableCell>
                <TableCell>{c.elemento}</TableCell>
                <TableCell className="text-right">
                  <Button data-testid={CONCRETO.addCP(c.id)} variant="outline" size="sm" onClick={() => { setCpConcreto(c); setCpForm({ prefixo: "CP", quantidade: 2, idades: "7,28", observacoes: "" }); setCpOpen(true); }}>
                    <FlaskConical className="w-4 h-4 mr-1" /> Adicionar CPs
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => del(c.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">Nenhum recebimento registrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>

      {/* Batch CP dialog */}
      <Dialog open={cpOpen} onOpenChange={setCpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Moldagem de corpos de prova</DialogTitle>
            <DialogDescription>Defina prefixo, quantidade e idades para gerar os CPs automaticamente.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-500 -mt-2">
            Concreto: {cpConcreto?.obra_nome} — FCK {cpConcreto?.fck} MPa
          </p>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Prefixo da identificação</Label>
              <Input value={cpForm.prefixo} onChange={(e) => setCpForm({ ...cpForm, prefixo: e.target.value })} className="mt-1.5" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade por idade</Label>
                <Input type="number" min={1} value={cpForm.quantidade} onChange={(e) => setCpForm({ ...cpForm, quantidade: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Idades (dias)</Label>
                <Input value={cpForm.idades} onChange={(e) => setCpForm({ ...cpForm, idades: e.target.value })} placeholder="7,28" className="mt-1.5" />
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={cpForm.observacoes} onChange={(e) => setCpForm({ ...cpForm, observacoes: e.target.value })} className="mt-1.5" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCpOpen(false)}>Cancelar</Button>
            <Button data-testid={CP.batchSave} onClick={createCPs} className="bg-sky-600 hover:bg-sky-700">Gerar CPs</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
