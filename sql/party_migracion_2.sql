-- ============================================================================
-- Party · migración 2  (ejecutar completa en Supabase → SQL Editor → Run)
-- Idempotente: se puede ejecutar más de una vez.
-- Objetivo: que nada quede SOLO en el navegador.
--   party_docs ........ documentos pequeños por estudiante (asignaturas, conversaciones del asistente,
--                       PPT y eventos de apuntes, etiqueta de unidades) y los metadatos + texto indexado
--                       de la Biblioteca (kind = 'library_node').
--   bucket party-library  los archivos de la Biblioteca (PDF, Word, imágenes…).
-- SEGURIDAD: Party usa su propio login (tabla students), no Supabase Auth, así que las políticas son
--   abiertas (modo demostración), igual que en la migración 1. Para producción: Supabase Auth + RLS.
-- ============================================================================

create table if not exists public.party_docs (
  student_id text        not null references public.students(id) on delete cascade,
  kind       text        not null,         -- p. ej. party_asignaturas, party_conversations, library_node
  id         text        not null,         -- 'v' para valores únicos; id del nodo para la biblioteca
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (student_id, kind, id)
);
create index if not exists party_docs_student_kind on public.party_docs (student_id, kind);

alter table public.party_docs enable row level security;
drop policy if exists demo_all on public.party_docs;
create policy demo_all on public.party_docs for all using (true) with check (true);

-- Archivos de la Biblioteca
insert into storage.buckets (id, name, public)
values ('party-library', 'party-library', false)
on conflict (id) do nothing;

drop policy if exists party_library_all on storage.objects;
create policy party_library_all on storage.objects for all
  using (bucket_id = 'party-library') with check (bucket_id = 'party-library');

-- Espejo del registro de consultas del agente (% de consultas sin tokens)
create table if not exists public.agent_queries (
  id          bigserial primary key,
  student_id  text,
  session_id  text,
  via         text not null,               -- reglas | reglas_cliente | llm | sin_cupo | cancelado
  tokens      int  not null default 0,
  provider    text,
  model       text,
  tier        text,
  orchestration text,
  created_at  timestamptz not null default now()
);
create index if not exists agent_queries_student on public.agent_queries (student_id, created_at desc);
alter table public.agent_queries enable row level security;
drop policy if exists demo_all on public.agent_queries;
create policy demo_all on public.agent_queries for all using (true) with check (true);
