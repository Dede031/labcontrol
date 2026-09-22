import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { OBRAS } from "@/constants/testIds";

const EMPTY = {
  nome: "", cliente: "", endereco: "", cidade: "", uf: "",
  responsavel: "", status: "Ativa", observacoes: "",
};

export default function Obras() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data } = await api.get("/obras");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing) await api.put(`/obras/${editing}`, form);
      else await api.post("/obras", form);
      toast.success("Obra salva");
      setOpen(false);
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (e) {
      toast.error("Erro ao salvar");
    }
  };

  const del = async (id) => {
    if (!window.confirm("Remover esta obra?")) return;
    await api.delete(`/obras/${id}`);
    toast.success("Removida");
    load();
  };

  const edit = (o) => {
    setForm({ nome: o.nome, cliente: o.cliente, endereco: o.endereco, cidade: o.cidade,
      uf: o.uf, responsavel: o.responsavel, status: o.status, observacoes: o.observacoes || "" });
    setEditing(o.id);
    setOpen(true);
  };

  const filtered = items.filter(
    (o) =>
      o.nome.toLowerCase().includes(q.toLowerCase()) ||
      o.cliente.toLowerCase().includes(q.toLowerCase()) ||
      o.cidade.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Obras</h1>
          <p className="text-sm text-slate-500">Gerencie os empreendimentos e clientes</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(EMPTY); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button data-testid={OBRAS.newBtn} className="bg-sky-600 hover:bg-sky-700 h-10">
              <Plus className="w-4 h-4 mr-2" /> Nova obra
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar obra" : "Nova obra"}</DialogTitle>
              <DialogDescription>Preencha os dados da obra e clique em salvar.</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Nome da obra</Label>
                <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Cliente/Contratante</Label>
                <Input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Responsável</Label>
                <Input value={form.responsavel} onChange={(e) => setForm({ ...form, responsavel: e.target.value })} className="mt-1.5" />
              </div>
              <div className="sm:col-span-2">
                <Label>Endereço</Label>
                <Input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="mt-1.5" />
              </div>
              <div>
                <Label>UF</Label>
                <Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} className="mt-1.5" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ativa">Ativa</SelectItem>
                    <SelectItem value="Concluída">Concluída</SelectItem>
                    <SelectItem value="Inativa">Inativa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={3} value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button data-testid={OBRAS.saveBtn} onClick={save} className="bg-sky-600 hover:bg-sky-700">Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        <div className="relative mb-3">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar obra, cliente ou cidade..." className="pl-9" />
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Cidade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id} data-testid={OBRAS.row(o.id)}>
                <TableCell className="font-medium">{o.nome}</TableCell>
                <TableCell className="text-slate-600 text-sm">{o.cliente}</TableCell>
                <TableCell className="text-slate-600 text-sm">{o.cidade}{o.uf && `/${o.uf}`}</TableCell>
                <TableCell>
                  <Badge className={
                    o.status === "Ativa" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" :
                    o.status === "Concluída" ? "bg-slate-100 text-slate-700 hover:bg-slate-100" :
                    "bg-red-100 text-red-800 hover:bg-red-100"
                  }>{o.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button data-testid={OBRAS.edit(o.id)} variant="ghost" size="icon" onClick={() => edit(o)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button data-testid={OBRAS.del(o.id)} variant="ghost" size="icon" onClick={() => del(o.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">Nenhuma obra cadastrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}
