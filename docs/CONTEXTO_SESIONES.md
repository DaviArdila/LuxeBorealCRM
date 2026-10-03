# Contexto para sesiones nuevas

**Lee esto primero si retomas el proyecto en una sesión nueva o en la nube.** Es un resumen con
enlaces; el estado canónico de las fases vive **solo** en [`docs/fases/README.md`](fases/README.md).
Última actualización: 2026-10-01 (Fases 08b y 08c fusionadas en `main`; Fase 08d implementada en la rama `fase-08d-avisos-con-enlace`, sin subir).

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
| Fuera de fase | Proveedores LLM, semilla de catálogo, lectura de mensajes e infra local: **fusionados en `main`** | PRs #33-#41 |
| 08b Comportamiento y fotos | **Cerrada con pendientes `[manual]`** (2026-10-01) | `openspec/changes/archive/2026-10-01-fase-08b-comportamiento-agente/`; faltan la corrida real de evals y la prueba por WhatsApp |
| 08c Estilo editable desde la base | **Cerrada con pendiente `[manual]`** (2026-10-01) | `openspec/changes/archive/2026-10-01-fase-08c-prompts-en-base-de-datos/`; guía en [`operacion/estilo-del-bot.md`](operacion/estilo-del-bot.md) |
| 08d Avisos al asesor con enlace | **Cerrada con pendiente `[manual]`** (2026-10-01), en la rama `fase-08d-avisos-con-enlace` **sin subir a GitHub** | `openspec/changes/archive/2026-10-01-fase-08d-avisos-con-enlace/`; guía en [`operacion/avisos-al-asesor.md`](operacion/avisos-al-asesor.md); falta un aviso real en Telegram con el enlace abierto desde el celular |
| 09a Operación sin VPS | **Propuesta** | Kill switch con endpoint, Dockerfile, Sentry/logs, backups en local |
| 09b Despliegue en VPS | **Propuesta**, bloqueada | Espera a que el dueño compre el VPS |
| 10, 11, 12, 13, 14 | `idea` | 11-14 van después del corte (P8) |

Tras la 08d quedan 09a, 09b, 10 (exige `judgment-day`), 11, 12, 13 y 14. Solo el dueño aprueba fases.

## Ramas y PRs

Todo el trabajo fuera de fase está fusionado en `main` (merge commit, 2026-10-01). No quedan PRs abiertos ni
ramas remotas con commits sin fusionar. El borrado de ramas remotas lo hace el dueño en la web.

| Trabajo | PR | Merge en `main` |
|---|---|---|
| Proveedores LLM: docs (ADR-0019) | #33 | `4198440` |
| Proveedores LLM: resolver y config | #34 | `41cb3f3` |
| Proveedores LLM: adaptador genérico | #35 | `37ebf39` |
| Proveedores LLM: proveedor OpenAI | #36 | `4b48d31` |
| Proveedores LLM: enrutador y docs | #37 | `24eaee4` |
| Semilla de catálogo de desarrollo | #39 | `5bc414c` |
| Arreglo de lectura de mensajes | #40 | `989f3b8` |
| Estado y plan del bot | #41 | `d97de48` |
| Infra local de Chatwoot (healthcheck) | #38 | `200d6f7` |

**Fase 08b** (stacked-to-main): #43 spec, #44 prompt (T1, T2), #45 SKU (T3), #46 ángulo y collage (T4, T5), #47 fotos por
ángulo y pie de foto (T6, T7) y #48 evals, e2e y cierre (T8, T9). Compruébalo con `gh pr list --state all`.

**Fase 08c** (stacked-to-main): #49 spec y ADR-0020, #50 validación y lectura (T1, T2), #51 ensamblador, publicar e historial (T3, T4), #52 comando `prompt:estilo` (T5) y #53 evals, e2e y cierre (T6, T7).

**Fase 08d**: rama `fase-08d-avisos-con-enlace` con ocho commits (spec, aprobación y las siete tareas), todavía **sin push ni PRs**. El plan del `tasks.md` la parte en cuatro PRs apilados (T1-T2, T3, T4-T5, T6-T7); cuando el dueño lo autorice, se crean con `stacked-to-main`.

Para el estado vigente usa `gh pr list --state all` y `git branch -a`.

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

- Borrar en la web las ramas remotas ya fusionadas.
- Revocar con `/revoke` en BotFather el token del bot de Telegram (quedó expuesto en una conversación) y
  poner el nuevo en su `.env`.
- Pasar la app de Meta a modo Activo para recibir mensajes reales.
- Verificar el flujo de punta a punta por WhatsApp (arreglo de lectura y Fase 08b: una foto, otro ángulo con pie,
  sin emojis ni SKU).
- Correr los evals reales con el prompt nuevo (`EVALS_MODO=real`, clave de OpenAI; EVL3) y elegir el modelo principal.
- Responder P41 y las de fases anteriores (P30, P32, P36: set dorado, evals, Telegram).
- Probar un estilo candidato con los evals reales (`EVALS_ESTILO`) y publicarlo con `npm run prompt:estilo` si te gusta.
- Probar la 08d de verdad: poner `CHATWOOT_URL_PUBLICA` con una dirección que abra tu celular, provocar un aviso y tocar el enlace en Telegram (P49, P50).
- Aprobar la 09a (y comprar el VPS antes de la 09b).

## Decisiones ya tomadas

| Tema | Decisión | Dónde |
|---|---|---|
| Proveedores LLM | OpenAI directo además de OpenRouter; claves en `.env` | [ADR-0019](adr/0019-proveedores-llm-configurables.md), P37-P40 |
| Sin emojis, tono, estructura | **Hecho (08b):** `estilo.v3.md`, editable; las reglas no negociables van en `reglas.v3.md` (v3: cita literal) | AGT13, AGT15 |
| SKU interno; el cliente ve nombre con atributos | **Hecho (08b):** el modelo maneja el `id` | P42, AGT16 |
| Una foto por defecto, otro ángulo bajo demanda con pie de foto | **Hecho (08b):** `foto.angulo`, `enviar_fotos`, pie del backend | R13, AGT9, AGT17, CAT14 |
| Collage del importador | **Hecho (08b):** opcional y apagado (`CATALOGO_GENERAR_COLLAGE`), sin casillas vacías | P44, IMP15, MED8 |
| Prompts editables desde la base de datos | **Hecho (08c):** solo el estilo, en `parametro` con respaldo `.md`, copia con versión en Redis e historial de 10 | ADR-0020, P45 |
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

1. El dueño corre los evals reales con el prompt nuevo y verifica el flujo por WhatsApp (los `[manual]` de la 08b) y los avisos con enlace (los de la 08d).
2. Decidir el modelo principal con esos evals (`gpt-5.6-luna` es el candidato).
3. Fase 09a (sin VPS): redactar su change para aprobación; comprar el VPS; Fase 09b; luego Fase 10 (corte).
