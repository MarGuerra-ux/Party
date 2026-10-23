# Party

**Tu equipo. Tu estudio. Todo en un solo lugar.**

Plataforma web de productividad académica y colaboración en grupos (antes *Organizador Marco / LogicHive*).
Es HTML + CSS + JavaScript simple con Supabase como backend.

## Cómo ejecutar

1. Abre la carpeta en Visual Studio Code.
2. Instala la extensión **Live Server**.
3. Clic derecho sobre `index.html` → **Open with Live Server**.

También puedes servir la carpeta con cualquier servidor estático (`python -m http.server`).
Necesita internet: carga Supabase y la tipografía desde CDN.

## Pantallas

| Página | Archivo | Descripción |
|---|---|---|
| Acceso | `index.html`, `pages/registro.html` | Ingreso libre (fase de construcción) y registro |
| Inicio | `pages/inicio.html` | Dashboard personal: métricas, asistente, clases, tareas, asignaturas, archivos, actividad |
| Grupos | `pages/grupos.html` | Mis grupos, explorar por sección, unirse con código |
| Panel del grupo | `pages/panel.html` | Resumen, tareas (Scrum), calendario, apuntes, listas, sorteos, encuestas, miembros, chat IA… |
| Carreras | `pages/carreras.html` | Administración académica |

## Estructura

```
index.html
pages/            páginas (inicio, grupos, panel, registro, carreras)
css/
  theme.css       tokens de color (oscuro / claro)
  base.css        reset y componentes globales
  party.css       shell (menú lateral, topbar) y tableros
  sections/       estilos de cada sección del panel
js/
  party_theme.js  aplica el tema guardado antes de pintar
  party_ui.js     shell compartido: iconos, menú lateral, buscador Ctrl+K, notificaciones
  party_data.js   datos de los tableros (Supabase o ejemplo)
  party_assistant.js  ruta directa del asistente (reglas + Supabase, sin LLM)
  inicio.js       dashboard personal
  sections/       una sección del panel por archivo
logichive_schema_v2.sql   esquema de Supabase
```

## Diseño

- Menú lateral izquierdo persistente (en móvil se abre con el botón ☰).
- Tema oscuro por defecto; el claro y los colores se cambian en **Configuración** o desde el menú del avatar.
- Los tokens (`--bg-card`, `--color-accent`, `--color-accent-2`…) están en `css/theme.css`.
- **Datos de ejemplo:** si el usuario no pertenece a ningún grupo, los tableros muestran datos de muestra marcados con la etiqueta *Ejemplo*. Con grupos reales, las métricas salen de Supabase.

## Asistente (Chat IA)

El Chat IA resuelve primero con **reglas + consultas a Supabase** (agenda semanal, tareas pendientes, evaluaciones, búsqueda, avance de asignaturas, crear tarea con confirmación), sin gastar tokens.
Lo que no reconoce lo derivaría a un modelo de IA, cuyo servicio **aún no está conectado**. Las claves de proveedores nunca deben ir en este código del navegador.

Las conversaciones se guardan por ahora en el navegador (`localStorage`).

## Notas

- Tipo de evento nuevo `clase` en el calendario (para "Mis próximas clases"). Actualiza el comentario del esquema SQL; no requiere migración.
- Las asignaturas del dashboard se guardan en el navegador hasta que exista su tabla en Supabase.
- `css/styles.css` y `js/panel.js` son archivos antiguos que ya no usa ninguna página.

## Apuntes guiados

El editor de apuntes tiene una barra de herramientas completa (estilos, fuentes, listas, checklist, tablas, cajas destacadas, enlaces, fecha) y un chat guía a la derecha:
1. Detecta la asignatura mientras escribes el título ("¿Es de tu asignatura Taller de BDD?") y pone nombre + fecha arriba.
2. Pregunta qué PPT se está viendo (ej. 2.1). Puedes subir el .pptx o pegar los temas; queda guardada por asignatura (localStorage) y lista los temas.
3. Ofrece escribir notas propias, resumen, tarjetas de preguntas o vocabulario (hoy con reglas; el LLM se enchufa en `NoteGuide` cuando esté conectado).

La asignatura y la PPT se guardan dentro del contenido del apunte (`data-note-subject`), así que no requiere cambios en Supabase.


## Base de datos y sincronización
Ejecuta en Supabase → SQL Editor, en orden: `sql/party_migracion_1.sql` y `sql/party_migracion_2.sql` (idempotentes).
La migración 2 crea `party_docs` (asignaturas, conversaciones, Biblioteca, apuntes), el bucket `party-library` y `agent_queries`.
El navegador usa `js/party_store.js`: guarda al instante en local y sube a Supabase; sin red queda en cola y se reintenta.

## Agente de IA
`agent/iniciar_launcher.bat` (Windows) o `agent/iniciar_launcher.sh` deja un lanzador activo; luego entra a **Agentes IA** y pulsa **Conectar agente**.
Arquitectura y justificación: `docs/arquitectura_y_justificacion.md`.
