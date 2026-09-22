import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Building2 } from "lucide-react";

export default function Configuracoes() {
  const { user } = useAuth();
  const [companies, setCompanies] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", cnpj: "", admin_email: "", admin_password: "", admin_name: "" });

  const isSuper = user?.role === "super_admin";

  useEffect(() => {
    if (isSuper) api.get("/companies").then((r) => setCompanies(r.data)).catch(() => {});
  }, [isSuper]);

  const create = async () => {
    try {
      await api.post("/companies", form);
      toast.success("Empresa criada");
      setOpen(false);
      setForm({ name: "", cnpj: "", admin_email: "", admin_password: "", admin_name: "" });
      const r = await api.get("/companies");
      setCompanies(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || "Erro"); }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Configurações</h1>
        <p className="text-sm text-slate-500">Perfil e administração</p>
      </div>

      <Card className="p-5">
        <h3 className="font-display font-semibold mb-3">Meu perfil</h3>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div><div className="text-slate-500 text-xs">Nome</div><div className="font-medium">{user?.name}</div></div>
          <div><div className="text-slate-500 text-xs">E-mail</div><div className="font-medium">{user?.email}</div></div>
          <div><div className="text-slate-500 text-xs">Perfil</div><div className="font-medium capitalize">{user?.role?.replace("_", " ")}</div></div>
          <div><div className="text-slate-500 text-xs">Empresa</div><div className="font-medium">{user?.company_name || "-"}</div></div>
        </div>
      </Card>

      {isSuper && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold flex items-center gap-2"><Building2 className="w-4 h-4" /> Empresas</h3>
              <p className="text-xs text-slate-500">Cadastro de empresas SaaS (apenas admin global)</p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-sky-600 hover:bg-sky-700"><Plus className="w-4 h-4 mr-2" /> Nova empresa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nova empresa</DialogTitle>
                  <DialogDescription>Crie uma empresa e o usuário administrador dela.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
                  <div><Label>CNPJ</Label><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} className="mt-1.5" /></div>
                  <div className="pt-2 border-t"><Label className="text-xs uppercase text-slate-500">Usuário administrador da empresa</Label></div>
                  <div><Label>Nome</Label><Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} className="mt-1.5" /></div>
                  <div><Label>E-mail</Label><Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} className="mt-1.5" /></div>
                  <div><Label>Senha inicial</Label><Input type="text" value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} className="mt-1.5" /></div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button onClick={create} className="bg-sky-600 hover:bg-sky-700">Criar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Empresa</TableHead><TableHead>CNPJ</TableHead><TableHead>Criada em</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {companies.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.cnpj || "-"}</TableCell>
                  <TableCell className="font-mono text-xs">{new Date(c.created_at).toLocaleDateString("pt-BR")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
