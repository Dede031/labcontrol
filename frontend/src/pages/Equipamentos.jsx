import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EQUIP } from "@/constants/testIds";

const EMPTY = {
  nome: "", patrimonio: "", fabricante: "", modelo: "", numero_serie: "",
  ultima_calibracao: "", proxima_calibracao: "", status: "Em dia",
  certificado_url: "", observacoes: "",
};

const badgeFor = (calc) => {
  if (calc === "Vencido") return "bg-red-100 text-red-800 hover:bg-red-100";
  if (calc === "Calibração próxima") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
  return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
};

export default function Equipamentos() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data } = await api.get("/equipamentos");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const payload = {
        ...form,
        ultima_calibracao: form.ultima_calibracao ? new Date(form.ultima_calibracao).toISOString() : null,
        proxima_calibracao: form.proxima_calibracao ? new Date(form.proxima_calibracao).toISOString() : null,
      };
      if (editing) await api.put(`/equipamentos/${editing}`, payload);
      else await api.post("/equipamentos", payload);
      toast.success("Equipamento salvo");
      setOpen(false); setForm(EMPTY); setEditing(null);
      load();
    } catch { toast.error("Erro ao salvar"); }
  };

  const edit = (e) => {
    setForm({
      nome: e.nome, patrimonio: e.patrimonio || "", fabricante: e.fabricante || "",
      modelo: e.modelo || "", numero_serie: e.numero_serie || "",
      ultima_calibracao: e.ultima_calibracao ? e.ultima_calibracao.slice(0, 10) : "",
      proxima_calibracao: e.proxima_calibracao ? e.proxima_calibracao.slice(0, 10) : "",
      status: e.status || "Em dia",
      certificado_url: e.certificado_url || "", observacoes: e.observacoes || "",
    });
    setEditing(e.id);
    setOpen(true);
  };

  const del = async (id) => {
    if (!window.confirm("Remover equipamento?")) return;
    await api.delete(`/equipamentos/${id}`);
    toast.success("Removido");
    load();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Equipamentos</h1>
          <p className="text-sm text-slate-500">Controle de calibrações e patrimônio</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(EMPTY); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button data-testid={EQUIP.newBtn} className="bg-sky-600 hover:bg-sky-700 h-10">
              <Plus className="w-4 h-4 mr-2" /> Novo equipamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing ? "Editar equipamento" : "Novo equipamento"}</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Equipamento</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Patrimônio</Label>
                <Input value={form.patrimonio} onChange={(e) => setForm({ ...form, patrimonio: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Nº de série</Label>
                <Input value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Fabricante</Label>
                <Input value={form.fabricante} onChange={(e) => setForm({ ...form, fabricante: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Última calibração</Label>
                <Input type="date" value={form.ultima_calibracao} onChange={(e) => setForm({ ...form, ultima_calibracao: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Próxima calibração</Label>
                <Input type="date" value={form.proxima_calibracao} onChange={(e) => setForm({ ...form, proxima_calibracao: e.target.value })} className="mt-1.5" />
              </div>
              <div className="sm:col-span-2">
                <Label>Certificado (URL)</Label>
                <Input value={form.certificado_url} onChange={(e) => setForm({ ...form, certificado_url: e.target.value })} placeholder="https://..." className="mt-1.5" />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={2} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button data-testid={EQUIP.saveBtn} onClick={save} className="bg-sky-600 hover:bg-sky-700">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Equipamento</TableHead>
              <TableHead>Patrimônio</TableHead>
              <TableHead>Última calibração</TableHead>
              <TableHead>Próxima calibração</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((e) => (
              <TableRow key={e.id} data-testid={EQUIP.row(e.id)}>
                <TableCell className="font-medium">{e.nome}</TableCell>
                <TableCell className="font-mono text-xs">{e.patrimonio}</TableCell>
                <TableCell className="font-mono text-xs">{e.ultima_calibracao ? new Date(e.ultima_calibracao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                <TableCell className="font-mono text-xs">{e.proxima_calibracao ? new Date(e.proxima_calibracao).toLocaleDateString("pt-BR") : "-"}</TableCell>
                <TableCell><Badge className={badgeFor(e._status_calc || e.status)}>{e._status_calc || e.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => edit(e)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => del(e.id)}><Trash2 className="w-4 h-4 text-red-600" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-slate-400 py-8">Nenhum equipamento</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}
