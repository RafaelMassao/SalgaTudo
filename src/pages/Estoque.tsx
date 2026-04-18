import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Settings2, Search, Boxes, History } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

type MovementType = "in" | "out" | "adjustment";

interface Product {
  id: string;
  name: string;
  stock_quantity: number;
  min_stock_alert: number;
  categories?: { name: string } | null;
}

interface Movement {
  id: string;
  product_id: string | null;
  movement_type: MovementType;
  quantity: number;
  movement_date: string;
  notes: string | null;
  products?: { name: string } | null;
}

const movementLabel: Record<MovementType, string> = {
  in: "Entrada",
  out: "Saída",
  adjustment: "Ajuste",
};

const Estoque = () => {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [type, setType] = useState<MovementType>("in");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, stock_quantity, min_stock_alert, categories(name)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["stock-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_movements")
        .select("*, products(name)")
        .order("movement_date", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Movement[];
    },
  });

  const moveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Selecione um produto.");
      const n = Number(qty);
      if (!n || n <= 0) throw new Error("Quantidade inválida.");

      let delta = 0;
      let newStock = selected.stock_quantity;
      if (type === "in") {
        delta = n;
        newStock += n;
      } else if (type === "out") {
        if (n > selected.stock_quantity) throw new Error("Estoque insuficiente.");
        delta = -n;
        newStock -= n;
      } else {
        // adjustment: qty é o NOVO valor absoluto
        delta = n - selected.stock_quantity;
        newStock = n;
      }

      const { error: upErr } = await supabase
        .from("products")
        .update({ stock_quantity: newStock })
        .eq("id", selected.id);
      if (upErr) throw upErr;

      const { error: mvErr } = await supabase.from("stock_movements").insert({
        product_id: selected.id,
        movement_type: type,
        quantity: delta,
        user_id: user?.id ?? null,
        notes: notes.trim() || null,
      });
      if (mvErr) throw mvErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard-low-stock"] });
      toast.success("Movimentação registrada!");
      setDialogOpen(false);
      setSelected(null);
      setQty("");
      setNotes("");
      setType("in");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );

  const openMovement = (p: Product, t: MovementType) => {
    setSelected(p);
    setType(t);
    setQty(t === "adjustment" ? String(p.stock_quantity) : "");
    setNotes("");
    setDialogOpen(true);
  };

  return (
    <AppLayout title="Estoque">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Estoque</h2>
        <p className="text-sm text-muted-foreground">
          Registre entradas, saídas e ajustes manuais. Veja o histórico de movimentações.
        </p>
      </div>

      <Tabs defaultValue="produtos" className="w-full">
        <TabsList>
          <TabsTrigger value="produtos">
            <Boxes className="mr-2 h-4 w-4" /> Produtos
          </TabsTrigger>
          <TabsTrigger value="historico">
            <History className="mr-2 h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="produtos" className="mt-4">
          <div className="relative mb-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="font-semibold">Categoria</TableHead>
                  <TableHead className="text-right font-semibold">Estoque</TableHead>
                  <TableHead className="text-right font-semibold">Mín.</TableHead>
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
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      Nenhum produto.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((p) => {
                    const isLow = p.stock_quantity <= p.min_stock_alert;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.categories?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant="outline"
                            className={
                              isLow
                                ? "border-destructive/30 bg-destructive/10 text-destructive"
                                : "border-success/30 bg-success/10 text-success"
                            }
                          >
                            {p.stock_quantity} un
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {p.min_stock_alert}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openMovement(p, "in")}
                              className="text-success hover:text-success"
                            >
                              <ArrowUpCircle className="h-4 w-4" /> Entrada
                            </Button>
                            {isAdmin && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openMovement(p, "out")}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <ArrowDownCircle className="h-4 w-4" /> Saída
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openMovement(p, "adjustment")}
                                >
                                  <Settings2 className="h-4 w-4" /> Ajuste
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <div className="overflow-hidden rounded-xl bg-card shadow-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="font-semibold">Data</TableHead>
                  <TableHead className="font-semibold">Produto</TableHead>
                  <TableHead className="font-semibold">Tipo</TableHead>
                  <TableHead className="text-right font-semibold">Qtde</TableHead>
                  <TableHead className="font-semibold">Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                      Nenhuma movimentação registrada.
                    </TableCell>
                  </TableRow>
                ) : (
                  movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(m.movement_date).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="font-medium">
                        {m.products?.name ?? "—"}
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
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected ? `${movementLabel[type]} — ${selected.name}` : "Movimentação"}
            </DialogTitle>
            <DialogDescription>
              {type === "adjustment"
                ? "Informe a NOVA quantidade total em estoque."
                : "Informe a quantidade movimentada."}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              moveMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) => setType(v as MovementType)}
                disabled={!isAdmin}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Entrada (+)</SelectItem>
                  {isAdmin && <SelectItem value="out">Saída (−)</SelectItem>}
                  {isAdmin && (
                    <SelectItem value="adjustment">Ajuste (definir total)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qty">
                {type === "adjustment" ? "Novo total em estoque" : "Quantidade"}
              </Label>
              <Input
                id="qty"
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
                autoFocus
              />
              {selected && (
                <p className="text-xs text-muted-foreground">
                  Estoque atual: {selected.stock_quantity} un
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observação</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Opcional"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={moveMutation.isPending}>
                {moveMutation.isPending ? "Salvando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Estoque;
