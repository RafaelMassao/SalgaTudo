// Helper para registrar eventos no access_logs
import { supabase } from "@/integrations/supabase/client";

type LogParams = {
  event_type: "login" | "logout" | "sensitive_action";
  action?: string;
  entity_type?: string;
  entity_id?: string;
  details?: Record<string, unknown>;
};

export const logAccess = async (params: LogParams) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("access_logs").insert({
      user_id: user.id,
      user_email: user.email,
      event_type: params.event_type,
      action: params.action ?? null,
      entity_type: params.entity_type ?? null,
      entity_id: params.entity_id ?? null,
      details: params.details ?? null,
      user_agent: navigator.userAgent,
    });
  } catch (e) {
    // não bloqueia a UX
    console.warn("logAccess falhou:", e);
  }
};
