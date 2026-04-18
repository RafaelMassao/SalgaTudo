import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "admin" | "employee" | "system_admin";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchRole = (userId: string) => {
    // Defer para evitar deadlock com onAuthStateChange
    setTimeout(async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const roles = (data ?? []).map((item) => item.role as AppRole);
      const resolvedRole = roles.includes("system_admin")
        ? "system_admin"
        : roles.includes("admin")
          ? "admin"
          : "employee";

      setRole(resolvedRole);
    }, 0);
  };

  useEffect(() => {
    // 1) Listener PRIMEIRO
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        fetchRole(newSession.user.id);
      } else {
        setRole(null);
      }
    });

    // 2) Depois pega sessão atual
    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) fetchRole(existing.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) {
      // Log de login (não bloqueia)
      try {
        const { data: { user: u } } = await supabase.auth.getUser();
        if (u) {
          await supabase.from("access_logs").insert({
            user_id: u.id,
            user_email: u.email,
            event_type: "login",
            user_agent: navigator.userAgent,
          });
        }
      } catch (_) { /* ignore */ }
    }
    return { error };
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: fullName ? { full_name: fullName } : undefined,
      },
    });
    return { error };
  };

  const signOut = async () => {
    // Log de logout antes de encerrar a sessão
    try {
      if (user) {
        await supabase.from("access_logs").insert({
          user_id: user.id,
          user_email: user.email,
          event_type: "logout",
          user_agent: navigator.userAgent,
        });
      }
    } catch (_) { /* ignore */ }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
};
