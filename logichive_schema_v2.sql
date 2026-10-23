-- ============================================================
-- Party — Schema v2.0
-- Cambios respecto a v1.0:
--   · Supabase Auth integrado (auth_id en students)
--   · Perfil Maestro con active_role (multillave)
--   · is_teacher en students (checkbox registro)
--   · institutions separada de careers
--   · groups.section_id opcional (alumno sin sección puede crear grupo)
--   · teacher_sections (profesor ↔ sección)
--   · poll_options separada de poll_votes (encuestas con opciones reales)
-- ============================================================


-- ============================================================
-- PASO 1: LIMPIAR TODO (orden inverso por FK)
-- ============================================================

drop table if exists poll_votes        cascade;
drop table if exists poll_options      cascade;
drop table if exists polls             cascade;
drop table if exists raffles           cascade;
drop table if exists list_items        cascade;
drop table if exists lists             cascade;
drop table if exists notes             cascade;
drop table if exists events            cascade;
drop table if exists scrum_tasks       cascade;
drop table if exists scrum_columns     cascade;
drop table if exists student_groups    cascade;
drop table if exists teacher_sections  cascade;
drop table if exists groups            cascade;
drop table if exists sections          cascade;
drop table if exists careers           cascade;
drop table if exists institutions      cascade;
drop table if exists students          cascade;


-- ============================================================
-- PASO 2: FUNCIÓN AUXILIAR — invite codes únicos
-- Genera códigos como "GRP-4X9K"
-- ============================================================

create or replace function generate_invite_code()
returns text language sql as $$
  select upper(
    substring(md5(random()::text) from 1 for 3) || '-' ||
    substring(md5(random()::text) from 1 for 4)
  );
$$;


-- ============================================================
-- PASO 3: ESTUDIANTES / USUARIOS
-- auth_id vincula con Supabase Auth (auth.users.id)
-- role:        'master' | 'admin' | 'teacher' | 'student'
-- active_role: vista activa del Maestro (igual que role para el resto)
-- is_teacher:  true si marcó el checkbox en el registro
-- ============================================================

create table students (
  id           text primary key,          -- ej: 'std_marco', 'std_abc123'
  auth_id      uuid unique,               -- FK lógica → auth.users.id (Supabase Auth)
  full_name    text not null,
  phone        text unique,               -- opcional si usa Auth
  email        text unique,
  role         text not null default 'student',
               -- 'master' | 'admin' | 'teacher' | 'student'
  active_role  text not null default 'student',
               -- vista activa — solo el Maestro la cambia
               -- para todos los demás = mismo valor que role
  is_teacher   boolean not null default false,
               -- marcado en el formulario de registro
  created_at   timestamptz default now()
);


-- ============================================================
-- PASO 4: INSTITUCIONES, CARRERAS, SECCIONES
-- Jerarquía: institution → career → section
-- Solo admin/master puede crear/editar estos registros
-- ============================================================

create table institutions (
  id          text primary key,           -- ej: 'ucn', 'usach', 'duoc'
  name        text not null,
  short_name  text not null unique,       -- ej: 'UCN', 'USACH'
  created_at  timestamptz default now()
);

create table careers (
  id             text primary key,        -- ej: 'inf', 'adm', 'ap'
  institution_id text references institutions(id) on delete cascade,
               -- null = carrera genérica sin institución
  name           text not null,
  code           text not null unique,    -- ej: 'INF', 'ADM'
  created_at     timestamptz default now()
);

create table sections (
  id          text primary key,           -- ej: 'inf_001-d'
  career_id   text not null references careers(id) on delete cascade,
  name        text not null,              -- ej: '001-D'
  created_at  timestamptz default now()
);


-- ============================================================
-- PASO 5: VÍNCULO PROFESOR ↔ SECCIÓN
-- Un profesor puede estar en N secciones
-- ============================================================

create table teacher_sections (
  id          text primary key,
  teacher_id  text not null references students(id) on delete cascade,
  section_id  text not null references sections(id) on delete cascade,
  created_at  timestamptz default now(),
  unique(teacher_id, section_id)
);


-- ============================================================
-- PASO 6: GRUPOS
-- section_id es OPCIONAL:
--   · Alumno sin sección puede crear un grupo personal
--   · Alumno con sección lo vincula a su carrera
-- ============================================================

create table groups (
  id           text primary key,
  section_id   text references sections(id) on delete set null,
               -- null = grupo sin sección (personal o cross-sección)
  owner_id     text not null references students(id) on delete restrict,
  name         text not null,
  invite_code  text not null unique default generate_invite_code(),
  is_open      boolean not null default true,
               -- true = cualquiera con el código puede unirse
               -- false = el dueño aprueba manualmente
  created_at   timestamptz default now()
);


-- ============================================================
-- PASO 7: TABLA PUENTE — alumno puede estar en N grupos
-- role: 'owner' | 'member'
-- ============================================================

create table student_groups (
  id          text primary key,
  student_id  text not null references students(id) on delete cascade,
  group_id    text not null references groups(id)   on delete cascade,
  role        text not null default 'member',
  joined_at   timestamptz default now(),
  unique(student_id, group_id)
);


-- ============================================================
-- PASO 8: SCRUM
-- position para ordenar — base para drag-and-drop futuro
-- ============================================================

create table scrum_columns (
  id          text primary key,
  group_id    text not null references groups(id) on delete cascade,
  title       text not null,
  icon        text default '',
  position    int  not null default 0,
  created_at  timestamptz default now()
);

create table scrum_tasks (
  id          text primary key,
  group_id    text not null references groups(id)        on delete cascade,
  column_id   text not null references scrum_columns(id) on delete cascade,
  title       text not null,
  description text default '',
  owner_id    text references students(id) on delete set null,
  permission  text not null default 'member',
               -- 'owner' | 'member' | 'readonly'
  position    int  not null default 0,
  created_at  timestamptz default now()
);


-- ============================================================
-- PASO 9: CALENDARIO
-- ============================================================

create table events (
  id          text primary key,
  group_id    text not null references groups(id) on delete cascade,
  owner_id    text references students(id) on delete set null,
  title       text not null,
  description text default '',
  event_date  timestamptz not null,
  type        text not null default 'general',
               -- 'prueba' | 'entrega' | 'clase' | 'reunion' | 'general'
  created_at  timestamptz default now()
);


-- ============================================================
-- PASO 10: APUNTES — estilo Google Keep
-- ============================================================

create table notes (
  id          text primary key,
  group_id    text not null references groups(id) on delete cascade,
  owner_id    text references students(id) on delete set null,
  title       text not null,
  content     text not null default '',
  color       text not null default '#111b31',
  pinned      boolean not null default false,
  created_at  timestamptz default now()
);


-- ============================================================
-- PASO 11: LISTAS — ítems chequeables estilo Keep
-- ============================================================

create table lists (
  id          text primary key,
  group_id    text not null references groups(id) on delete cascade,
  owner_id    text references students(id) on delete set null,
  title       text not null,
  created_at  timestamptz default now()
);

create table list_items (
  id          text primary key,
  list_id     text not null references lists(id) on delete cascade,
  text        text not null,
  checked     boolean not null default false,
  position    int not null default 0,
  created_at  timestamptz default now()
);


-- ============================================================
-- PASO 12: ENCUESTAS
-- Separamos opciones de votos para encuestas con N opciones
-- ============================================================

create table polls (
  id          text primary key,
  group_id    text not null references groups(id) on delete cascade,
  owner_id    text references students(id) on delete set null,
  question    text not null,
  created_at  timestamptz default now()
);

create table poll_options (
  id          text primary key,
  poll_id     text not null references polls(id) on delete cascade,
  text        text not null,              -- texto de la opción
  position    int not null default 0
);

create table poll_votes (
  id          text primary key,
  poll_id     text not null references polls(id)         on delete cascade,
  option_id   text not null references poll_options(id)  on delete cascade,
  student_id  text references students(id) on delete set null,
  created_at  timestamptz default now(),
  unique(poll_id, student_id)             -- un voto por persona por encuesta
);


-- ============================================================
-- PASO 13: SORTEOS
-- participants guardado como JSON array
-- ============================================================

create table raffles (
  id           text primary key,
  group_id     text not null references groups(id) on delete cascade,
  owner_id     text references students(id) on delete set null,
  title        text not null default 'Sorteo',
  participants text not null,             -- JSON: ["Marco","Ana","Luis"]
  winner       text,
  drawn_at     timestamptz,
  created_at   timestamptz default now()
);


-- ============================================================
-- PASO 14: ÍNDICES
-- ============================================================

create index idx_students_auth         on students(auth_id);
create index idx_students_role         on students(role);
create index idx_institutions_short    on institutions(short_name);
create index idx_careers_institution   on careers(institution_id);
create index idx_sections_career       on sections(career_id);
create index idx_teacher_sections_tch  on teacher_sections(teacher_id);
create index idx_teacher_sections_sec  on teacher_sections(section_id);
create index idx_groups_section        on groups(section_id);
create index idx_groups_invite         on groups(invite_code);
create index idx_groups_owner          on groups(owner_id);
create index idx_student_groups_std    on student_groups(student_id);
create index idx_student_groups_grp    on student_groups(group_id);
create index idx_scrum_col_group       on scrum_columns(group_id, position);
create index idx_scrum_tasks_group     on scrum_tasks(group_id, column_id);
create index idx_events_group_date     on events(group_id, event_date);
create index idx_notes_group           on notes(group_id, pinned desc, created_at desc);
create index idx_lists_group           on lists(group_id, created_at desc);
create index idx_polls_group           on polls(group_id, created_at desc);


-- ============================================================
-- PASO 15: DATOS INICIALES
-- ============================================================

-- Institución de prueba
insert into institutions (id, name, short_name) values
  ('inst_demo', 'Instituto Técnico Demo', 'DEMO');

-- Carreras (vinculadas a la institución demo)
insert into careers (id, institution_id, name, code) values
  ('inf', 'inst_demo', 'Ingeniería en Informática',  'INF'),
  ('adm', 'inst_demo', 'Administración de Empresas', 'ADM'),
  ('ap',  'inst_demo', 'Analista Programador',        'AP');

-- Secciones
insert into sections (id, career_id, name) values
  ('inf_001-d', 'inf', '001-D'),
  ('inf_002-d', 'inf', '002-D'),
  ('inf_003-v', 'inf', '003-V'),
  ('inf_004-v', 'inf', '004-V'),
  ('adm_001-d', 'adm', '001-D'),
  ('adm_002-v', 'adm', '002-V'),
  ('ap_001-d',  'ap',  '001-D'),
  ('ap_003-v',  'ap',  '003-V');

-- ============================================================
-- PERFIL MAESTRO (Marco)
-- auth_id se completa en el PASO 16 después de crear el
-- usuario en Supabase Auth Dashboard
-- role = 'master', active_role empieza en 'master'
-- ============================================================
insert into students (id, full_name, email, role, active_role, is_teacher, phone) values
  ('std_marco', 'Marco Guerra', 'marco.antonsat@gmail.com', 'master', 'master', true, '56961137685');

-- Grupos de prueba
insert into groups (id, section_id, owner_id, name, invite_code) values
  ('g1_inf_001', 'inf_001-d', 'std_marco', 'Grupo 1', 'INF-G1A'),
  ('g2_inf_001', 'inf_001-d', 'std_marco', 'Grupo 2', 'INF-G2B'),
  ('g3_inf_001', 'inf_001-d', 'std_marco', 'Grupo 3', 'INF-G3C'),
  ('g1_inf_003', 'inf_003-v', 'std_marco', 'Grupo 1', 'INF-G1D'),
  ('g2_inf_003', 'inf_003-v', 'std_marco', 'Grupo 2', 'INF-G2E');

-- Marco como owner en sus grupos
insert into student_groups (id, student_id, group_id, role) values
  ('sg_001', 'std_marco', 'g1_inf_001', 'owner'),
  ('sg_002', 'std_marco', 'g1_inf_003', 'owner');

-- Marco como profesor de sus secciones
insert into teacher_sections (id, teacher_id, section_id) values
  ('ts_001', 'std_marco', 'inf_001-d'),
  ('ts_002', 'std_marco', 'inf_003-v');

-- Columnas Scrum
insert into scrum_columns (id, group_id, title, icon, position) values
  ('todo_g1_inf_001',  'g1_inf_001', 'Por hacer',  '🕒', 0),
  ('doing_g1_inf_001', 'g1_inf_001', 'En proceso', '⚙️', 1),
  ('done_g1_inf_001',  'g1_inf_001', 'Finalizado', '✅', 2),
  ('todo_g2_inf_001',  'g2_inf_001', 'Por hacer',  '🕒', 0),
  ('doing_g2_inf_001', 'g2_inf_001', 'En proceso', '⚙️', 1),
  ('done_g2_inf_001',  'g2_inf_001', 'Finalizado', '✅', 2),
  ('todo_g3_inf_001',  'g3_inf_001', 'Por hacer',  '🕒', 0),
  ('doing_g3_inf_001', 'g3_inf_001', 'En proceso', '⚙️', 1),
  ('done_g3_inf_001',  'g3_inf_001', 'Finalizado', '✅', 2),
  ('todo_g1_inf_003',  'g1_inf_003', 'Por hacer',  '🕒', 0),
  ('doing_g1_inf_003', 'g1_inf_003', 'En proceso', '⚙️', 1),
  ('done_g1_inf_003',  'g1_inf_003', 'Finalizado', '✅', 2),
  ('todo_g2_inf_003',  'g2_inf_003', 'Por hacer',  '🕒', 0),
  ('doing_g2_inf_003', 'g2_inf_003', 'En proceso', '⚙️', 1),
  ('done_g2_inf_003',  'g2_inf_003', 'Finalizado', '✅', 2);

-- Tareas Scrum de prueba
insert into scrum_tasks (id, group_id, column_id, title, owner_id, permission, position) values
  ('t1_g1', 'g1_inf_001', 'todo_g1_inf_001',  'Informe Base de Datos',   'std_marco', 'member', 0),
  ('t2_g1', 'g1_inf_001', 'todo_g1_inf_001',  'Quiz actividad 2.3.1',    'std_marco', 'member', 1),
  ('t3_g1', 'g1_inf_001', 'doing_g1_inf_001', 'Diagrama ER del sistema', 'std_marco', 'owner',  0),
  ('t4_g1', 'g1_inf_001', 'done_g1_inf_001',  'Configurar repositorio',  'std_marco', 'owner',  0);

-- Eventos de prueba
insert into events (id, group_id, owner_id, title, event_date, type) values
  ('ev_001', 'g1_inf_001', 'std_marco', 'Prueba Base de Datos',  now() + interval '3 days', 'prueba'),
  ('ev_002', 'g1_inf_001', 'std_marco', 'Entrega Informe Redes', now() + interval '7 days', 'entrega'),
  ('ev_003', 'g1_inf_001', 'std_marco', 'Reunión de grupo',      now() + interval '1 day',  'reunion'),
  ('ev_004', 'g1_inf_003', 'std_marco', 'Quiz Programación OOP', now() + interval '5 days', 'prueba');

-- Apunte de prueba
insert into notes (id, group_id, owner_id, title, content) values
  ('note_001', 'g1_inf_001', 'std_marco', 'Tipos de JOIN en SQL',
   'INNER JOIN: solo coincidencias. LEFT JOIN: todo de la izquierda. RIGHT JOIN: todo de la derecha. FULL JOIN: todo.');


-- ============================================================
-- PASO 16: VINCULAR AUTH_ID DEL MAESTRO
-- ============================================================
-- Después de ejecutar este script completo, hacé esto:
--
-- 1. Ir a Supabase Dashboard → Authentication → Users
-- 2. Click "Add user" → Email: marco.antonsat@gmail.com
--                      → Password: Tangentede45!
-- 3. Copiar el UUID que genera (columna "UID")
-- 4. Ejecutar esta query con ese UUID:
--
--    update students
--    set auth_id = 'PEGAR-UUID-AQUI'
--    where id = 'std_marco';
--
-- Eso vincula tu login de Supabase Auth con tu perfil Maestro.
-- ============================================================


-- ============================================================
-- PASO 17: VERIFICACIÓN FINAL
-- ============================================================

select tabla, filas from (
  select 'institutions'   as tabla, count(*)::int as filas from institutions
  union all select 'careers',        count(*) from careers
  union all select 'sections',       count(*) from sections
  union all select 'students',       count(*) from students
  union all select 'teacher_sections', count(*) from teacher_sections
  union all select 'groups',         count(*) from groups
  union all select 'student_groups', count(*) from student_groups
  union all select 'scrum_columns',  count(*) from scrum_columns
  union all select 'scrum_tasks',    count(*) from scrum_tasks
  union all select 'events',         count(*) from events
  union all select 'notes',          count(*) from notes
  union all select 'lists',          count(*) from lists
  union all select 'polls',          count(*) from polls
  union all select 'poll_options',   count(*) from poll_options
  union all select 'poll_votes',     count(*) from poll_votes
  union all select 'raffles',        count(*) from raffles
) t order by tabla;
