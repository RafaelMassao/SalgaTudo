-- =====================================================================
-- FIX: Relatório Financeiro mostrando zero
-- =====================================================================
-- Causa: a política RLS antiga ("ft_admin_all") só permitia INSERT para
-- admins. Quando atendentes (employee) fechavam vendas, o lançamento em
-- financial_transactions era bloqueado silenciosamente, deixando o
-- relatório vazio.
--
-- Solução:
--   1) Permitir que qualquer usuário autenticado INSIRA lançamentos
--      (necessário para o PDV registrar a receita da venda).
--   2) Manter SELECT / UPDATE / DELETE restritos a admin (relatório).
--   3) Backfill: gerar lançamentos para vendas antigas que ficaram sem.
--
-- Como aplicar: cole este arquivo no SQL Editor do Supabase e execute.
-- =====================================================================

DROP POLICY IF EXISTS "ft_admin_all" ON public.financial_transactions;

CREATE POLICY "ft_select_admin" ON public.financial_transactions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ft_insert_auth" ON public.financial_transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "ft_update_admin" ON public.financial_transactions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ft_delete_admin" ON public.financial_transactions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Backfill das vendas que não geraram lançamento financeiro
INSERT INTO public.financial_transactions
  (transaction_date, type, amount, description, sale_id, user_id)
SELECT s.sale_date,
       'income',
       s.total_amount,
       'Venda #' || substr(s.id::text, 1, 8) || ' (' || s.payment_method || ')',
       s.id,
       s.user_id
FROM public.sales s
LEFT JOIN public.financial_transactions ft ON ft.sale_id = s.id
WHERE ft.id IS NULL;
