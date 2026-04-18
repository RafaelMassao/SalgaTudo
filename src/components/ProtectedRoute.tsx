import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ReactNode } from "react";

const SYSTEM_ADMIN_ROUTES = ["/usuarios", "/logs"];

export const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // system_admin não acessa rotas operacionais
  if (role === "system_admin" && !SYSTEM_ADMIN_ROUTES.includes(location.pathname)) {
    return <Navigate to="/usuarios" replace />;
  }

  return <>{children}</>;
};
