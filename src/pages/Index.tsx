import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import {
  ShoppingCart,
  Package,
  AlertTriangle,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const StatCard = ({
  label,
  value,
  icon: Icon,
  accent,
  loading,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "primary" | "success" | "destructive";
  loading?: boolean;
}) => {
  const colorMap = {
    primary: "text-primary bg-primary-soft",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
  } as const;
  const c = colorMap[accent ?? "primary"];

  return (
    <div className="rounded-xl bg-card p-5 shadow-card transition-all hover:shadow-orange-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-extrabold text-primary">
            {loading ? <Loader2 className="h-7 w-7 animate-spin" /> : value}
          </p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${c}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
};

const startOfTodayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

const Index = () => {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  // Vendas de hoje (com itens p/ contar unidades)
  const { data: salesToday, isLoading: loadingSales } = useQuery({
    queryKey: ["dashboard-sales-today", isAdmin, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = startOfTodayISO();
      let q = supabase
        .from("sales")
        .select("id,total_amount,user_id,sale_items(quantity)")
        .gte("sale_date", since);
      if (!isAdmin && user?.id) q = q.eq("user_id", user.id);
      const { data, error } = await q;
      if (error) throw error;
      return data as Array<{
        id: string;
        total_amount: number;
        user_id: string | null;
        sale_items: { quantity: number }[];
      }>;
    },
  });

  // Produtos com estoque baixo (compara em JS já que RLS permite leitura)
  const { data: lowStock, isLoading: loadingLow } = useQuery({
    queryKey: ["dashboard-low-stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,stock_quantity,min_stock_alert")
        .order("stock_quantity", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter(
        (p) => p.stock_quantity <= p.min_stock_alert,
      );
    },
  });

  const totalRevenue =
    salesToday?.reduce((s, v) => s + Number(v.total_amount), 0) ?? 0;
  const salesCount = salesToday?.length ?? 0;
  const itemsSold =
    salesToday?.reduce(
      (s, v) => s + v.sale_items.reduce((a, i) => a + i.quantity, 0),
      0,
    ) ?? 0;
  const avgTicket = salesCount > 0 ? totalRevenue / salesCount : 0;

  return (
    <AppLayout title="Dashboard">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">
          Olá, <span className="text-primary">{user?.email?.split("@")[0]}</span> 👋
        </h2>
        <p className="text-sm text-muted-foreground">
          Aqui está o resumo da sua salgateria hoje.
          {role === "admin" && (
            <span className="ml-1 font-medium text-primary">(Administrador)</span>
          )}
        </p>
      </div>

      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
          isAdmin ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        {isAdmin && (
          <StatCard
            label="Faturamento hoje"
            value={formatBRL(totalRevenue)}
            icon={ShoppingCart}
            accent="primary"
            loading={loadingSales}
          />
        )}
        <StatCard
          label={isAdmin ? "Vendas hoje" : "Minhas vendas hoje"}
          value={String(salesCount)}
          icon={TrendingUp}
          accent="success"
          loading={loadingSales}
        />
        <StatCard
          label="Itens vendidos"
          value={String(itemsSold)}
          icon={Package}
          accent="success"
          loading={loadingSales}
        />
        <StatCard
          label="Ticket médio"
          value={formatBRL(avgTicket)}
          icon={TrendingUp}
          accent="primary"
          loading={loadingSales}
        />
      </div>

      {/* Estoque baixo */}
      <div className="mt-8 rounded-xl bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="font-semibold text-foreground">Produtos com estoque baixo</h3>
          </div>
          {!loadingLow && (
            <Badge
              className={
                (lowStock?.length ?? 0) > 0
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-success text-success-foreground"
              }
            >
              {lowStock?.length ?? 0}
            </Badge>
          )}
        </div>

        {loadingLow ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (lowStock?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Tudo certo! Nenhum produto abaixo do mínimo. ✅
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {lowStock!.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="font-medium text-foreground">{p.name}</span>
                <span className="text-muted-foreground">
                  <strong className="text-destructive">{p.stock_quantity}</strong>{" "}
                  / mín. {p.min_stock_alert}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppLayout>
  );
};

export default Index;
