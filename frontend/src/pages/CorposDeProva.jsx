import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gauge, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { CP } from "@/constants/testIds";

export default function CorposDeProva() {
  const [items, setItems] = useState([]);
  const [obras, setObras] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialVencidos = searchParams.get("vencidos") === "1";
  const [vencidos, setVencidos] = useState(initialVencidos);
  const [statusF, setStatusF] = useState(initialVencidos ? "Pendente" : "todos");
  const [obraF, setObraF] = useState("todas");

  const load = async () => {
    const params = {};
    if (vencidos) params.vencidos_only = true;
    else if (statusF !== "todos") params.status = statusF;
    if (obraF !== "todas") params.obra_id = obraF;
    const [c, o] = await Promise.all([
      api.get("/cps", { params }),
      api.get("/obras"),
    ]);
    setItems(c.data);
    setObras(o.data);
  };
  useEffect(() => { load(); }, [statusF, obraF, vencidos]);

  const toggleVencidos = () => {
    const v = !vencidos;
    setVencidos(v);
    if (v) setSearchParams({ vencidos: "1" });
    else setSearchParams({});
  };

  const del = async (id) => {
    if (!window.confirm("Remover este CP?")) return;
    await api.delete(`/cps/${id}`);
    toast.success("Removido");
    load();
  };

  const statusBadge = (s) => {
    if (s === "Pendente") return "bg-amber-100 text-amber-800 hover:bg-amber-100";
    if (s === "Rompido") return "bg-emerald-100 text-emerald-800 hover:bg-emerald-100";
    return "bg-slate-100 text-slate-700 hover:bg-slate-100";
  };

  const isOverdue = (cp) => {
    if (cp.status !== "Pendente") return false;
    return new Date(cp.data_prevista_ruptura) <= new Date();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Corpos de Prova</h1>
          <p className="text-sm text-slate-500">Acompanhe a moldagem e ruptura dos CPs por série</p>
        </div>
        {vencidos && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
            <AlertTriangle className="w-4 h-4" />
            Exibindo apenas CPs pendentes com prazo vencido/hoje
          </div>
        )}
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <Select value={obraF} onValueChange={setObraF}>
            <SelectTrigger className="sm:w-64"><SelectValue placeholder="Obra" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as obras</SelectItem>
              {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusF} onValueChange={(v) => { setStatusF(v); setVencidos(false); setSearchParams({}); }} disabled={vencidos}>
            <SelectTrigger className="sm:w-48"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="Pendente">Pendente</SelectItem>
              <SelectItem value="Rompido">Rompido</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={vencidos ? "default" : "outline"}
            className={vencidos ? "bg-red-600 hover:bg-red-700" : ""}
            onClick={toggleVencidos}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            {vencidos ? "Todos" : "Apenas vencidos"}
          </Button>
        </div>
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>CP</TableHead>
              <TableHead>Série</TableHead>
              <TableHead>Obra</TableHead>
              <TableHead>Nota fiscal</TableHead>
              <TableHead>Idade</TableHead>
              <TableHead>Data prevista</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>MPa</TableHead>
              <TableHead>Validação</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((cp) => (
              <TableRow key={cp.id} data-testid={CP.row(cp.id)} className={isOverdue(cp) ? "bg-red-50/40" : ""}>
                <TableCell className="font-mono font-medium">{cp.identificacao}</TableCell>
                <TableCell className="font-mono text-xs">{cp.serie_label || "-"}</TableCell>
                <TableCell className="text-sm text-slate-600">{cp.obra_nome}</TableCell>
                <TableCell className="font-mono text-xs">{cp.nota_fiscal || "-"}</TableCell>
                <TableCell className="font-mono">{cp.idade}d</TableCell>
                <TableCell className={`font-mono text-xs ${isOverdue(cp) ? "text-red-700 font-semibold" : ""}`}>
                  {new Date(cp.data_prevista_ruptura).toLocaleDateString("pt-BR")}
                </TableCell>
                <TableCell><Badge className={statusBadge(cp.status)}>{cp.status}</Badge></TableCell>
                <TableCell className="font-mono">{cp.resistencia_mpa ? `${cp.resistencia_mpa} MPa` : "-"}</TableCell>
                <TableCell>
                  {cp.validacao_status ? (
                    <Badge className={
                      cp.validacao_status === "Validado" ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" :
                      cp.validacao_status === "Rejeitado" ? "bg-red-100 text-red-800 hover:bg-red-100" :
                      "bg-sky-100 text-sky-800 hover:bg-sky-100"
                    }>{cp.validacao_status}</Badge>
                  ) : <span className="text-slate-400 text-xs">-</span>}
                </TableCell>
                <TableCell className="text-right">
                  {cp.status === "Pendente" && (
                    <Link to={`/ruptura?cp=${cp.id}`}>
                      <Button data-testid={CP.ruptura(cp.id)} variant="outline" size="sm">
                        <Gauge className="w-4 h-4 mr-1" /> Romper
                      </Button>
                    </Link>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => del(cp.id)}>
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">Nenhum CP encontrado</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </Card>
    </div>
  );
}
