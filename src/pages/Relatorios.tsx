import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

interface Tx {
  id: string;
  transaction_date: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  sale_id: string | null;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const defaultFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
};
const defaultTo = () => new Date().toISOString().slice(0, 10);

const Relatorios = () => {
  const { role, loading } = useAuth();
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  const { data: txs = [], isLoading } = useQuery({
    queryKey: ["financial-tx", from, to],
    enabled: role === "admin",
    queryFn: async () => {
      // Constrói datas em horário LOCAL (não UTC) para cobrir o dia inteiro do usuário
      const [fy, fm, fd] = from.split("-").map(Number);
      const [ty, tm, td] = to.split("-").map(Number);
      const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
      const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*")
        .gte("transaction_date", start.toISOString())
        .lte("transaction_date", end.toISOString())
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  const { income, expense, balance, byDay } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const map = new Map<string, { day: string; income: number; expense: number }>();
    for (const t of txs) {
      const v = Number(t.amount);
      const day = new Date(t.transaction_date).toISOString().slice(0, 10);
      const cur = map.get(day) ?? { day, income: 0, expense: 0 };
      if (t.type === "income") {
        inc += v;
        cur.income += v;
      } else {
        exp += v;
        cur.expense += v;
      }
      map.set(day, cur);
    }
    const arr = Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
    return {
      income: inc,
      expense: exp,
      balance: inc - exp,
      byDay: arr.map((d) => ({
        ...d,
        label: new Date(d.day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      })),
    };
  }, [txs]);

  const exportCsv = () => {
    const header = ["data", "tipo", "valor", "descricao", "sale_id"];
    const rows = txs.map((t) => [
      new Date(t.transaction_date).toISOString(),
      t.type,
      String(t.amount),
      (t.description ?? "").replace(/"/g, '""'),
      t.sale_id ?? "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-financeiro-${from}_a_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/" replace />;

  return (
    <AppLayout title="Relatórios">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Relatório Financeiro</h2>
          <p className="text-sm text-muted-foreground">
            Receitas, despesas e saldo do período. Apenas administradores.
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={txs.length === 0}>
          <Download className="h-4 w-4" /> Exportar CSV
        </Button>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Receitas</p>
            <TrendingUp className="h-5 w-5 text-success" />
          </div>
          <p className="mt-2 text-2xl font-bold text-success">{fmtBRL(income)}</p>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Despesas</p>
            <TrendingDown className="h-5 w-5 text-destructive" />
          </div>
          <p className="mt-2 text-2xl font-bold text-destructive">{fmtBRL(expense)}</p>
        </div>
        <div className="rounded-xl bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Saldo</p>
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold text-primary">{fmtBRL(balance)}</p>
        </div>
      </div>

      <div className="mb-6 rounded-xl bg-card p-4 shadow-card">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Movimento por dia</h3>
        {byDay.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Sem dados no período.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                }}
                formatter={(v: number) => fmtBRL(v)}
              />
              <Bar dataKey="income" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" name="Despesas" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">Data</TableHead>
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Descrição</TableHead>
              <TableHead className="text-right font-semibold">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : txs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">
                  Sem lançamentos no período.
                </TableCell>
              </TableRow>
            ) : (
              txs.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(t.transaction_date).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        t.type === "income"
                          ? "border-success/30 bg-success/10 text-success"
                          : "border-destructive/30 bg-destructive/10 text-destructive"
                      }
                    >
                      {t.type === "income" ? "Receita" : "Despesa"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.description ?? (t.sale_id ? "Venda" : "—")}
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold ${
                      t.type === "income" ? "text-success" : "text-destructive"
                    }`}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {fmtBRL(Number(t.amount))}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppLayout>
  );
};

export default Relatorios;
