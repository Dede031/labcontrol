import { useEffect, useState } from "react";
import api, { API_BASE } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Download } from "lucide-react";
import { toast } from "sonner";
import { REL } from "@/constants/testIds";

export default function Relatorios() {
  const [obras, setObras] = useState([]);
  const [obraId, setObraId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/obras").then((r) => setObras(r.data)).catch(() => {});
  }, []);

  const gerar = async () => {
    if (!obraId) return toast.error("Selecione uma obra");
    setLoading(true);
    try {
      const resp = await api.get(`/relatorios/obra/${obraId}`, { responseType: "blob" });
      const blob = new Blob([resp.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relatorio-obra.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Relatório gerado");
    } catch { toast.error("Erro ao gerar relatório"); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Relatórios PDF</h1>
        <p className="text-sm text-slate-500">Gere relatórios de ensaio de concreto por obra</p>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-lg bg-sky-100 flex items-center justify-center">
            <FileSpreadsheet className="w-5 h-5 text-sky-700" />
          </div>
          <div>
            <div className="font-display font-semibold text-slate-900">Relatório de Ensaio de Concreto</div>
            <div className="text-xs text-slate-500">Inclui todos os concretos, CPs e rupturas da obra selecionada.</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 items-end">
          <div>
            <label className="text-sm text-slate-700 font-medium">Obra</label>
            <Select value={obraId} onValueChange={setObraId}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Selecione uma obra" /></SelectTrigger>
              <SelectContent>
                {obras.map((o) => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button data-testid={REL.gerarPdf("obra")} onClick={gerar} disabled={loading} className="bg-sky-600 hover:bg-sky-700 h-10">
            <Download className="w-4 h-4 mr-2" /> {loading ? "Gerando..." : "Gerar PDF"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
