# CLAUDE.md

Guía para Claude Code (y para cualquier persona) al trabajar en este repositorio.

## Qué es este repo

**LuxeBorealCRM**: reescritura en NestJS del prototipo `../ChatLuxeCRM` (bot de WhatsApp con LLM,
traspaso a humano en Chatwoot, leads, catálogo), más el CRM de inventario y ventas. `SPEC.md` es el
**qué**; este archivo es el **cómo** del día a día. Las convenciones de código están en la skill
`luxeboreal-arquitectura` y el método de fases en la skill `luxeboreal-fases`; no se repiten aquí.

## Estado

**Fase de planeación.** No hay código todavía. El estado de cada fase vive **solo** en
`docs/fases/README.md` — no se copia en este archivo ni en el README.

## Orden de lectura

1. `SPEC.md` — qué es, principios, índice de reglas invariantes (R1-R16).
2. `docs/fases/README.md` — hoja de ruta y fase actual.
3. El change activo de la fase en curso, `openspec/changes/fase-NN-<nombre>/` (proposal, specs,
   design, tasks).
4. `openspec/specs/` — las specs de los dominios que toca la fase (comportamiento vigente).
5. `docs/adr/` — por qué las cosas son como son.
6. Si hace falta contexto del prototipo: `docs/analisis/01-analisis-chatluxecrm.md` y
   `docs/migracion/inventario.md` antes de abrir `../ChatLuxeCRM`.
7. Si el trabajo no es una fase (mantenimiento, mejoras puntuales): `odd/tasks/<nombre>.md` —
   tareas ODD fuera del ciclo de fases.

## Cómo se trabaja

- **Nada se implementa sin una spec de fase aprobada por el usuario.** Si una tarea no está en la
  spec de la fase en curso, se pregunta antes de hacerla.
- **Se trabaja una fase a la vez**, en el orden de `docs/fases/README.md`. No se adelanta trabajo de
  fases futuras "porque ya estamos aquí".
- **El prototipo es referencia, no fuente para copiar.** Se lee su código y sus tests para entender el
  comportamiento; se reescribe según la arquitectura nueva. Nunca se modifica `../ChatLuxeCRM` desde
  aquí.
- **El esquema de datos es lógica de negocio del usuario** (base: `schema.prisma:90` del prototipo;
  versión vigente: `MODELO_DATOS.md`). Se proponen cambios y se hacen preguntas; no se cambia sin su
  decisión explícita. Ningún dato del prototipo se migra (P7).
- **Antes de construir algo, revisar `docs/analisis/04-chatwoot-delegar-vs-construir.md`**: si
  Chatwoot Community ya lo hace, no se construye.
- **Decisión con alternativas reales → ADR** en `docs/adr/` (plantilla en su README), estado
  `propuesta` hasta que el usuario la acepte.
- **Preguntas pendientes** van a `docs/PREGUNTAS_ABIERTAS.md` con número; al resolverse se anota la
  respuesta y dónde quedó reflejada.
- Al cerrar una tarea: checklist de cierre de la skill `luxeboreal-arquitectura`.
- **Un commit por unidad de trabajo** (comportamiento + sus tests + su documentación juntos),
  Conventional Commits, sin atribución de IA ni líneas `Co-Authored-By`. Se trabaja en una rama de
  fase (`fase-NN-<nombre>`), nunca directo en `main`. Push, PR y merge son siempre decisión del
  usuario. Nunca `.env`, tokens ni secretos.

## Flujo de trabajo (ecosistema Gentle-AI)

- **Idioma**: la convención del proyecto es español para nombres de dominio y documentación; los
  sufijos técnicos de NestJS van en inglés (skill `luxeboreal-arquitectura` §8). Los
  agentes/subagentes no cambian los artefactos a inglés.
- **Fase = change de OpenSpec**: cada fase es `openspec/changes/fase-NN-<nombre>/`, recorrido con el
  ciclo `sdd-new/sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify →
  sdd-archive` (skill `luxeboreal-fases`; detalle de artefactos en
  `.claude/skills/_shared/sdd-orchestrator-workflow.md`). Preflight de esta migración: pace
  **interactivo**, artefactos **híbridos** (OpenSpec en el repo + Engram, proyecto
  `luxeborealcrm` — correr las sesiones desde la raíz del repo; si la detección automática de
  proyecto falla, pasarlo explícito), estrategia de PR **`ask-on-risk`**. Equivalencia de estados
  de `docs/fases/README.md`: `spec en revisión` ≈ propose+spec+design+tasks; `aprobada` ≈ el usuario
  las aprueba; `en curso` ≈ apply (cada tarea de `tasks.md` cierra con un commit de unidad de
  trabajo); `cerrada` ≈ verify+archive (fusiona los delta specs en `openspec/specs/`).
- **TDD estricto**: por tarea, RED observado → GREEN → REFACTOR; runner Jest (`npm test`),
  registrado en la spec de cada fase.
- **Entrega**: presupuesto de ~400 líneas cambiadas por PR (skills `work-unit-commits`,
  `chained-pr`); estrategia de cadena por defecto `stacked-to-main`; cada spec de fase declara sus
  slices. El presupuesto nunca se cumple borrando tests ni comentarios.
- **Review**: `gentle-ai review` nativo por cada commit de unidad de trabajo cuando RDD está
  activo; `judgment-day` (revisión ciega doble) obligatorio antes de cerrar las fases 04, 05, 06 y
  10.
- **Herramientas**: índice de skills en `.atl/skill-registry.md` (se regenera con la skill
  `skill-registry` tras cambios de skills); CodeGraph: indexar `../ChatLuxeCRM` para apoyar la
  escritura de specs de migración (quién llama a la máquina de estados, a `enviarMensaje`), y este
  repo una vez la Fase 00 cree código; Engram con claves de tema `luxeboreal/adr/<nnnn>` y
  `luxeboreal/fase-<nn>` como espejo de recuperación — los documentos del repo siguen siendo la
  fuente de verdad.

## Stack (ADR-0001, ADR-0002)

- Node.js LTS + TypeScript estricto, **NestJS 11**. Un solo negocio (ADR-0006).
- **Prisma** sobre **PostgreSQL 16** (mismo servidor que Chatwoot, base y rol propios — ADR-001 del
  prototipo). Llaves UUID v7 (ADR-0007). Diseño en `MODELO_DATOS.md`.
- **Redis** + **BullMQ** (`@nestjs/bullmq`) para colas, debounce, locks, dedupe y cachés.
- **AI SDK** (`ai`) + `@openrouter/ai-sdk-provider` detrás de un puerto propio `LlmPort`; modelo
  principal **GPT-5.6 Luna** vía OpenRouter con modelos de respaldo.
- `zod` para validar configuración y payloads; `sharp` para imágenes; `nestjs-pino` para logs.
- **Jest** (estándar de NestJS) + Supertest; Postgres y Redis reales en integración.
- Observabilidad inicial: logs JSON a stdout, Sentry (plan gratis), Uptime Kuma, tabla `uso_llm`.
- Docker Compose para desarrollo; Dokploy en el VPS para producción. **Chatwoot** como plataforma de
  canales, historial y bandeja humana (ADR-0005): lo que ya hace no se construye.

## Repositorio

Repo git **propio** (`git init` el 2026-09-22), local por ahora; después se sube a GitHub. La carpeta
vive dentro del repo del home del usuario (`C:\Users\ASUS`): usar siempre `git -C` o la raíz de este
repo, nunca comandos que afecten al repo padre. `.kilo/` es de otra herramienta y está ignorado.

## Comandos

Se completan en la Fase 00. Previstos: `npm run start:dev`, `npm run verify` (lint + typecheck +
tests + fronteras), `npm test` (Jest), `npm run test:e2e`, `npm run evals`.

## Reglas críticas

Las reglas de negocio R1-R16 de `SPEC.md` §4 son no negociables. Las más fáciles de romper sin
querer al escribir código:

1. El LLM **nunca** recibe precios para calcular ni accede a datos fuera de sus herramientas (R1, R2).
2. **Toda** salida al cliente pasa por el puerto de salida de `conversaciones` (R5).
3. **Nada** devuelve una conversación a `bot` salvo temporizador, admin o la bandeja (R6).
4. **Nunca** loguear contenido de mensajes, números completos, cédula ni correo (R14).
5. Textos al cliente y parámetros del negocio son **datos**, no constantes (R15).
6. El tiempo se lee del `Clock` inyectado, nunca de `Date.now()` / `new Date()` en lógica.
