import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface Category {
  id: string;
  name: string;
}

const emptyForm = {
  name: "",
  description: "",
  price: "",
  cost: "",
  stock_quantity: "",
  min_stock_alert: "5",
  category_id: "",
};

const Produtos = () => {
  const qc = useQueryClient();
  const { user, role } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  useEffect(() => {
    if (dialogOpen) {
      setForm(emptyForm);
    } else {
      setShowNewCategory(false);
      setNewCategoryName("");
    }
  }, [dialogOpen]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        cost: form.cost ? Number(form.cost) : 0,
        stock_quantity: Number(form.stock_quantity || 0),
        min_stock_alert: Number(form.min_stock_alert || 5),
        category_id: form.category_id || null,
      };

      const { data, error } = await supabase
        .from("products")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;

      if (payload.stock_quantity > 0) {
        await supabase.from("stock_movements").insert({
          product_id: data.id,
          movement_type: "in",
          quantity: payload.stock_quantity,
          user_id: user?.id ?? null,
          notes: "Estoque inicial",
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["products-stock"] });
      toast.success("Produto cadastrado!");
      setDialogOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      if (role !== "admin") {
        throw new Error("Apenas administradores podem criar categorias.");
      }
      const { data, error } = await supabase
        .from("categories")
        .insert({ name: name.trim() })
        .select()
        .single();
      if (error) throw error;
      return data as Category;
    },
    onSuccess: (cat) => {
      qc.invalidateQueries({ queryKey: ["categories"] });
      setForm((f) => ({ ...f, category_id: cat.id }));
      setShowNewCategory(false);
      setNewCategoryName("");
      toast.success("Categoria criada!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Informe o nome do produto.");
    if (!form.price || Number(form.price) < 0) return toast.error("Preço inválido.");
    createMutation.mutate();
  };

  return (
    <AppLayout title="Cadastro de Produtos">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Cadastro de Produtos</h2>
        <p className="text-sm text-muted-foreground">
          Cadastre novos produtos no catálogo. Para movimentar estoque ou excluir, use a tela de Estoque.
        </p>
      </div>

      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 rounded-xl bg-card p-10 shadow-card">
        <div className="rounded-full bg-primary-soft p-4">
          <Package className="h-10 w-10 text-primary" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-foreground">Novo produto</h3>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Clique no botão abaixo para adicionar um produto ao catálogo (nome, preço, custo, categoria e estoque inicial).
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => setDialogOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Adicionar Produto
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo produto</DialogTitle>
            <DialogDescription>
              Cadastre um novo produto no catálogo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Coxinha de frango"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Opcional"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price">Preço (R$) *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                  placeholder="0,00"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Custo (R$)</Label>
                <Input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost}
                  onChange={(e) => setForm({ ...form, cost: e.target.value })}
                  placeholder="0,00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="stock">Estoque inicial</Label>
                <Input
                  id="stock"
                  type="number"
                  min="0"
                  value={form.stock_quantity}
                  onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="min_stock">Alerta mínimo</Label>
                <Input
                  id="min_stock"
                  type="number"
                  min="0"
                  value={form.min_stock_alert}
                  onChange={(e) => setForm({ ...form, min_stock_alert: e.target.value })}
                  placeholder="5"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              {!showNewCategory ? (
                <div className="flex gap-2">
                  <Select
                    value={form.category_id}
                    onValueChange={(v) => setForm({ ...form, category_id: v })}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Nenhuma categoria
                        </div>
                      ) : (
                        categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {role === "admin" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setShowNewCategory(true)}
                      aria-label="Nova categoria"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nome da categoria"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
                    onClick={() => createCategoryMutation.mutate(newCategoryName)}
                  >
                    Criar
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowNewCategory(false);
                      setNewCategoryName("");
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Produtos;
