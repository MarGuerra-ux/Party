-- ============================================================================
-- Party · migración 1  (ejecutar completa en Supabase → SQL Editor → Run)
-- Es idempotente: se puede ejecutar más de una vez sin romper nada.
-- Incluye lo que reemplaza a sql/horario.sql (no hace falta ejecutar ese).
-- ============================================================================
-- ESTADO DE CADA TABLA
--   Conectadas hoy al código ........ student_schedules, campus_rooms, notes.bg_pattern
--   Para el agente (memoria/RAG) .... agent_memory, agent_usage, note_chunks, match_note_chunks()
--   Preparada, aún sin conectar ..... subjects (hoy las asignaturas viven en el navegador)
-- SEGURIDAD
--   Party usa su propio login (tabla students), no Supabase Auth, por eso las políticas de abajo son
--   abiertas (modo demostración). Las tablas ANTERIORES del proyecto no tienen RLS: con la clave pública
--   del navegador cualquiera puede leer/escribir. Para producción hay que migrar a Supabase Auth + RLS.
-- ============================================================================

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- 0) Ajuste defensivo: el código de Apuntes lee la columna bg_pattern
-- ---------------------------------------------------------------------------
alter table public.notes add column if not exists bg_pattern text;

-- ---------------------------------------------------------------------------
-- 1) Horario del estudiante (lo guarda el módulo que lee la foto/PDF/Word)
-- ---------------------------------------------------------------------------
create table if not exists public.student_schedules (
  student_id text primary key references public.students(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2) Catálogo de salas de la sede (base para el mapa futuro)
-- ---------------------------------------------------------------------------
create table if not exists public.campus_rooms (
  code       text primary key,          -- p. ej. LC9 (sin el prefijo PA-)
  building   text not null,             -- bloque / edificio
  floor      int  not null,             -- piso
  notes      text,
  updated_at timestamptz not null default now()
);
insert into public.campus_rooms (code, building, floor, notes) values
  ('LC8',  'Bloque central', 2, 'Laboratorio de computación'),
  ('LC9',  'Bloque central', 2, 'Laboratorio de computación'),
  ('DST1', 'Segundo bloque', 5, 'Sala de los sábados (Desarrollo Cloud Native I)')
on conflict (code) do update set building = excluded.building, floor = excluded.floor, notes = excluded.notes, updated_at = now();

-- ---------------------------------------------------------------------------
-- 3) Asignaturas del estudiante (preparada; hoy se guardan en el navegador)
-- ---------------------------------------------------------------------------
create table if not exists public.subjects (
  id         text primary key,
  student_id text not null references public.students(id) on delete cascade,
  name       text not null,
  code       text,                      -- p. ej. BDY1103
  section    text,                      -- p. ej. 002V
  teacher    text,
  room       text,
  icon       text default 'book',
  color      text default 'violet',
  pct        int  not null default 0 check (pct between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists subjects_student_idx on public.subjects(student_id);

-- ---------------------------------------------------------------------------
-- 4) Agente · registro de uso de tokens (una fila por llamada a un modelo)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_usage (
  id           bigint generated always as identity primary key,
  student_id   text,
  session_id   text,
  stage        text,                    -- planificar | responder
  provider     text not null,
  model        text not null,
  level        text,                    -- 1_rapido | 2_equilibrado | 3_razonamiento | vision
  tokens_in    int,
  tokens_out   int,
  tokens_total int  not null default 0,
  exact        boolean not null default false,   -- true si el proveedor informó el total
  created_at   timestamptz not null default now()
);
create index if not exists agent_usage_student_idx on public.agent_usage(student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5) Agente · memoria de largo plazo (hechos que el usuario pidió recordar)
--    embedding: búsqueda semántica (768 dimensiones, p. ej. gemini-embedding-001)
-- ---------------------------------------------------------------------------
create table if not exists public.agent_memory (
  id         bigint generated always as identity primary key,
  student_id text not null,
  content    text not null,
  embedding  vector(768),
  created_at timestamptz not null default now(),
  unique (student_id, content)
);
create index if not exists agent_memory_student_idx on public.agent_memory(student_id);

-- ---------------------------------------------------------------------------
-- 6) Fragmentos de apuntes con embeddings (recuperación semántica / RAG)
-- ---------------------------------------------------------------------------
create table if not exists public.note_chunks (
  id          bigint generated always as identity primary key,
  note_id     text not null references public.notes(id) on delete cascade,
  chunk_index int  not null,
  content     text not null,
  embedding   vector(768),
  created_at  timestamptz not null default now(),
  unique (note_id, chunk_index)
);
create index if not exists note_chunks_note_idx on public.note_chunks(note_id);
create index if not exists note_chunks_embedding_idx on public.note_chunks using hnsw (embedding vector_cosine_ops);

-- Búsqueda por significado: los fragmentos más parecidos a una consulta (distancia coseno)
create or replace function public.match_note_chunks(
  query_embedding vector(768),
  match_count     int  default 5,
  p_group_id      text default null
)
returns table (id bigint, note_id text, content text, similarity float)
language sql stable as $$
  select c.id, c.note_id, c.content, 1 - (c.embedding <=> query_embedding) as similarity
  from public.note_chunks c
  join public.notes n on n.id = c.note_id
  where c.embedding is not null
    and (p_group_id is null or n.group_id = p_group_id)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------------------------------------------------------------------------
-- Políticas (modo demostración: abiertas; ver nota de seguridad arriba)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['student_schedules','campus_rooms','subjects','agent_usage','agent_memory','note_chunks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists demo_all on public.%I', t);
    execute format('create policy demo_all on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;
