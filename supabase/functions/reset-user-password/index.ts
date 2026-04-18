// Edge Function: reset-user-password
// Dispara e-mail de recuperação de senha. Apenas system_admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: rolesCheck } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const isSysAdmin = (rolesCheck ?? []).some((r) => r.role === "system_admin");
    if (!isSysAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, redirect_to } = await req.json() as {
      email: string;
      redirect_to?: string;
    };
    if (!email) {
      return new Response(JSON.stringify({ error: "email_required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gera link de recovery (Supabase envia o e-mail automaticamente se SMTP estiver configurado)
    const { error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: redirect_to ? { redirectTo: redirect_to } : undefined,
    });
    if (error) throw error;

    await admin.from("access_logs").insert({
      user_id: user.id,
      user_email: user.email,
      event_type: "sensitive_action",
      action: "user.password_reset",
      entity_type: "user",
      details: { target_email: email },
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reset-user-password error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
