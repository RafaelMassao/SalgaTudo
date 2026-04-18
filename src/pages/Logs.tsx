import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ScrollText, LogIn, LogOut as LogOutIcon, AlertCircle, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface AccessLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  event_type: "login" | "logout" | "sensitive_action";
  action: string | null;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

const eventBadge = (e: AccessLog["event_type"]) => {
  if (e === "login")
    return <Badge className="gap-1 bg-success/10 text-success border-success/30" variant="outline"><LogIn className="h-3 w-3" /> Login</Badge>;
  if (e === "logout")
    return <Badge className="gap-1" variant="outline"><LogOutIcon className="h-3 w-3" /> Logout</Badge>;
  return <Badge className="gap-1 bg-warning/10 text-warning border-warning/30" variant="outline"><AlertCircle className="h-3 w-3" /> Ação</Badge>;
};

const Logs = () => {
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["access-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AccessLog[];
    },
  });

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return logs.filter((l) => {
      if (eventFilter !== "all" && l.event_type !== eventFilter) return false;
      if (!t) return true;
      return (
        (l.user_email ?? "").toLowerCase().includes(t) ||
        (l.action ?? "").toLowerCase().includes(t) ||
        (l.entity_type ?? "").toLowerCase().includes(t)
      );
    });
  }, [logs, search, eventFilter]);

  return (
    <AppLayout title="Logs de Acesso">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Logs de Acesso</h2>
        <p className="text-sm text-muted-foreground">
          Auditoria de logins, logouts e ações sensíveis (últimos 500 eventos).
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por e-mail, ação..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            <SelectItem value="login">Logins</SelectItem>
            <SelectItem value="logout">Logouts</SelectItem>
            <SelectItem value="sensitive_action">Ações sensíveis</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">Data/hora</TableHead>
              <TableHead className="font-semibold">Usuário</TableHead>
              <TableHead className="font-semibold">Evento</TableHead>
              <TableHead className="font-semibold">Ação</TableHead>
              <TableHead className="font-semibold">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">
                  <ScrollText className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Nenhum log encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-sm">{l.user_email ?? "—"}</TableCell>
                  <TableCell>{eventBadge(l.event_type)}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {l.action ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                    {l.entity_type && (
                      <span className="mr-2 rounded bg-muted px-1.5 py-0.5">
                        {l.entity_type}
                      </span>
                    )}
                    {l.details ? JSON.stringify(l.details) : ""}
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

export default Logs;
