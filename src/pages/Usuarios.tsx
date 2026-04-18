import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Users as UsersIcon, ShieldCheck, Shield, User, Ban, KeyRound, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Role = "admin" | "employee" | "system_admin";

interface ApiUser {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned_until: string | null;
  roles: Role[];
}

const roleLabel: Record<Role, string> = {
  admin: "Administrador",
  employee: "Vendedor",
  system_admin: "Admin do Sistema",
};

const roleIcon: Record<Role, JSX.Element> = {
  admin: <ShieldCheck className="h-3.5 w-3.5" />,
  employee: <User className="h-3.5 w-3.5" />,
  system_admin: <Shield className="h-3.5 w-3.5" />,
};

const Usuarios = () => {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [confirmBan, setConfirmBan] = useState<{ user: ApiUser; ban: boolean } | null>(null);
  const [confirmReset, setConfirmReset] = useState<ApiUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["sysadmin-users"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("list-users");
      if (error) throw error;
      return (data?.users ?? []) as ApiUser[];
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole, currentRoles }: { userId: string; newRole: Role; currentRoles: Role[] }) => {
      // Remove papéis antigos e insere o novo (1 papel por usuário no nosso modelo)
      if (currentRoles.length > 0) {
        const { error: delErr } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId);
        if (delErr) throw delErr;
      }
      const { error: insErr } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole });
      if (insErr) throw insErr;

      await supabase.from("access_logs").insert({
        user_id: me?.id ?? null,
        user_email: me?.email ?? null,
        event_type: "sensitive_action",
        action: "user.role_change",
        entity_type: "user",
        entity_id: userId,
        details: { from: currentRoles, to: newRole },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sysadmin-users"] });
      toast.success("Papel atualizado!");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const banMutation = useMutation({
    mutationFn: async ({ userId, banned }: { userId: string; banned: boolean }) => {
      const { error } = await supabase.functions.invoke("set-user-status", {
        body: { user_id: userId, banned },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sysadmin-users"] });
      toast.success("Status atualizado!");
      setConfirmBan(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmBan(null);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.functions.invoke("reset-user-password", {
        body: { email, redirect_to: `${window.location.origin}/auth` },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("E-mail de recuperação enviado!");
      setConfirmReset(null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setConfirmReset(null);
    },
  });

  const filtered = useMemo(() => {
    const t = search.toLowerCase();
    return users.filter(
      (u) =>
        (u.email ?? "").toLowerCase().includes(t) ||
        (u.full_name ?? "").toLowerCase().includes(t),
    );
  }, [users, search]);

  return (
    <AppLayout title="Usuários">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-foreground">Gestão de Usuários</h2>
        <p className="text-sm text-muted-foreground">
          Defina papéis, bloqueie acessos e envie redefinição de senha.
        </p>
      </div>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-xl bg-card shadow-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="font-semibold">Usuário</TableHead>
              <TableHead className="font-semibold">Papel</TableHead>
              <TableHead className="font-semibold">Último login</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="text-right font-semibold">Ações</TableHead>
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
                  <UsersIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  Nenhum usuário encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((u) => {
                const currentRole = (u.roles[0] ?? "employee") as Role;
                const isBanned = !!u.banned_until && new Date(u.banned_until) > new Date();
                const isMe = u.id === me?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium text-foreground">{u.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          {roleIcon[currentRole]}
                          {roleLabel[currentRole]}
                        </Badge>
                        {!isMe && (
                          <Select
                            value={currentRole}
                            onValueChange={(v) =>
                              setRoleMutation.mutate({
                                userId: u.id,
                                newRole: v as Role,
                                currentRoles: u.roles,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 w-[160px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="employee">Vendedor</SelectItem>
                              <SelectItem value="admin">Administrador</SelectItem>
                              <SelectItem value="system_admin">Admin do Sistema</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.last_sign_in_at
                        ? new Date(u.last_sign_in_at).toLocaleString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {isBanned ? (
                        <Badge variant="destructive">Bloqueado</Badge>
                      ) : (
                        <Badge className="bg-success/10 text-success border border-success/30" variant="outline">
                          Ativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => u.email && setConfirmReset(u)}
                          disabled={!u.email}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Reset senha
                        </Button>
                        {!isMe && (
                          <Button
                            size="sm"
                            variant="outline"
                            className={isBanned ? "text-success" : "text-destructive"}
                            onClick={() => setConfirmBan({ user: u, ban: !isBanned })}
                          >
                            <Ban className="h-3.5 w-3.5" />
                            {isBanned ? "Desbloquear" : "Bloquear"}
                          </Button>
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

      <AlertDialog open={!!confirmBan} onOpenChange={(o) => !o && setConfirmBan(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBan?.ban ? "Bloquear usuário?" : "Desbloquear usuário?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBan?.ban
                ? `${confirmBan?.user.email} não poderá mais acessar o sistema.`
                : `${confirmBan?.user.email} voltará a acessar o sistema normalmente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                confirmBan &&
                banMutation.mutate({ userId: confirmBan.user.id, banned: confirmBan.ban })
              }
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmReset} onOpenChange={(o) => !o && setConfirmReset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar e-mail de recuperação?</AlertDialogTitle>
            <AlertDialogDescription>
              Um link de redefinição de senha será enviado para {confirmReset?.email}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmReset?.email && resetMutation.mutate(confirmReset.email)}
            >
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default Usuarios;
