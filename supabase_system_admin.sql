-- =====================================================================
-- SALGATUDO - SYSTEM_ADMIN + LOG DE ACESSOS
-- IMPORTANTE: rode em DUAS etapas no SQL Editor do Supabase.
--
-- ETAPA 1 (rode SOZINHA primeiro e aguarde concluir):
--   ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'system_admin';
--
-- ETAPA 2: depois rode TODO o restante deste arquivo abaixo.
-- (O Postgres exige commit do novo valor de enum antes de usá-lo em policies.)
-- =====================================================================

-- =====================================================================
-- 2) Tabela access_logs (auditoria de login/logout e ações sensíveis)
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_email TEXT,
    event_type TEXT NOT NULL,           -- 'login' | 'logout' | 'sensitive_action'
    action TEXT,                        -- ex: 'product.delete', 'sale.create'
    entity_type TEXT,                   -- ex: 'product', 'sale', 'user_role'
    entity_id TEXT,
    details JSONB,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON public.access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON public.access_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_event_type ON public.access_logs(event_type);

ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Inserção: qualquer usuário autenticado pode logar suas próprias ações
DROP POLICY IF EXISTS "access_logs_insert_own" ON public.access_logs;
CREATE POLICY "access_logs_insert_own" ON public.access_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Leitura: somente system_admin
DROP POLICY IF EXISTS "access_logs_select_sysadmin" ON public.access_logs;
CREATE POLICY "access_logs_select_sysadmin" ON public.access_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'system_admin'));

-- =====================================================================
-- 3) Atualiza policies de user_roles: system_admin gerencia papéis
-- =====================================================================
DROP POLICY IF EXISTS "user_roles_admin_all" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_own" ON public.user_roles;

CREATE POLICY "user_roles_select_self_or_managers" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'system_admin')
  );

-- Apenas system_admin pode inserir/atualizar/deletar papéis
CREATE POLICY "user_roles_sysadmin_write" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'system_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'system_admin'));

-- =====================================================================
-- 4) profiles: system_admin pode ler todos
-- =====================================================================
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_managers" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'system_admin')
  );

-- =====================================================================
-- 5) PROMOVER O PRIMEIRO SYSTEM_ADMIN
-- Substitua 'SEU_EMAIL_AQUI' pelo e-mail do usuário que deve ser system_admin.
-- =====================================================================
-- INSERT INTO public.user_roles (user_id, role)
-- SELECT id, 'system_admin' FROM auth.users WHERE email = 'SEU_EMAIL_AQUI'
-- ON CONFLICT (user_id, role) DO NOTHING;

-- =====================================================================
-- FIM
-- =====================================================================
