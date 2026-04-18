import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Loader2,
  Check,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Product = {
  id: string;
  name: string;
  price: number;
  stock_quantity: number;
  min_stock_alert: number;
  category_id: string | null;
};

type Customer = { id: string; name: string; phone: string | null };

type CartItem = {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  stock_quantity: number;
};

type PaymentMethod = "dinheiro" | "pix" | "cartao_debito" | "cartao_credito";

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const Vendas = () => {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("none");
  const [payment, setPayment] = useState<PaymentMethod>("dinheiro");
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Scroll do carrinho com indicadores
  const cartListRef = useRef<HTMLDivElement>(null);
  const [showTopHint, setShowTopHint] = useState(false);
  const [showBottomHint, setShowBottomHint] = useState(false);

  const recomputeHints = () => {
    const el = cartListRef.current;
    if (!el) return;
    setShowTopHint(el.scrollTop > 4);
    setShowBottomHint(el.scrollTop + el.clientHeight < el.scrollHeight - 4);
  };

  useEffect(() => {
    // Após mudança no carrinho, rola para o final e recalcula hints
    const el = cartListRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    recomputeHints();
  }, [cart.length]);

  const scrollCart = (dir: "up" | "down") => {
    const el = cartListRef.current;
    if (!el) return;
    el.scrollBy({ top: dir === "down" ? 120 : -120, behavior: "smooth" });
  };

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products-pdv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,price,stock_quantity,min_stock_alert,category_id")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,phone")
        .order("name");
      if (error) throw error;
      return data as Customer[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, search]);

  const total = useMemo(
    () => cart.reduce((sum, i) => sum + i.unit_price * i.quantity, 0),
    [cart],
  );
  const itemsCount = useMemo(
    () => cart.reduce((s, i) => s + i.quantity, 0),
    [cart],
  );

  const addToCart = (p: Product) => {
    if (p.stock_quantity <= 0) {
      toast.error("Sem estoque disponível");
      return;
    }
    setCart((prev) => {
      const ex = prev.find((i) => i.product_id === p.id);
      if (ex) {
        if (ex.quantity >= p.stock_quantity) {
          toast.warning("Quantidade máxima em estoque atingida");
          return prev;
        }
        return prev.map((i) =>
          i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          product_id: p.id,
          name: p.name,
          unit_price: Number(p.price),
          quantity: 1,
          stock_quantity: p.stock_quantity,
        },
      ];
    });
  };

  const changeQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => {
          if (i.product_id !== id) return i;
          const next = i.quantity + delta;
          if (next > i.stock_quantity) {
            toast.warning("Quantidade maior que o estoque");
            return i;
          }
          return { ...i, quantity: next };
        })
        .filter((i) => i.quantity > 0),
    );
  };

  const removeItem = (id: string) =>
    setCart((prev) => prev.filter((i) => i.product_id !== id));

  const clear = () => {
    setCart([]);
    setCustomerId("none");
    setPayment("dinheiro");
  };

  const finalize = useMutation({
    mutationFn: async () => {
      if (cart.length === 0) throw new Error("Carrinho vazio");
      if (!user) throw new Error("Usuário não autenticado");

      // 1) cria sale
      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          total_amount: total,
          payment_method: payment,
          customer_id: customerId === "none" ? null : customerId,
          user_id: user.id,
        })
        .select("id")
        .single();
      if (saleErr) throw saleErr;

      // 2) sale_items
      const items = cart.map((i) => ({
        sale_id: sale.id,
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        subtotal: i.unit_price * i.quantity,
      }));
      const { error: itemsErr } = await supabase.from("sale_items").insert(items);
      if (itemsErr) throw itemsErr;

      // 3) baixa de estoque (movement + update)
      for (const i of cart) {
        const newStock = i.stock_quantity - i.quantity;
        const { error: upErr } = await supabase
          .from("products")
          .update({ stock_quantity: newStock, updated_at: new Date().toISOString() })
          .eq("id", i.product_id);
        if (upErr) throw upErr;

        await supabase.from("stock_movements").insert({
          product_id: i.product_id,
          movement_type: "out",
          quantity: i.quantity,
          user_id: user.id,
          notes: `Venda #${sale.id.slice(0, 8)}`,
        });
      }

      // 4) lançamento financeiro (income) — pode falhar silenciosamente se usuário não for admin (RLS)
      const { error: ftErr } = await supabase.from("financial_transactions").insert({
        type: "income",
        amount: total,
        description: `Venda #${sale.id.slice(0, 8)} (${payment})`,
        sale_id: sale.id,
        user_id: user.id,
      });
      if (ftErr) {
        // não bloqueia a venda — apenas avisa no console
        console.warn("Lançamento financeiro não registrado:", ftErr.message);
      }

      // Log da ação sensível
      await supabase.from("access_logs").insert({
        user_id: user.id,
        user_email: user.email,
        event_type: "sensitive_action",
        action: "sale.create",
        entity_type: "sale",
        entity_id: sale.id,
        details: { total, payment, items: cart.length },
        user_agent: navigator.userAgent,
      });

      return sale.id;
    },
    onSuccess: (saleId) => {
      toast.success(`Venda #${saleId.slice(0, 8)} finalizada!`);
      qc.invalidateQueries({ queryKey: ["products-pdv"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      setConfirmOpen(false);
      clear();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppLayout title="Vendas (PDV)">
      <div className="grid gap-6 lg:grid-cols-[1fr_480px] xl:grid-cols-[1fr_520px]">
        {/* Coluna produtos */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vendas (PDV)</h1>
            <p className="text-sm text-muted-foreground">
              Selecione os produtos e finalize a venda.
            </p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto..."
              className="pl-9"
            />
          </div>

          <ScrollArea className="max-h-[calc(100vh-260px)] pr-2">
            {loadingProducts ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-sm text-muted-foreground">
                Nenhum produto encontrado.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => {
                  const out = p.stock_quantity <= 0;
                  const low =
                    !out && p.stock_quantity <= p.min_stock_alert;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={out}
                      onClick={() => addToCart(p)}
                      className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary hover:shadow-orange-sm disabled:opacity-50"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <h3 className="line-clamp-2 text-sm font-semibold text-foreground">
                          {p.name}
                        </h3>
                        {out ? (
                          <Badge variant="destructive" className="shrink-0 text-[10px]">
                            Esgotado
                          </Badge>
                        ) : low ? (
                          <Badge className="shrink-0 bg-warning text-warning-foreground text-[10px]">
                            Baixo
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-auto flex w-full items-end justify-between">
                        <span className="text-base font-bold text-primary">
                          {formatBRL(Number(p.price))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {p.stock_quantity} un
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Carrinho */}
        <Card className="flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Carrinho
              {itemsCount > 0 && (
                <Badge className="ml-auto bg-primary text-primary-foreground">
                  {itemsCount}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="flex-1 overflow-hidden p-0">
            {cart.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                Nenhum item no carrinho.
              </div>
            ) : (
              <div className="relative">
                {/* Indicador topo */}
                {showTopHint && (
                  <button
                    type="button"
                    onClick={() => scrollCart("up")}
                    className="absolute left-1/2 top-1 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-primary shadow-sm hover:bg-primary-soft"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    Mais itens acima
                  </button>
                )}

                <div
                  ref={cartListRef}
                  onScroll={recomputeHints}
                  className="cart-scroll max-h-[42vh] min-h-[220px] space-y-3 overflow-y-auto px-4 py-3"
                >
                  {cart.map((i, idx) => (
                    <div
                      key={i.product_id}
                      className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Item {idx + 1}
                          </p>
                          <p className="line-clamp-2 text-sm font-medium text-foreground">
                            {i.name}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {formatBRL(i.unit_price)} ·{" "}
                            <span className="font-semibold text-foreground">
                              {formatBRL(i.unit_price * i.quantity)}
                            </span>
                          </p>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          onClick={() => removeItem(i.product_id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-1.5 self-end">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => changeQty(i.product_id, -1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold">
                          {i.quantity}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-8 w-8"
                          onClick={() => changeQty(i.product_id, 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Indicador rodapé */}
                {showBottomHint && (
                  <button
                    type="button"
                    onClick={() => scrollCart("down")}
                    className="absolute bottom-1 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-primary shadow-sm hover:bg-primary-soft"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    Mais itens abaixo
                  </button>
                )}
              </div>
            )}
          </CardContent>

          <Separator />

          <CardFooter className="flex flex-col gap-3 p-4">
            <div className="grid w-full grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Cliente
                </label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cliente</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Pagamento
                </label>
                <Select
                  value={payment}
                  onValueChange={(v) => setPayment(v as PaymentMethod)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="cartao_debito">Cartão Débito</SelectItem>
                    <SelectItem value="cartao_credito">Cartão Crédito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex w-full items-center justify-between rounded-lg bg-primary-soft px-3 py-2">
              <span className="text-sm font-medium text-foreground">Total</span>
              <span className="text-2xl font-extrabold text-primary">
                {formatBRL(total)}
              </span>
            </div>

            <div className="flex w-full gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={clear}
                disabled={cart.length === 0 || finalize.isPending}
              >
                Limpar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
              onClick={() => setConfirmOpen(true)}
                disabled={cart.length === 0 || finalize.isPending}
              >
                {finalize.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Finalizar
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* Diálogo: extrato para confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar venda</DialogTitle>
            <DialogDescription>
              Revise o extrato antes de finalizar. Após confirmar, o estoque será
              baixado e a venda registrada.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60">
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="w-16 text-center">Qtd</TableHead>
                  <TableHead className="w-24 text-right">Unit.</TableHead>
                  <TableHead className="w-28 text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cart.map((i) => (
                  <TableRow key={i.product_id}>
                    <TableCell className="font-medium">{i.name}</TableCell>
                    <TableCell className="text-center">{i.quantity}</TableCell>
                    <TableCell className="text-right">
                      {formatBRL(i.unit_price)}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatBRL(i.unit_price * i.quantity)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="font-medium text-foreground">
                {customerId === "none"
                  ? "Sem cliente"
                  : customers.find((c) => c.id === customerId)?.name ?? "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Pagamento</p>
              <p className="font-medium text-foreground">
                {
                  {
                    dinheiro: "Dinheiro",
                    pix: "PIX",
                    cartao_debito: "Cartão Débito",
                    cartao_credito: "Cartão Crédito",
                  }[payment]
                }
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-primary-soft px-4 py-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {itemsCount} {itemsCount === 1 ? "item" : "itens"}
              </p>
              <p className="text-sm font-medium text-foreground">Total a pagar</p>
            </div>
            <span className="text-2xl font-extrabold text-primary">
              {formatBRL(total)}
            </span>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={finalize.isPending}
            >
              Voltar e revisar
            </Button>
            <Button
              variant="primary"
              onClick={() => finalize.mutate()}
              disabled={finalize.isPending}
            >
              {finalize.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Confirmar e finalizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Vendas;
