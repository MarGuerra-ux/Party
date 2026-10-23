# Notas para el informe técnico y la presentación (ISY0101 · Evaluación Parcial 2)

> Archivo de trabajo: ideas y decisiones para no olvidarlas. Las conclusiones individuales y la
> declaración de uso de IA las escribe cada integrante por su cuenta, sin IA.

## 1. Argumento: reglas internas (nivel 0) vs. modelos de lenguaje

**Tesis:** con lógica de reglas, sin gastar un solo token, el agente resuelve las consultas básicas
y repetitivas; el modelo de lenguaje se reserva para lo que requiere razonar.

**Qué resuelven hoy las reglas (0 tokens):** saludo, fecha de hoy, ubicación de una sala,
horario (hoy, mañana, semana) y próximas pruebas.

**Por qué conviene (para IE7 decisión y IE9 justificación):**
- Costo cero y respuesta inmediata en preguntas cuya respuesta ya está en nuestros datos.
- Las cuotas gratuitas de los proveedores son limitadas y renuevan por ventana de tiempo
  (ver `agent/modelos.yaml`); gastarlas en "¿qué día es hoy?" las desperdicia.
- Determinismo: una regla no alucina. La fecha o la sala siempre salen correctas.
- Estrategia en capas: reglas → modelo rápido → modelo equilibrado → modelo de razonamiento
  (+ visión y respaldo). Se escala solo cuando hace falta, y el usuario aprueba (Usar / No usar)
  antes de gastar tokens.

**Métrica a mostrar en la demo (pendiente de implementar):**
- Preguntas totales de la sesión, preguntas resueltas con reglas (0 tokens) y preguntas con modelo.
- % resuelto sin tokens = reglas / totales.
- Tokens ahorrados (estimado): promedio de tokens de una respuesta de modelo × preguntas por reglas.
  Declararlo como estimación, no como dato exacto.
- Mostrarlo en el medidor del chat ("12 preguntas · 8 con reglas internas (67%) · 4 con modelo").
- Persistencia: tabla `agent_usage` (Supabase) ya creada; las respuestas por reglas se registrarían
  con provider = `reglas`, tokens_total = 0.

**Honestidad metodológica (decirlo en la exposición):** el % depende del tipo de preguntas que se
hagan; con preguntas básicas será alto y con preguntas de planificación será bajo. No es una
tasa de acierto, es la proporción de consultas que no necesitaron IA.

## 2. Vocabulario de reglas a ampliar (orden de prioridad)
1. Horario fino: clase ahora / próxima clase, hora de entrada y salida, qué día tengo X, cualquier día
   de la semana, dónde es mi próxima clase.
2. Calendario: qué tengo mañana/esta semana, cuántos días faltan para la próxima prueba.
3. Salas: por asignatura, por piso o bloque (tabla `campus_rooms`).
4. Meta: tokens usados, modelo usado, qué recuerda de mí, cortesías (gracias, chao, quién eres).
Diseño: listas de sinónimos por intención, reglas específicas antes que generales, exclusión de
verbos de planificación (organiza, planifica, prioriza, resume) y un test por regla.
No incluir conocimiento general: ahí un modelo responde mejor.

## 3. Seguridad (hoja de ruta, para el informe)
- Estado actual: login propio (tabla `students`), clave pública en el navegador, RLS activado con
  política abierta `demo_all` (script `sql/party_rls_demo.sql`). Protege contra el aviso del panel,
  no aísla datos entre estudiantes.
- Mejora: migrar a Supabase Auth y reemplazar `demo_all` por políticas por `auth.uid()` y por
  pertenencia a grupo. Es una decisión consciente de alcance, no un olvido.

## 4. Datos de la arquitectura útiles para el informe
- Grafo LangGraph: recordar → reglas → clasificar → [planificar] → actuar → verificar → [escalar] → memorizar.
- Flujo de dos pasos: `/plan` (0 tokens, estima y propone) y `/run` (tras aprobación del usuario).
- Proveedores gratuitos con renovación: Groq, Gemini, Mistral, OpenRouter (Cerebras descartado: exige pago).
- Memoria corta y larga (SQLite, BM25 ligero); recuperación semántica prevista con pgvector
  (`note_chunks`, `match_note_chunks`) y embeddings de 768 dimensiones.
- Base de datos: Supabase (GreenRoll), migración `sql/party_migracion_1.sql`.
