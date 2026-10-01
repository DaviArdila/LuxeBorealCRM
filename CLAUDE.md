# CLAUDE.md

Guía para Claude Code (y para cualquier persona) al trabajar en este repositorio.

## Qué es este repo

**LuxeBorealCRM**: reescritura en NestJS del prototipo `../ChatLuxeCRM` (bot de WhatsApp con LLM,
traspaso a humano en Chatwoot, leads, catálogo), más el CRM de inventario y ventas. `SPEC.md` es el
**qué**; este archivo es el **cómo** del día a día. Las convenciones de código están en la skill
`luxeboreal-arquitectura` y el método de fases en la skill `luxeboreal-fases`; no se repiten aquí.

## Estado

Hay código en `src/` y las fases avanzan de una en una. El estado de cada fase vive **solo** en
`docs/fases/README.md` — no se copia en este archivo ni en el README.

## Orden de lectura

0. Sesión nueva o en la nube: empieza por `docs/CONTEXTO_SESIONES.md` (estado real, ramas, límites).
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

## Mapa de documentación

Qué pregunta responde cada documento:

| Qué | Dónde |
|---|---|
| Visión, qué es el proyecto, reglas invariantes | `SPEC.md` |
| Reglas de negocio vigentes por dominio | `openspec/specs/` |
| Por qué se decidió algo | `docs/adr/` |
| Contrato de la API y su documentación interactiva | `openapi/openapi.json` + Scalar en `/docs` |
| Qué hacer si algo falla en producción | `docs/operacion/` (desde la Fase 09) |
| Cómo cambiar el estilo del bot sin desplegar | `docs/operacion/estilo-del-bot.md` |
| Qué avisos le llegan al asesor por Telegram y cómo abrir la conversación | `docs/operacion/avisos-al-asesor.md` |
| Qué expone cada módulo (puertos, casos de uso) | TSDoc en el código exportado |
| Historial de cambios publicados | `CHANGELOG.md` (generado desde Conventional Commits) |
| Investigación y evidencia detrás de una decisión | `docs/analisis/` |

Toda documentación humana (no los encabezados estructurales de OpenSpec) sigue la skill
`cognitive-doc-design`.

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
  fase (`fase-NN-<nombre>`), nunca directo en `main`. Nunca `.env`, tokens ni secretos. Push, PR y merge
  siguen la sección «Publicar y encadenar fases», que recoge la autorización vigente del usuario.

## Publicar y encadenar fases

Autorización durable del usuario (2026-09-30): el agente publica su trabajo en GitHub, abre los PRs y los
fusiona sin pedir permiso cada vez, **solo** con CI verde y sin conflictos. Se sigue pidiendo confirmación
para lo que no sea el flujo normal de una fase (borrar ramas o historial, force-push a `main`, cambiar
secretos o configuración del repo).

- **Ramas y PRs apilados.** Una rama por slice: `fase-NN-pK-<tema>` (K = 1, 2…), cada una sobre la
  anterior; el PR de cada rama apunta a la anterior y se reapunta a `main` cuando la anterior se fusiona
  (`stacked-to-main`, merge commit). Un PR no pasa de ~400 líneas de autoría salvo excepción escrita en el
  `tasks.md` de la fase.
- **Antes de cada push**, la batería completa en local: `npm run lint`, `typecheck`, `fronteras`,
  `contrato:deriva`, `commits`, y los proyectos `unit`, `integracion`, `e2e` y `evals` de Vitest, no solo
  `unit`: un colaborador nuevo en una clase rompe los tests de integración que la construyen a mano. Sin
  Docker, las fallas de Testcontainers/MinIO se distinguen contra `main` y se dejan dichas en el PR.
- **`npm run commits`** antes de empujar: encabezado y cuerpo de cada commit en ≤100 caracteres por línea
  (el hook `commit-msg` no siempre se ejecuta).
- **Después del push, verificar de verdad**: el PR abierto contra la base correcta, los checks de la cabeza
  (`npm run ci`) en verde y, tras fusionar, que el merge quedó en `main`. Si el CI falla se busca la causa
  raíz (log del job); «flake» no es causa y no se reintenta a ciegas. Una rama de la cadena que cambia bajo
  otra se rebasa con `--force-with-lease` solo si es propia.
- **Fusionar** con la cabeza exacta (`expectedHeadSha`) y solo con checks verdes; el borrado de ramas
  remotas lo hace el usuario en la web.
- **Encadenar fases.** Al cerrar una fase con éxito (verify-report, deltas fusionados, archivada, README de
  fases actualizado), se empieza la siguiente en su orden con su propia spec para aprobación. Se **detiene**
  y se avisa cuando la siguiente depende de algo que solo el usuario puede dar (VPS o dominio, tokens de
  Meta, un bot o un grupo, decisiones de negocio) o exige una revisión que no es automática (`judgment-day`
  en las fases 04, 05, 06 y 10); las tareas `[manual]` pendientes se listan al cerrar, no bloquean lo que no
  dependa de ellas.

## Flujo de trabajo (ecosistema Gentle-AI)

- **Idioma**: la convención del proyecto es español para nombres de dominio y documentación; los
  sufijos técnicos de NestJS van en inglés (skill `luxeboreal-arquitectura` §8). Los
  agentes/subagentes no cambian los artefactos a inglés.
- **Fase = change de OpenSpec**: cada fase es `openspec/changes/fase-NN-<nombre>/`, recorrido con el
  ciclo `sdd-new/sdd-propose → sdd-spec → sdd-design → sdd-tasks → sdd-apply → sdd-verify →
  sdd-archive` (skill `luxeboreal-fases`; detalle de artefactos en
  `.claude/skills/_shared/sdd-orchestrator-workflow.md`). Preflight de esta migración (actualizado 2026-09-23): pace
  **automático**, artefactos **híbridos** (OpenSpec en el repo + Engram, proyecto
  `luxeborealcrm` — correr las sesiones desde la raíz del repo; si la detección automática de
  proyecto falla, pasarlo explícito), estrategia de PR **`auto-chain`** con
  cadena `stacked-to-main`. Equivalencia de estados
  de `docs/fases/README.md`: `spec en revisión` ≈ propose+spec+design+tasks; `aprobada` ≈ el usuario
  las aprueba; `en curso` ≈ apply (cada tarea de `tasks.md` cierra con un commit de unidad de
  trabajo); `cerrada` ≈ verify+archive (fusiona los delta specs en `openspec/specs/`).
- **TDD estricto**: por tarea, RED observado → GREEN → REFACTOR; runner Vitest (ESM, `npm test`),
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
  repo una vez la Fase 00a cree código; Engram con claves de tema `luxeboreal/adr/<nnnn>` y
  `luxeboreal/fase-<nn>` como espejo de recuperación — los documentos del repo siguen siendo la
  fuente de verdad.

## Stack (ADR-0001, ADR-0002)

- Node.js LTS + TypeScript estricto, **NestJS 12** (ADR-0001, enmienda 2026-09-23). Un solo negocio
  (ADR-0006).
- **Prisma** sobre **PostgreSQL 16** (mismo servidor que Chatwoot, base y rol propios — ADR-001 del
  prototipo). Llaves UUID v7 (ADR-0007). Diseño en `MODELO_DATOS.md`.
- **Redis** + **BullMQ** (`@nestjs/bullmq`) para colas, debounce, locks, dedupe y cachés.
- **AI SDK** (`ai`) + `@openrouter/ai-sdk-provider` detrás de un puerto propio `LlmPort`; modelo
  principal **GPT-5.6 Luna** vía OpenRouter con modelos de respaldo.
- `zod` para validar configuración y payloads; `sharp` para imágenes; `nestjs-pino` para logs.
- **Vitest** (ESM, decisión 2026-09-23) + Supertest para e2e; Postgres y Redis reales en integración.
- Observabilidad inicial: logs JSON a stdout, Sentry (plan gratis), Uptime Kuma, tabla `uso_llm`.
- Docker Compose para desarrollo; Dokploy en el VPS para producción. **Chatwoot** como plataforma de
  canales, historial y bandeja humana (ADR-0005): lo que ya hace no se construye.

## Repositorio

Repo git **propio** (`git init` el 2026-09-22), publicado en GitHub (`DaviArdila/LuxeBorealCRM`). La carpeta
vive dentro del repo del home del usuario (`C:\Users\ASUS`): usar siempre `git -C` o la raíz de este
repo, nunca comandos que afecten al repo padre. `.kilo/` es de otra herramienta y está ignorado.

## Comandos

Confirmados en las Fases 00a, 00b y 01 (`package.json`):

| Comando | Qué hace |
|---|---|
| `npm run start:dev` | Levanta la aplicación en modo desarrollo (`nest start --watch`) |
| `npm run build` | Compila a `dist/` con `tsc` (`nest build`) |
| `npm run prisma:generar` | Genera el cliente Prisma en `src/plataforma/prisma/generado/` (también corre en `postinstall`) |
| `npm run prisma:migrar` | `prisma migrate dev`: crea y aplica una migración nueva a partir de `prisma/schema.prisma` (desarrollo) |
| `npm run prisma:aplicar` | `prisma migrate deploy`: aplica las migraciones pendientes sin generar una nueva (CI, producción) |
| `npm run semilla:geografia` | Siembra `departamento`/`ciudad` desde `prisma/datos/divipola.json` (catálogo DANE); idempotente |
| `npm run lint` | ESLint (flat config) sobre todo el repo |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run fronteras` | `dependency-cruiser` sobre `src/` y `scripts/` con las reglas de fronteras |
| `npm test` | Vitest, proyecto `unit` (sin infraestructura) |
| `npm run test:integracion` | Vitest, proyecto `integracion` (Postgres + Redis reales vía Testcontainers) |
| `npm run test:e2e` | Vitest, proyecto `e2e` (arranque completo con Supertest) |
| `npm run test:cobertura` | Vitest con cobertura sobre `unit` + `integracion`; umbral de líneas 80 % (`coverage_threshold`, D15 de la Fase 00b) |
| `npm run verify` | Puerta local de build: `prisma:generar` → `lint` → `typecheck` → `fronteras` → deriva del contrato → tests unitarios e integración (seis comprobaciones), en menos de 3 minutos con Postgres/Redis ya arriba |
| `npm run contrato:generar` | Genera `openapi/openapi.json` (público) y `openapi/openapi.interno.json` (completo) desde el código (D1/D2 de la Fase 00b) |
| `npm run contrato:deriva` | Regenera el contrato en memoria y lo compara byte a byte con lo commiteado; falla si difiere |
| `npm run contrato:lint` | Lint del contrato con Spectral (`.spectral.yaml`) sobre ambos documentos |
| `npm run contrato:diff` | Compara el documento público contra `main` con oasdiff; sin base commiteada, deja constancia sin fallar (D11) |
| `npm run secretos` | `gitleaks` sobre el árbol de trabajo (rápido; parte del hook `pre-push`) |
| `npm run secretos:historial` | `gitleaks` sobre el historial completo de commits (lento; solo en `ci`) |
| `npm run commits` | `commitlint` sobre el rango `merge-base(main, HEAD)..HEAD` (u override con `LUXE_COMMITS_DESDE`) |
| `npm run auditoria` | `npm audit` filtrado por el umbral `high` y las excepciones versionadas de `auditoria-excepciones.json` |
| `npm run flujos` | Valida estáticamente `.github/workflows/` con `actionlint` |
| `npm run changelog` | Regenera `CHANGELOG.md` con `git-cliff` desde los commits de Conventional Commits (`cliff.toml`); nunca se edita a mano |
| `npm run evals` | Vitest, proyecto `evals`: casos JSON contra el agente completo (Postgres + Redis reales) con un LLM guionado, sin red ni costo; umbral 100 % (Fase 07c). `EVALS_MODO=real` (con `OPENROUTER_API_KEY`, nunca en CI) lo corre contra el LLM real, 3 repeticiones, e imprime el costo; `EVALS_ESTILO=<ruta>` publica ese estilo candidato en la base de la corrida para medirlo antes de publicarlo con `prompt:estilo` |
| `npm run evals:anonimizar` | Convierte una conversación cruda de Chatwoot (`.evals-crudo/`, ignorado por git) en un caso del set dorado con marcadores estables; no escribe nada si sobrevive un dato personal (R14) |
| `npm run prompt:estilo` | Edita el estilo del bot sin desplegar (Fase 08c): `-- ver`, `-- historial`, `-- publicar --archivo <ruta>` y `-- restaurar --version <n>`; valida el texto, guarda las últimas 10 versiones y no escribe el texto en logs. Tras publicar, correr los evals reales (EVL3) |
| `npm run ci:hook` | Subconjunto rápido que corre el hook `pre-push`: lint, typecheck, tests unitarios, deriva del contrato, secretos y commitlint |
| `npm run ci` | Secuencia completa de integración continua (la misma que invoca `.github/workflows/ci.yml`, sin redefinirla): `ci:hook` + fronteras + tests con cobertura + e2e + evals guionadas + lint/diff del contrato + auditoría + validación de workflows |


## Reglas críticas

Las reglas de negocio R1-R16 de `SPEC.md` §4 son no negociables. Las más fáciles de romper sin
querer al escribir código:

1. El LLM **nunca** recibe precios para calcular ni accede a datos fuera de sus herramientas (R1, R2).
2. **Toda** salida al cliente pasa por el puerto de salida de `conversaciones` (R5).
3. **Nada** devuelve una conversación a `bot` salvo temporizador, admin o la bandeja (R6).
4. **Nunca** loguear contenido de mensajes, números completos, cédula ni correo (R14).
5. Textos al cliente y parámetros del negocio son **datos**, no constantes (R15).
6. El tiempo se lee del `Clock` inyectado, nunca de `Date.now()` / `new Date()` en lógica.
