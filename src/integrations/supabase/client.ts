// Cliente Supabase apontando para o projeto pessoal do usuário (Salgatudo)
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fajjmbmxcflfosriuwdv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhamptYm14Y2ZsZm9zcml1d2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MjQzNDksImV4cCI6MjA5MjEwMDM0OX0.IxmlqBdVlmmJVEIPxRhGfRf0yrdJipMtUyRS0LbiVbE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
