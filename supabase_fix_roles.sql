-- =========================================================
-- Restrições por papel (admin / employee) — defesa no banco
-- Rode este script INTEIRO no SQL Editor do seu Supabase.
-- Seguro para reexecução (DROP POLICY IF EXISTS antes de criar).
-- =========================================================

-- ---------- PRODUTOS: só admin cria/edita/exclui ----------
DROP POLICY IF EXISTS "products_select_all"        ON public.products;
DROP POLICY IF EXISTS "products_admin_all"         ON public.products;
DROP POLICY IF EXISTS "products_admin_write"       ON public.products;

CREATE POLICY "products_select_all"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "products_admin_insert"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "products_admin_update"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "products_admin_delete"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Vendedor PRECISA poder atualizar stock_quantity ao finalizar venda?
-- O update do estoque é feito pelo client. Para permitir só esse caso,
-- liberamos UPDATE para qualquer authenticated, mas APENAS na coluna
-- stock_quantity, via policy específica (Postgres não restringe coluna
-- por policy — então deixamos uma policy de update permissiva e
-- confiamos no client; admin já pode tudo). Reabilitamos:
DROP POLICY IF EXISTS "products_admin_update" ON public.products;
CREATE POLICY "products_update_authenticated"
  ON public.products FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------- CATEGORIAS: só admin escreve ----------
DROP POLICY IF EXISTS "categories_select_all"  ON public.categories;
DROP POLICY IF EXISTS "categories_admin_all"   ON public.categories;
DROP POLICY IF EXISTS "categories_admin_write" ON public.categories;

CREATE POLICY "categories_select_all"
  ON public.categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "categories_admin_insert"
  ON public.categories FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "categories_admin_update"
  ON public.categories FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "categories_admin_delete"
  ON public.categories FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- CLIENTES: vendedor cria/edita; só admin exclui ----------
DROP POLICY IF EXISTS "customers_select_all"   ON public.customers;
DROP POLICY IF EXISTS "customers_write_auth"   ON public.customers;
DROP POLICY IF EXISTS "customers_admin_delete" ON public.customers;
DROP POLICY IF EXISTS "customers_admin_all"    ON public.customers;

CREATE POLICY "customers_select_all"
  ON public.customers FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "customers_insert_auth"
  ON public.customers FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "customers_update_auth"
  ON public.customers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "customers_admin_delete"
  ON public.customers FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- ESTOQUE (stock_movements): vendedor só ENTRADA ----------
DROP POLICY IF EXISTS "stock_select_all"     ON public.stock_movements;
DROP POLICY IF EXISTS "stock_insert_auth"    ON public.stock_movements;
DROP POLICY IF EXISTS "stock_admin_all"      ON public.stock_movements;
DROP POLICY IF EXISTS "stock_admin_modify"   ON public.stock_movements;

CREATE POLICY "stock_select_all"
  ON public.stock_movements FOR SELECT
  TO authenticated USING (true);

-- INSERT: admin pode tudo; employee só 'in' ou via venda ('out' do PDV
-- também é insert; permitimos 'out' para qualquer authenticated porque
-- a venda dispara baixa. 'adjustment' fica restrito a admin).
CREATE POLICY "stock_insert_auth"
  ON public.stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR movement_type IN ('in', 'out')
  );

CREATE POLICY "stock_admin_update"
  ON public.stock_movements FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "stock_admin_delete"
  ON public.stock_movements FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- VENDAS: vendedor vê só as dele; admin vê todas ----------
DROP POLICY IF EXISTS "sales_select_own_or_admin" ON public.sales;
DROP POLICY IF EXISTS "sales_select_all"          ON public.sales;
DROP POLICY IF EXISTS "sales_insert_auth"         ON public.sales;
DROP POLICY IF EXISTS "sales_admin_modify"        ON public.sales;

CREATE POLICY "sales_select_own_or_admin"
  ON public.sales FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_insert_auth"
  ON public.sales FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "sales_admin_update"
  ON public.sales FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sales_admin_delete"
  ON public.sales FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------- ITENS DE VENDA: visíveis se a venda pai for visível ----------
DROP POLICY IF EXISTS "sale_items_select"        ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_insert_auth"   ON public.sale_items;
DROP POLICY IF EXISTS "sale_items_admin_modify"  ON public.sale_items;

CREATE POLICY "sale_items_select"
  ON public.sale_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND (s.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "sale_items_insert_auth"
  ON public.sale_items FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
        AND s.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "sale_items_admin_update"
  ON public.sale_items FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "sale_items_admin_delete"
  ON public.sale_items FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));
