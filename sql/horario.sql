-- Tabla para guardar el horario leído (Party). Ejecutar en Supabase > SQL Editor.
create table if not exists public.student_schedules (
  student_id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.student_schedules enable row level security;
-- Política abierta para pruebas/demo (el login de Party no usa Supabase Auth). Endurecer en producción.
drop policy if exists "demo_all" on public.student_schedules;
create policy "demo_all" on public.student_schedules for all using (true) with check (true);

-- ================================================
-- Catálogo de salas de la sede (base para el mapa futuro)
-- ================================================
create table if not exists public.campus_rooms (
  code text primary key,          -- p. ej. LC9 (sin el prefijo PA-)
  building text not null,         -- bloque / edificio
  floor int not null,             -- piso
  notes text,
  updated_at timestamptz not null default now()
);
alter table public.campus_rooms enable row level security;
drop policy if exists "rooms_read" on public.campus_rooms;
create policy "rooms_read" on public.campus_rooms for select using (true);
drop policy if exists "rooms_write_demo" on public.campus_rooms;
create policy "rooms_write_demo" on public.campus_rooms for all using (true) with check (true);

insert into public.campus_rooms (code, building, floor, notes) values
  ('LC8',  'Bloque central',  2, 'Laboratorio de computación'),
  ('LC9',  'Bloque central',  2, 'Laboratorio de computación'),
  ('DST1', 'Segundo bloque',  5, 'Sala de los sábados (Desarrollo Cloud Native I)')
on conflict (code) do update set building = excluded.building, floor = excluded.floor, notes = excluded.notes, updated_at = now();
