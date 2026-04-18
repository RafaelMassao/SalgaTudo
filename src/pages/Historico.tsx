import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Receipt, Eye } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Sale {
  id: string;
  sale_date: string;
  total_amount: number;
  payment_method: string;
  customer_id: string | null;
  user_id: string | null;
  customers?: { name: string } | null;
}

interface SaleItem {
  id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products?: { name: string } | null;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Historico = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payment, setPayment] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["sales-history", from, to, payment, isAdmin, user?.id],
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("*, customers(name)")
        .order("sale_date", { ascending: false })
        .limit(500);
      if (!isAdmin && user?.id) q = q.eq("user_id", user.id);
      if (from) {
        const [y, m, d] = from.split("-").map(Number);
        q = q.gte("sale_date", new Date(y, m - 1, d, 0, 0, 0, 0).toISOString());
      }
      if (to) {
        const [y, m, d] = to.split("-").map(Number);
        q = q.lte("sale_date", new Date(y, m - 1, d, 23, 59, 59, 999).toISOString());
      }
      if (payment !== "all") q = q.eq("payment_method", payment);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Sale[];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["sale-items", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("*, products(name)")
        .eq("sale_id", openId!);
      if (error) throw error;
      return (data ?? []) as unknown as SaleItem[];
    },
  });

  const filtered = sales.filter((s) => {
    if (!search) return true;
    const t = search.toLowerCase();
    return (
      s.customers?.name?.toLowerCase().includes(t) ||
      s.payment_method.toLowerCase().includes(t) ||
      s.id.toLowerCase().includes(t)
    );
  });

  const total = filtered.reduce((acc, s) => acc + Number(s.total_amount), 0);
  const opened = sales.find((s) => s.id === openId);

  return (
    <AppLayout title="Histórico de Vendas">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Histórico de Vendas</h2>
        <p className="text-sm text-muted-foreground">
          {isAdmin
            ? "Filtre por período e forma de pagamento. Clique em uma venda para ver os itens."
            : "Mostrando apenas as suas vendas. Filtre por período e pagamento."}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="space-y-1">
          <Label>De</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Até</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Pagamento</Label>
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="dinheiro">Dinheiro</SelectItem>
              <SelectItem value="pix">PIX</SelectItem>
              <SelectItem value="debito">Débito</SelectItem>
              <SelectItem value="credito">Crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Busca</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cliente, pagamento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="rounded-lg bg-card px-4 py-2 shadow-card">
          <p className="text-xs text-muted-foreground">Vendas</p>
          <p className="text-lg font-bold">{filtered.length}</p>
        </div>
        <div className="rounded-lg bg-card px-4 py-2 shadow-card">
          <p className="text-xs text-muted-foreground">Faturamento</p>
          <p className="text-lg font-bold text-primary">{fmtBRL(total)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">Data</TableHead>
              <TableHead className="font-semibold">Cliente</TableHead>
              <TableHead className="font-semibold">Pagamento</TableHead>
              <TableHead className="text-right font-semibold">Total</TableHead>
              <TableHead className="text-right font-semibold">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Receipt className="h-8 w-8 opacity-40" />
                    <p>Nenhuma venda encontrada.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(s.sale_date).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>{s.customers?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {s.payment_method}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-primary">
                    {fmtBRL(Number(s.total_amount))}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setOpenId(s.id)}>
                      <Eye className="h-4 w-4" /> Detalhes
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da venda</DialogTitle>
            <DialogDescription>
              {opened &&
                `${new Date(opened.sale_date).toLocaleString("pt-BR")} • ${opened.payment_method}`}
            </DialogDescription>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead className="text-right">Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell>{it.products?.name ?? "—"}</TableCell>
                  <TableCell className="text-right">{it.quantity}</TableCell>
                  <TableCell className="text-right">{fmtBRL(Number(it.unit_price))}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {fmtBRL(Number(it.subtotal))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {opened && (
            <div className="flex justify-between border-t pt-3 text-base font-bold">
              <span>Total</span>
              <span className="text-primary">{fmtBRL(Number(opened.total_amount))}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Historico;
