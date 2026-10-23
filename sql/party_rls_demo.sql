-- ============================================================================
-- Party · RLS en TODAS las tablas de public (modo demostración)
-- Ejecutar completo en Supabase → SQL Editor → "Run and enable RLS".
-- Idempotente. NO cambia el comportamiento de la app.
--
-- IMPORTANTE (honestidad técnica):
--   Party usa su propio login (tabla students) y entra siempre con la clave pública (anon).
--   Por eso las políticas son abiertas: activan RLS pero NO aíslan a un estudiante de otro.
--   Seguridad real = migrar el login a Supabase Auth y reemplazar demo_all por políticas
--   del tipo:  using (student_id = auth.uid()::text)  /  pertenencia al grupo.
--   Ver la sección "Hoja de ruta de seguridad" del informe.
--
-- Revertir (volver al estado anterior):
--   do $$ declare t text; begin
--     for t in select tablename from pg_tables where schemaname='public' loop
--       execute format('drop policy if exists demo_all on public.%I', t);
--       execute format('alter table public.%I disable row level security', t);
--     end loop; end $$;
-- ============================================================================

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists demo_all on public.%I', t);
    execute format('create policy demo_all on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;

-- Verificación: todas deben salir en true
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
