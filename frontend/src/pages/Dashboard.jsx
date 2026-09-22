import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import {
  Building2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Wrench,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const cardStyles = {
  obras: { bg: "bg-blue-50", border: "border-blue-200", icon: "bg-blue-500", text: "text-blue-900" },
  ensaios: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "bg-emerald-500", text: "text-emerald-900" },
  cps: { bg: "bg-amber-50", border: "border-amber-200", icon: "bg-amber-500", text: "text-amber-900" },
  pendentes: { bg: "bg-red-50", border: "border-red-200", icon: "bg-red-500", text: "text-red-900" },
  calib: { bg: "bg-purple-50", border: "border-purple-200", icon: "bg-purple-500", text: "text-purple-900" },
};

function KpiCard({ label, value, icon: Icon, styleKey, link }) {
  const s = cardStyles[styleKey];
  return (
    <Link to={link} className={`block rounded-xl border p-4 sm:p-5 ${s.bg} ${s.border} hover:shadow-md transition-shadow`}>
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${s.icon} flex items-center justify-center text-white`}>
          <Icon className="w-5 h-5" />
        </div>
        <ArrowRight className={`w-4 h-4 ${s.text} opacity-40`} />
      </div>
      <div className="mt-3">
        <div className={`text-xs font-medium ${s.text} opacity-80`}>{label}</div>
        <div className={`text-3xl font-extrabold font-mono tabular-nums ${s.text} mt-1`}>{value}</div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard").then((r) => setData(r.data)).catch(() => {});
  }, []);

  const k = data?.kpis || {};
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Visão geral do controle tecnológico</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <KpiCard label="Obras ativas" value={k.obras_ativas ?? 0} icon={Building2} styleKey="obras" link="/obras" />
        <KpiCard label="Ensaios realizados" value={k.ensaios_realizados ?? 0} icon={CheckCircle2} styleKey="ensaios" link="/ruptura" />
        <KpiCard label="CPs aguardando ruptura" value={k.cps_aguardando_ruptura ?? 0} icon={Clock} styleKey="cps" link="/corpos-de-prova" />
        <KpiCard label="Resultados pendentes" value={k.resultados_pendentes ?? 0} icon={AlertTriangle} styleKey="pendentes" link="/ruptura" />
        <KpiCard label="Calibrações próximas" value={k.calibracoes_proximas ?? 0} icon={Wrench} styleKey="calib" link="/equipamentos" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-900">Obras recentes</h3>
            <Link to="/obras" className="text-xs text-sky-600 hover:text-sky-700 font-medium">
              Ver todas →
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obra</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.obras_recentes || []).map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.nome}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{o.cliente}</TableCell>
                  <TableCell className="text-slate-600 text-xs">{o.cidade}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      {o.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {(!data?.obras_recentes || data.obras_recentes.length === 0) && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-slate-400 py-6">
                    Nenhuma obra ainda. <Link to="/obras" className="text-sky-600">Cadastrar</Link>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-slate-900">Próximos vencimentos</h3>
            <Link to="/equipamentos" className="text-xs text-sky-600 hover:text-sky-700 font-medium">
              Ver todos →
            </Link>
          </div>
          <div className="space-y-2">
            {(data?.proximos_vencimentos || []).map((e) => {
              const dias = e.dias_restantes;
              let badge = "bg-emerald-100 text-emerald-800";
              let label = `${dias} dias`;
              if (dias == null) label = "-";
              else if (dias < 0) { badge = "bg-red-100 text-red-800"; label = `Venc. há ${-dias}d`; }
              else if (dias <= 30) badge = "bg-amber-100 text-amber-800";
              return (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-slate-300">
                  <div>
                    <div className="text-sm font-medium text-slate-900">{e.nome}</div>
                    <div className="text-xs text-slate-500 font-mono">
                      {e.proxima_calibracao ? new Date(e.proxima_calibracao).toLocaleDateString("pt-BR") : "-"}
                    </div>
                  </div>
                  <Badge className={`${badge} hover:${badge}`}>{label}</Badge>
                </div>
              );
            })}
            {(!data?.proximos_vencimentos || data.proximos_vencimentos.length === 0) && (
              <div className="text-center text-sm text-slate-400 py-6">Sem equipamentos cadastrados.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
