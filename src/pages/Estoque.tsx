import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDownCircle, ArrowUpCircle, Settings2, Search, Boxes, History, Trash2, Pencil } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  description?: string | null;
  price?: number;
  cost?: number;
  stock_quantity: number;
  min_stock_alert: number;
  category_id?: string | null;
  categories?: { name: string } | null;
}

interface Category {
  id: string;
  name: string;
}

const emptyEditForm = {
  name: "",
  description: "",
  price: "",
  cost: "",
  stock_quantity: "0",
  min_stock_alert: "5",
  category_id: "",
};

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
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState(emptyEditForm);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price, cost, stock_quantity, min_stock_alert, category_id, categories(name)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
    enabled: isAdmin,
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

  const deleteMutation = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
      await supabase.from("access_logs").insert({
        user_id: user?.id ?? null,
        user_email: user?.email ?? null,
        event_type: "sensitive_action",
        action: "product.delete",
        entity_type: "product",
        entity_id: product.id,
        details: { name: product.name },
        user_agent: navigator.userAgent,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard-low-stock"] });
      toast.success("Produto excluído!");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) throw new Error("Produto não selecionado.");
      if (!editForm.name.trim()) throw new Error("Informe o nome.");
      const priceNum = Number(editForm.price);
      if (Number.isNaN(priceNum) || priceNum < 0) throw new Error("Preço inválido.");
      const newStock = Number(editForm.stock_quantity);
      if (Number.isNaN(newStock) || newStock < 0) throw new Error("Estoque inválido.");

      const payload = {
        name: editForm.name.trim(),
        description: editForm.description.trim() || null,
        price: priceNum,
        cost: editForm.cost ? Number(editForm.cost) : 0,
        stock_quantity: newStock,
        min_stock_alert: Number(editForm.min_stock_alert || 0),
        category_id: editForm.category_id || null,
      };
      const { error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", editTarget.id);
      if (error) throw error;

      const delta = newStock - editTarget.stock_quantity;
      if (delta !== 0) {
        await supabase.from("stock_movements").insert({
          product_id: editTarget.id,
          movement_type: "adjustment",
          quantity: delta,
          user_id: user?.id ?? null,
          notes: "Ajuste via edição de produto",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products-stock"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["dashboard-low-stock"] });
      toast.success("Produto atualizado!");
      setEditTarget(null);
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

  const openEdit = (p: Product) => {
    setEditForm({
      name: p.name,
      description: p.description ?? "",
      price: p.price != null ? String(p.price) : "",
      cost: p.cost != null ? String(p.cost) : "",
      stock_quantity: String(p.stock_quantity ?? 0),
      min_stock_alert: String(p.min_stock_alert ?? 5),
      category_id: p.category_id ?? "",
    });
    setEditTarget(p);
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
          {isAdmin && (
            <TabsTrigger value="historico">
              <History className="mr-2 h-4 w-4" /> Histórico
            </TabsTrigger>
          )}
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
                                  size="icon"
                                  variant="outline"
                                  onClick={() => openEdit(p)}
                                  aria-label="Editar produto"
                                  title="Editar produto"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  onClick={() => setDeleteTarget(p)}
                                  className="text-destructive hover:text-destructive"
                                  aria-label="Excluir produto"
                                  title="Excluir produto"
                                >
                                  <Trash2 className="h-4 w-4" />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  O produto <strong>{deleteTarget.name}</strong> será removido do catálogo.
                  Esta ação é permanente e as vendas anteriores deste produto também serão removidas.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:brightness-110"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar produto</DialogTitle>
            <DialogDescription>
              Atualize os dados do produto. Alterar a quantidade gera uma movimentação de ajuste no histórico.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              editMutation.mutate();
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome *</Label>
              <Input
                id="edit-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-price">Preço (R$) *</Label>
                <Input
                  id="edit-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.price}
                  onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-cost">Custo (R$)</Label>
                <Input
                  id="edit-cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.cost}
                  onChange={(e) => setEditForm({ ...editForm, cost: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-stock">Estoque (un)</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  min="0"
                  value={editForm.stock_quantity}
                  onChange={(e) => setEditForm({ ...editForm, stock_quantity: e.target.value })}
                />
                {editTarget && (
                  <p className="text-xs text-muted-foreground">
                    Atual: {editTarget.stock_quantity} un
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-min">Alerta mínimo</Label>
                <Input
                  id="edit-min"
                  type="number"
                  min="0"
                  value={editForm.min_stock_alert}
                  onChange={(e) => setEditForm({ ...editForm, min_stock_alert: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2 col-span-2">
                <Label>Categoria</Label>
                <Select
                  value={editForm.category_id || "__none__"}
                  onValueChange={(v) =>
                    setEditForm({ ...editForm, category_id: v === "__none__" ? "" : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={editMutation.isPending}>
                {editMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Estoque;
