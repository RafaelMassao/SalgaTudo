import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  BarChart3,
  Users,
  History,
  LogOut,
  Shield,
  ScrollText,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { SalgatudoLogo } from "./SalgatudoLogo";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

type Role = "admin" | "employee" | "system_admin";

const navItems: { title: string; url: string; icon: any; roles: Role[] }[] = [
  // Operacionais (admin + employee)
  { title: "Dashboard", url: "/", icon: LayoutDashboard, roles: ["admin", "employee"] },
  { title: "Vendas (PDV)", url: "/vendas", icon: ShoppingCart, roles: ["admin", "employee"] },
  { title: "Histórico", url: "/historico", icon: History, roles: ["admin", "employee"] },
  { title: "Cadastro de Produtos", url: "/produtos", icon: Package, roles: ["admin"] },
  { title: "Estoque", url: "/estoque", icon: Boxes, roles: ["admin", "employee"] },
  { title: "Clientes", url: "/clientes", icon: Users, roles: ["admin", "employee"] },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3, roles: ["admin"] },
  // System admin
  { title: "Usuários", url: "/usuarios", icon: Shield, roles: ["system_admin"] },
  { title: "Logs", url: "/logs", icon: ScrollText, roles: ["system_admin"] },
];

const roleLabel: Record<Role, string> = {
  admin: "Administrador",
  employee: "Vendedor",
  system_admin: "Admin do Sistema",
};

export const AppSidebar = () => {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { role, signOut, user } = useAuth();

  const items = navItems.filter((i) => role && i.roles.includes(role as Role));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-5">
        <SalgatudoLogo collapsed={collapsed} />
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={collapsed ? item.title : undefined}
                    className="h-11 rounded-lg transition-all"
                  >
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="flex items-center gap-3 px-3 text-sm font-medium text-muted-foreground hover:bg-primary-soft hover:text-primary"
                      activeClassName="!bg-card !text-primary border border-primary shadow-orange-sm font-semibold"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        {!collapsed && user && (
          <div className="mb-2 px-2 text-xs">
            <p className="truncate font-medium text-foreground">{user.email}</p>
            <p className="text-muted-foreground">
              {role ? roleLabel[role as Role] : "—"}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          onClick={() => signOut()}
          className="w-full justify-start text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
};
