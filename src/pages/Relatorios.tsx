import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  TrendingUp,
  TrendingDown,
  Wallet,
  Wallet2,
  Boxes,
  ShoppingBag,
  Percent,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

// ---------- Tipos ----------
interface Tx {
  id: string;
  transaction_date: string;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  sale_id: string | null;
}

interface Movement {
  id: string;
  movement_date: string;
  movement_type: "in" | "out" | "adjustment";
  quantity: number;
  notes: string | null;
  products?: { name: string; categories?: { name: string } | null } | null;
}

interface SaleItemRow {
  quantity: number;
  unit_price: number;
  subtotal: number;
  products?: {
    id: string;
    name: string;
    cost: number | null;
    categories?: { name: string } | null;
  } | null;
  sales?: { sale_date: string; payment_method: string } | null;
}

// ---------- Utils ----------
const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const defaultFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
};
const defaultTo = () => new Date().toISOString().slice(0, 10);

const movementLabel = { in: "Entrada", out: "Saída", adjustment: "Ajuste" } as const;

const downloadCsv = (filename: string, header: string[], rows: (string | number)[][]) => {
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Paleta para gráficos pizza (semantic tokens)
const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--destructive))",
  "hsl(var(--accent))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--secondary))",
];

const Relatorios = () => {
  const { role, loading } = useAuth();
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());

  // Constrói intervalo local
  const range = useMemo(() => {
    const [fy, fm, fd] = from.split("-").map(Number);
    const [ty, tm, td] = to.split("-").map(Number);
    const start = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const end = new Date(ty, tm - 1, td, 23, 59, 59, 999);
    return { startISO: start.toISOString(), endISO: end.toISOString() };
  }, [from, to]);

  // ===== Financeiro =====
  const { data: txs = [], isLoading: loadingTx } = useQuery({
    queryKey: ["financial-tx", from, to],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_transactions")
        .select("*")
        .gte("transaction_date", range.startISO)
        .lte("transaction_date", range.endISO)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tx[];
    },
  });

  // ===== Movimentações de estoque =====
  const [moveType, setMoveType] = useState<"all" | "in" | "out" | "adjustment">("all");
  const { data: movements = [], isLoading: loadingMov } = useQuery({
    queryKey: ["report-movements", from, to],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name, categories(name))")
        .gte("movement_date", range.startISO)
        .lte("movement_date", range.endISO)
        .order("movement_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Movement[];
    },
  });

  // ===== Itens de venda (vendas + lucratividade) =====
  const { data: saleItems = [], isLoading: loadingSI } = useQuery({
    queryKey: ["report-sale-items", from, to],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select(
          "quantity, unit_price, subtotal, products(id, name, cost, categories(name)), sales!inner(sale_date, payment_method)",
        )
        .gte("sales.sale_date", range.startISO)
        .lte("sales.sale_date", range.endISO);
      if (error) throw error;
      return (data ?? []) as unknown as SaleItemRow[];
    },
  });

  // ---------- Cálculos: Financeiro ----------
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
        label: new Date(d.day).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
      })),
    };
  }, [txs]);

  // ---------- Cálculos: Movimentações ----------
  const filteredMovements = useMemo(
    () => (moveType === "all" ? movements : movements.filter((m) => m.movement_type === moveType)),
    [movements, moveType],
  );

  const movementTotals = useMemo(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalAdj = 0;
    for (const m of movements) {
      if (m.movement_type === "in") totalIn += m.quantity;
      else if (m.movement_type === "out") totalOut += Math.abs(m.quantity);
      else totalAdj += 1;
    }
    return { totalIn, totalOut, totalAdj };
  }, [movements]);

  // ---------- Cálculos: Vendas ----------
  const salesAggregates = useMemo(() => {
    const byProduct = new Map<
      string,
      { name: string; qty: number; revenue: number }
    >();
    const byCategory = new Map<string, { name: string; revenue: number }>();
    const byPayment = new Map<string, { name: string; revenue: number }>();
    let totalRevenue = 0;
    let totalQty = 0;

    for (const it of saleItems) {
      const qty = Number(it.quantity);
      const sub = Number(it.subtotal);
      totalRevenue += sub;
      totalQty += qty;

      const pName = it.products?.name ?? "—";
      const pKey = it.products?.id ?? pName;
      const cur = byProduct.get(pKey) ?? { name: pName, qty: 0, revenue: 0 };
      cur.qty += qty;
      cur.revenue += sub;
      byProduct.set(pKey, cur);

      const catName = it.products?.categories?.name ?? "Sem categoria";
      const c = byCategory.get(catName) ?? { name: catName, revenue: 0 };
      c.revenue += sub;
      byCategory.set(catName, c);

      const pm = it.sales?.payment_method ?? "—";
      const p = byPayment.get(pm) ?? { name: pm, revenue: 0 };
      p.revenue += sub;
      byPayment.set(pm, p);
    }

    const topProducts = Array.from(byProduct.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const categories = Array.from(byCategory.values()).sort(
      (a, b) => b.revenue - a.revenue,
    );
    const payments = Array.from(byPayment.values()).sort(
      (a, b) => b.revenue - a.revenue,
    );

    return { topProducts, categories, payments, totalRevenue, totalQty };
  }, [saleItems]);

  // ---------- Cálculos: Lucratividade ----------
  const profitability = useMemo(() => {
    const map = new Map<
      string,
      { name: string; qty: number; revenue: number; cost: number; profit: number }
    >();
    let totalRevenue = 0;
    let totalCost = 0;

    for (const it of saleItems) {
      const qty = Number(it.quantity);
      const sub = Number(it.subtotal);
      const unitCost = Number(it.products?.cost ?? 0);
      const cost = unitCost * qty;

      totalRevenue += sub;
      totalCost += cost;

      const name = it.products?.name ?? "—";
      const key = it.products?.id ?? name;
      const cur = map.get(key) ?? { name, qty: 0, revenue: 0, cost: 0, profit: 0 };
      cur.qty += qty;
      cur.revenue += sub;
      cur.cost += cost;
      cur.profit = cur.revenue - cur.cost;
      map.set(key, cur);
    }

    const rows = Array.from(map.values()).sort((a, b) => b.profit - a.profit);
    const totalProfit = totalRevenue - totalCost;
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    return { rows, totalRevenue, totalCost, totalProfit, margin };
  }, [saleItems]);

  // ---------- Exports ----------
  const exportFinancial = () =>
    downloadCsv(
      `relatorio-financeiro-${from}_a_${to}.csv`,
      ["data", "tipo", "valor", "descricao", "sale_id"],
      txs.map((t) => [
        new Date(t.transaction_date).toISOString(),
        t.type,
        t.amount,
        t.description ?? "",
        t.sale_id ?? "",
      ]),
    );

  const exportMovements = () =>
    downloadCsv(
      `relatorio-movimentacoes-${from}_a_${to}.csv`,
      ["data", "tipo", "produto", "categoria", "quantidade", "observacao"],
      filteredMovements.map((m) => [
        new Date(m.movement_date).toISOString(),
        movementLabel[m.movement_type],
        m.products?.name ?? "—",
        m.products?.categories?.name ?? "—",
        m.quantity,
        m.notes ?? "",
      ]),
    );

  const exportSales = () =>
    downloadCsv(
      `relatorio-vendas-${from}_a_${to}.csv`,
      ["produto", "quantidade", "receita"],
      salesAggregates.topProducts.map((p) => [p.name, p.qty, p.revenue.toFixed(2)]),
    );

  const exportProfit = () =>
    downloadCsv(
      `relatorio-lucratividade-${from}_a_${to}.csv`,
      ["produto", "qtd_vendida", "receita", "custo", "lucro", "margem_%"],
      profitability.rows.map((r) => [
        r.name,
        r.qty,
        r.revenue.toFixed(2),
        r.cost.toFixed(2),
        r.profit.toFixed(2),
        r.revenue > 0 ? ((r.profit / r.revenue) * 100).toFixed(1) : "0",
      ]),
    );

  if (loading) return null;
  if (role !== "admin") return <Navigate to="/" replace />;

  return (
    <AppLayout title="Relatórios">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Relatórios</h2>
        <p className="text-sm text-muted-foreground">
          Análises do período selecionado. Apenas administradores.
        </p>
      </div>

      {/* Filtro de período global */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      <Tabs defaultValue="financeiro" className="w-full">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="financeiro">
            <Wallet2 className="mr-2 h-4 w-4" /> Financeiro
          </TabsTrigger>
          <TabsTrigger value="movimentacoes">
            <Boxes className="mr-2 h-4 w-4" /> Movimentações
          </TabsTrigger>
          <TabsTrigger value="vendas">
            <ShoppingBag className="mr-2 h-4 w-4" /> Vendas
          </TabsTrigger>
          <TabsTrigger value="lucratividade">
            <Percent className="mr-2 h-4 w-4" /> Lucratividade
          </TabsTrigger>
        </TabsList>

        {/* ===================== FINANCEIRO ===================== */}
        <TabsContent value="financeiro" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button variant="outline" onClick={exportFinancial} disabled={txs.length === 0}>
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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

          <div className="rounded-xl bg-card p-4 shadow-card">
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
                  <Legend />
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
                {loadingTx ? (
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
        </TabsContent>

        {/* ===================== MOVIMENTAÇÕES ===================== */}
        <TabsContent value="movimentacoes" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="w-full max-w-xs">
              <Label>Tipo</Label>
              <Select value={moveType} onValueChange={(v) => setMoveType(v as typeof moveType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="in">Entradas</SelectItem>
                  <SelectItem value="out">Saídas</SelectItem>
                  <SelectItem value="adjustment">Ajustes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={exportMovements}
              disabled={filteredMovements.length === 0}
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Total de Entradas</p>
              <p className="mt-2 text-2xl font-bold text-success">+{movementTotals.totalIn} un</p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Total de Saídas</p>
              <p className="mt-2 text-2xl font-bold text-destructive">
                −{movementTotals.totalOut} un
              </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Ajustes</p>
              <p className="mt-2 text-2xl font-bold text-primary">{movementTotals.totalAdj}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold">Data</TableHead>
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="font-semibold">Categoria</TableHead>
                  <TableHead className="font-semibold">Tipo</TableHead>
                  <TableHead className="text-right font-semibold">Qtde</TableHead>
                  <TableHead className="font-semibold">Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingMov ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : filteredMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      Nenhuma movimentação no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(m.movement_date).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-medium">{m.products?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {m.products?.categories?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            m.movement_type === "in"
                              ? "border-success/30 bg-success/10 text-success"
                              : m.movement_type === "out"
                                ? "border-destructive/30 bg-destructive/10 text-destructive"
                                : "border-primary/30 bg-primary/10 text-primary"
                          }
                        >
                          {movementLabel[m.movement_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.notes ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ===================== VENDAS ===================== */}
        <TabsContent value="vendas" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={exportSales}
              disabled={salesAggregates.topProducts.length === 0}
            >
              <Download className="h-4 w-4" /> Exportar Top Produtos
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Receita total (vendas)</p>
              <p className="mt-2 text-2xl font-bold text-success">
                {fmtBRL(salesAggregates.totalRevenue)}
              </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Itens vendidos</p>
              <p className="mt-2 text-2xl font-bold text-primary">{salesAggregates.totalQty}</p>
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 shadow-card">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              Top 10 produtos (por receita)
            </h3>
            {loadingSI ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : salesAggregates.topProducts.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Sem vendas no período.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={salesAggregates.topProducts} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={140}
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                    formatter={(v: number) => fmtBRL(v)}
                  />
                  <Bar dataKey="revenue" name="Receita" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Por categoria</h3>
              {salesAggregates.categories.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={salesAggregates.categories}
                      dataKey="revenue"
                      nameKey="name"
                      outerRadius={90}
                      label={(e) => e.name}
                    >
                      {salesAggregates.categories.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-xl bg-card p-4 shadow-card">
              <h3 className="mb-3 text-sm font-semibold text-foreground">Por forma de pagamento</h3>
              {salesAggregates.payments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={salesAggregates.payments}
                      dataKey="revenue"
                      nameKey="name"
                      outerRadius={90}
                      label={(e) => e.name}
                    >
                      {salesAggregates.payments.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="text-right font-semibold">Qtd vendida</TableHead>
                  <TableHead className="text-right font-semibold">Receita</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesAggregates.topProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="py-12 text-center text-muted-foreground">
                      Sem vendas no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  salesAggregates.topProducts.map((p) => (
                    <TableRow key={p.name}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono">{p.qty}</TableCell>
                      <TableCell className="text-right font-semibold text-success">
                        {fmtBRL(p.revenue)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ===================== LUCRATIVIDADE ===================== */}
        <TabsContent value="lucratividade" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={exportProfit}
              disabled={profitability.rows.length === 0}
            >
              <Download className="h-4 w-4" /> Exportar CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Receita</p>
              <p className="mt-2 text-2xl font-bold text-success">
                {fmtBRL(profitability.totalRevenue)}
              </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Custo</p>
              <p className="mt-2 text-2xl font-bold text-destructive">
                {fmtBRL(profitability.totalCost)}
              </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Lucro</p>
              <p
                className={`mt-2 text-2xl font-bold ${
                  profitability.totalProfit >= 0 ? "text-success" : "text-destructive"
                }`}
              >
                {fmtBRL(profitability.totalProfit)}
              </p>
            </div>
            <div className="rounded-xl bg-card p-4 shadow-card">
              <p className="text-sm text-muted-foreground">Margem</p>
              <p className="mt-2 text-2xl font-bold text-primary">
                {profitability.margin.toFixed(1)}%
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="text-right font-semibold">Qtd</TableHead>
                  <TableHead className="text-right font-semibold">Receita</TableHead>
                  <TableHead className="text-right font-semibold">Custo</TableHead>
                  <TableHead className="text-right font-semibold">Lucro</TableHead>
                  <TableHead className="text-right font-semibold">Margem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSI ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      Carregando...
                    </TableCell>
                  </TableRow>
                ) : profitability.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                      Sem vendas no período.
                    </TableCell>
                  </TableRow>
                ) : (
                  profitability.rows.map((r) => {
                    const margin = r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0;
                    return (
                      <TableRow key={r.name}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right font-mono">{r.qty}</TableCell>
                        <TableCell className="text-right">{fmtBRL(r.revenue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {fmtBRL(r.cost)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-semibold ${
                            r.profit >= 0 ? "text-success" : "text-destructive"
                          }`}
                        >
                          {fmtBRL(r.profit)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-primary">
                          {margin.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <p className="text-xs text-muted-foreground">
            * Lucro calculado como (preço × qtd) − (custo × qtd) usando o custo cadastrado no
            produto. Produtos sem custo aparecem como 100% de margem.
          </p>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default Relatorios;
