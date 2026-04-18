import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { SystemAdminRoute } from "@/components/SystemAdminRoute";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Produtos from "./pages/Produtos.tsx";
import Vendas from "./pages/Vendas.tsx";
import Estoque from "./pages/Estoque.tsx";
import Historico from "./pages/Historico.tsx";
import Clientes from "./pages/Clientes.tsx";
import Relatorios from "./pages/Relatorios.tsx";
import Usuarios from "./pages/Usuarios.tsx";
import Logs from "./pages/Logs.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/produtos"
              element={
                <AdminRoute>
                  <Produtos />
                </AdminRoute>
              }
            />
            <Route
              path="/vendas"
              element={
                <ProtectedRoute>
                  <Vendas />
                </ProtectedRoute>
              }
            />
            <Route
              path="/estoque"
              element={
                <ProtectedRoute>
                  <Estoque />
                </ProtectedRoute>
              }
            />
            <Route
              path="/historico"
              element={
                <ProtectedRoute>
                  <Historico />
                </ProtectedRoute>
              }
            />
            <Route
              path="/clientes"
              element={
                <ProtectedRoute>
                  <Clientes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/relatorios"
              element={
                <AdminRoute>
                  <Relatorios />
                </AdminRoute>
              }
            />
            <Route
              path="/usuarios"
              element={
                <SystemAdminRoute>
                  <Usuarios />
                </SystemAdminRoute>
              }
            />
            <Route
              path="/logs"
              element={
                <SystemAdminRoute>
                  <Logs />
                </SystemAdminRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
