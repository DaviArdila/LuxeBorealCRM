# Contexto para sesiones nuevas

**Lee esto primero si retomas el proyecto en una sesión nueva o en la nube.** Es un resumen con
enlaces; el estado canónico de las fases vive **solo** en [`docs/fases/README.md`](fases/README.md).
Última actualización: 2026-10-01.

## Qué es

- **LuxeBorealCRM**: reescritura en NestJS del prototipo `../ChatLuxeCRM` (bot de WhatsApp con LLM).
- Chatwoot es la plataforma de canales y la bandeja humana; el bot atiende, captura leads y traspasa.
- Incluye catálogo, leads y más adelante inventario y ventas ([`SPEC.md`](../SPEC.md)).
- Stack: NestJS 12, Prisma + PostgreSQL 16, Redis + BullMQ, AI SDK, Vitest ([`CLAUDE.md`](../CLAUDE.md)).
- Un solo negocio. Reglas invariantes R1-R16 en `SPEC.md` §4.

## Estado por fase

| Fase | Estado | Nota |
|---|---|---|
| 00a-08 | Cerradas y archivadas en `main`; CI de GitHub en verde en cada merge | La 08 fue PRs #25-#32 |
| Fuera de fase | Ver «Ramas y PRs» abajo | Aún sin fusionar a `main` |
| 08b Comportamiento del agente | **Propuesta** (`idea`) | [`odd/tasks/comportamiento-del-bot.md`](../odd/tasks/comportamiento-del-bot.md) |
| 09a Operación sin VPS | **Propuesta** | Kill switch con endpoint, Dockerfile, Sentry/logs, backups en local |
| 09b Despliegue en VPS | **Propuesta**, bloqueada | Espera a que el dueño compre el VPS |
| 10, 11, 12, 13, 14 | `idea` | 11-14 van después del corte (P8) |

Tras la 08 quedan 08b, 09a, 09b, 10 (exige `judgment-day`), 11, 12, 13 y 14. Solo el dueño aprueba fases.

## Ramas y PRs (verificar siempre con `gh pr list`)

Esta tabla envejece: confirma el estado real con `gh pr list --state all` y `git branch -a`.

| Trabajo | Rama | PR | Apila sobre |
|---|---|---|---|
| Proveedores LLM: docs (ADR-0019) | `docs/proveedores-llm-directos` | #33 | `main` |
| Proveedores LLM: resolver y config | `proveedores-llm-p1-resolucion-config` | #34 | #33 |
| Proveedores LLM: adaptador genérico | `proveedores-llm-p2-adaptador-generico` | #35 | #34 |
| Proveedores LLM: proveedor OpenAI | `proveedores-llm-p3-openai` | #36 | #35 |
| Proveedores LLM: enrutador y docs | `proveedores-llm-p4-enrutador-docs` | #37 | #36 |
| Semilla de catálogo de desarrollo | `chore/datos-semilla-catalogo` | por abrir | rama con el trabajo reciente |
| Arreglo de lectura de mensajes | `fix/canales-lectura-mensajes` | por abrir | ídem |
| Infra local de Chatwoot (healthcheck) | `chore/infra-chatwoot-local` | por abrir | `main` (independiente) |
| Estado y plan del bot (este documento) | `docs/estado-y-plan-comportamiento-bot` | por abrir | rama con todo lo anterior |

Orden de fusión: #33 → #34 → #35 → #36 → #37; luego las ramas nuevas. Cada PR se reapunta a `main` al
fusionar el anterior.

## Trabajo fuera de fase (resumen)

- **Proveedores LLM configurables** (ADR-0019, aceptada): prefijo `proveedor:modelo`; OpenRouter por
  defecto, `openai:` directo con `OPENAI_API_KEY`; enrutador con fallback. T5-T7 pospuestas.
  Detalle: [`odd/tasks/proveedores-llm-configurables.md`](../odd/tasks/proveedores-llm-configurables.md).
- **Semilla de catálogo**: 17 productos de grifería y sanitarios, fotos con atribución
  ([`datos-desarrollo/README.md`](../datos-desarrollo/README.md)).
- **Arreglo de lectura**: un token de Agent Bot recibe 401 al listar mensajes y el agente no respondía.
  Nueva variable opcional `CHATWOOT_API_TOKEN_LECTURA` (P41: ¿obligatoria en producción?). Change
  `openspec/changes/fix-lectura-mensajes-chatwoot/` sin archivar.
- **Infra local**: healthcheck de Chatwoot con `127.0.0.1` y contraseña opcional de la base.

## Evals reales: el agente NO está listo para clientes

| Modelo | Resultado | Críticas fallidas | No críticas |
|---|---|---|---|
| `gpt-6-luna` (directo) | Reprobada | 5 | 64,3 % |
| `gpt-5.6-luna` | Reprobada | 0 | 67,9 % |

El modelo más seguro hoy es `gpt-5.6-luna`; el prompt necesita trabajo (08b). Detalle y fallos comunes en
[`odd/tasks/comportamiento-del-bot.md`](../odd/tasks/comportamiento-del-bot.md).

## Qué puede y qué no puede hacer una sesión en la nube

| Sí | No |
|---|---|
| Leer, escribir y revisar specs, ADRs y documentos | Probar Chatwoot, Telegram, WhatsApp/Meta o MinIO reales: solo corren en la máquina del dueño |
| Escribir código con tests unitarios (`npm test`) | Contar con Docker: integración, e2e y evals con Testcontainers pueden no correr |
| Revisar PRs y diffs, preparar commits | Usar claves reales (`.env` nunca se sube) ni la corrida real de evals |
| Proponer ADRs y preguntas | Verificar el flujo real por WhatsApp |

## Pendientes del dueño

- Fusionar los PRs #33-#37 y los de las ramas nuevas (el borrado de ramas remotas lo hace él).
- Revocar con `/revoke` en BotFather el token del bot de Telegram (quedó expuesto en una conversación) y
  poner el nuevo en su `.env`.
- Pasar la app de Meta a modo Activo para recibir mensajes reales.
- Verificar el flujo de punta a punta por WhatsApp tras el arreglo de lectura (aún sin probar).
- Responder P41, P43, P44, P45 y las de fases anteriores (P30, P32, P36: set dorado, evals, Telegram).
- Aprobar la 08b y la partición de la 09; comprar el VPS antes de la 09b.

## Decisiones ya tomadas

| Tema | Decisión | Dónde |
|---|---|---|
| Proveedores LLM | OpenAI directo además de OpenRouter; claves en `.env` | [ADR-0019](adr/0019-proveedores-llm-configurables.md), P37-P40 |
| Sin emojis, tono, estructura | Decidido 2026-10-01 | `odd/tasks/comportamiento-del-bot.md` |
| SKU interno; el cliente ve nombre con atributos | Decidido 2026-10-01 | P42 |
| Una foto por defecto, más bajo demanda con pie de foto | Decidido; enmienda R13/AGT9 | `odd/tasks/comportamiento-del-bot.md` |
| Prompts editables desde la base de datos | Idea a estudiar (ADR y spec propios) | P45 |
| Fases 11-14 después del corte | P8 | [`PREGUNTAS_ABIERTAS.md`](PREGUNTAS_ABIERTAS.md) |

Preguntas pendientes: [`docs/PREGUNTAS_ABIERTAS.md`](PREGUNTAS_ABIERTAS.md).

## Reglas de trabajo clave

- Nada se implementa sin una spec aprobada por el dueño; una fase a la vez; rama de fase, nunca `main`.
- Un commit por unidad de trabajo (comportamiento + tests + docs), Conventional Commits, **sin atribución
  de IA**.
- Nunca `.env`, tokens, claves, ids de chat ni teléfonos completos; las variables se nombran solo por su
  nombre.
- Presupuesto de ~400 líneas por PR, sin borrar tests ni comentarios para cumplirlo.
- Push, PR y merge siguen la sección «Publicar y encadenar fases» de [`CLAUDE.md`](../CLAUDE.md). Aviso: el
  clasificador de permisos puede bloquear `gh pr merge`; en ese caso el dueño fusiona en la web.

## Comandos de verificación

| Comando | Nota |
|---|---|
| `npm run verify` | Puerta local: lint, typecheck, fronteras, contrato, tests unit e integración |
| `npm test` | Unitarios, sin infraestructura (corre en la nube) |
| `npm run ci` | Secuencia completa, la misma del workflow de GitHub |
| `npm run test:integracion`, `test:e2e`, `evals` | Exigen Docker (Postgres, Redis, MinIO) |
| `npm run commits` | Encabezados de commit ≤100 caracteres |

Lista completa en la sección «Comandos» de `CLAUDE.md`.

## Próximos pasos, en orden

1. El dueño fusiona los PRs y verifica el flujo real por WhatsApp.
2. Decidir el modelo principal con los evals (`gpt-5.6-luna` es el candidato).
3. El dueño aprueba la 08b (y la partición de la 09) → se redacta el change de OpenSpec.
4. Fase 08b por slices: prompt → fotos → prompts en base de datos.
5. Fase 09a (sin VPS); comprar el VPS; Fase 09b; luego Fase 10 (corte).
