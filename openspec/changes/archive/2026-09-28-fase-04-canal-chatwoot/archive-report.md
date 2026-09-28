# Archive Report: Fase 04 — Canal Chatwoot

**Change**: `fase-04-canal-chatwoot`
**Archivado**: 2026-09-28
**Rama**: `fase-04-canal-chatwoot`
**Ubicación de archivo**: `openspec/changes/archive/2026-09-28-fase-04-canal-chatwoot/`

## Resumen ejecutivo

Fase 04 (Canal Chatwoot) queda cerrada y archivada. Las 9 tareas (T1-T9) están completas, cada una
con su commit de unidad de trabajo confirmado en `git log` de la rama `fase-04-canal-chatwoot`, más 2
commits de corrección intra-fase (`5ab9370`, `8cac7af`) y un tercero (`e38653a`) que corrigió el único
hallazgo CRITICAL de `judgment-day` (revisión ciega doble, obligatoria para esta fase según regla 6 de
`docs/fases/README.md`). Los 8 requisitos nuevos (`CAN1-CAN8`, 13 escenarios) quedaron anexados a
`openspec/specs/canales/spec.md` sin tocar los 4 escenarios ya existentes de R3/R4 (esqueleto de la
Fase 04 aprobado antes de esta sesión). `judgment-day` aprobó la fase (`terminal_state: approved`) con
el hallazgo CRITICAL corregido y re-verificado en el código real (no solo en el mensaje del commit),
más 2 hallazgos de deuda documentada no bloqueante. `sdd-verify` confirmó todos los checks ejecutables
en verde (lint, typecheck, fronteras, `contrato:deriva`, 408 tests unitarios, 120 de integración
corridos dos veces de forma aislada, 9 e2e incluido el criterio de salida de la fase) y agregó un
quinto hallazgo propio (nomenclatura de 2-3 títulos de test, no de cobertura). No quedan tareas
pendientes; quedan 5 hallazgos abiertos declarados como deuda no bloqueante (0 críticos, 3
advertencias, 2 sugerencias — ver sección dedicada abajo), ninguno impide archivar ni fusionar los
delta specs.

## Artefactos del change

Este archivo contiene:
- `proposal.md` — objetivo, alcance, tabla "Qué se migra del prototipo", 6 decisiones ya tomadas
  (inbox/outbox de ADR-0004, plataforma de canales de ADR-0005, horario en tabla propia, auto-resolver
  apagado, entrega `auto-chain`/`stacked-to-main`, `judgment-day` obligatorio, columna
  `clave_idempotencia` en `outbox`) y 3 preguntas abiertas con recomendación (Q1 reintentos/alerta, Q2
  límite de payload, Q3 procedencia de fixtures).
- `design.md` — decisiones D1-D16, módulos/puertos/adaptadores, matriz de amenazas.
- `specs/canales/spec.md` — spec delta: extensión del dominio `canales` (`CAN1-CAN8`, 13 escenarios)
  sobre el esqueleto existente (R3, R4).
- `tasks.md` — checklist de 9 tareas completas, mapeo de 17 escenarios por tarea (R3+R4+CAN1-CAN8),
  pronóstico de presupuesto de revisión (riesgo Alto, `size:exception` automático anticipado para
  T3-T6), y los resultados reales de verificación de riesgos técnicos registrados durante `sdd-apply`
  (body crudo, `@nestjs/bullmq` con NestJS 12, `content_attributes`/`X-Chatwoot-Delivery` contra
  Chatwoot v4.17.1 real).
- `verify-report.md` — verificación diagnóstica: cobertura de los 17 escenarios contra tests reales,
  checks ejecutables completos, transcripción íntegra del veredicto de `judgment-day`, y los 5
  hallazgos abiertos (4 señalados por la orquestación + 1 nuevo de `sdd-verify`).

## Specs fusionadas en la especificación principal

### Dominio extendido

| Dominio | Acción | Requisitos nuevos | Ubicación |
|---|---|---|---|
| `canales` | Extendido (delta anexado) | 8 (`CAN1-CAN8`), 13 escenarios | `openspec/specs/canales/spec.md` |

**Verificación de composición nativa**: la fusión se ejecutó con

```
gentle-ai sdd-archive-compose \
  --canonical openspec/specs/canales/spec.md \
  --delta openspec/changes/fase-04-canal-chatwoot/specs/canales/spec.md \
  --output openspec/specs/canales/spec.md.compose-tmp
mv openspec/specs/canales/spec.md.compose-tmp openspec/specs/canales/spec.md
```

Salida cero (`COMPOSE_OK`). El archivo resultante conserva los 2 requisitos R3/R4 (4 escenarios) del
esqueleto sin ningún cambio de byte y anexa los 8 requisitos `CAN1-CAN8` (13 escenarios): 10 requisitos
y 17 escenarios totales, confirmados por lectura directa del archivo resultante tras la fusión.

## Estado de las tareas

Las 9 tareas están completas, con commit de unidad de trabajo confirmado en `git log` de la rama:

| Tarea | Título | Commit(s) | Evidencia (verify-report.md) |
|---|---|---|---|
| T1 | Fixtures reales de Chatwoot anonimizados + verificación D13/`X-Chatwoot-Delivery` | `d55a07a` | Insumo de T2/T3/T7; sin escenario propio |
| T2 | Dominio puro de canales: firma, traducción/redacción, perfil, claves | `ac7eede` (+ fix `5ab9370`) | CAN2, CAN3, CAN5(2), CAN8(2) (6 esc.) |
| T3 | Webhook + inbox + dedupe (`WebhookChatwootController`) | `fadff44` | R3(2), CAN1, R4 esc. 1 (4 esc.) |
| T4 | `plataforma/colas` + procesador del inbox | `72b6a12` | CAN4 (1 esc.) |
| T5 | Puerto de salida + adaptador Chatwoot | `f53faa6` | CAN6(3) (3 esc.) |
| T6 | `plataforma/outbox` genérico + migración `clave_idempotencia` | `86800d6` | Mecanismo genérico; sin escenario propio |
| T7 | `SalidaCanalOutbox` + reconciliación + e2e de cero duplicados | `e4920b6` | CAN7(2), R4 esc. 2 (3 esc.) |
| T8 | Entorno local de Chatwoot portado (`infra/chatwoot/`) | `d40fdf4` (+ fix `8cac7af`) | Infraestructura; sin escenario de spec |
| T9 | Cierre documental: doc 04 §3, skill de Meta, skill de arquitectura | `9e4a10c` | Documentación; sin escenario de spec |

**Fix post-`judgment-day`**: `e38653a` — corrige el hallazgo CRITICAL confirmado por el orquestador
(backoff de `Retry-After`/`esperaSugeridaS` sin acotar a `OUTBOX_BACKOFF_MAX_S` en
`publicador-outbox.ts`, contradiciendo D12 de `design.md`). RED observado (test forzando
`esperaSugeridaS=999999`, fallaba con "expected 999999 to be <= 300"), luego GREEN, con
lint/typecheck/408 unitarios/120 integración/fronteras todos en verde tras el fix.

**Commits totales**: 13 (9 de tarea + 2 correcciones intra-fase de `sdd-apply` + 1 fix post-`judgment-
day`), todos en `fase-04-canal-chatwoot` (rango `d55a07a`..`e38653a`), ninguno directo en `main`. Sin
PRs todavía: push, PR y merge quedan como decisión del usuario (mismo criterio de las fases
anteriores).

### Cobertura de escenarios

Los 17 escenarios de `specs/canales/spec.md` (R3, R4, `CAN1-CAN8`) tienen cobertura de test real y
pasan en verde, confirmado en `verify-report.md` leyendo el contenido de cada test (no solo su
título). 15 de 17 tienen además un test con el título exacto que exige la "Nota de implementación" de
la spec; 2 (R3 "Evento con firma válida", R4 "Reintento del proveedor sobre un evento entrante") solo
tienen tests con título extendido — comportamiento probado y correcto, defecto de nomenclatura/
trazabilidad literal, no de cobertura (hallazgo W1 de `sdd-verify`, ver abajo).

### Resultados de verificación

De `verify-report.md`:

```
npm run lint                    → OK: sin errores
npm run typecheck               → OK: sin errores
npm run prisma:generar          → OK: cliente generado (Prisma 7.10.0)
npm run fronteras               → OK: sin violaciones (229 módulos, 533 dependencias)
npm test (unit)                 → OK: 73 archivos, 408 tests
npm run test:integracion        → OK: 26 archivos, 120 tests (corrido dos veces de forma aislada,
                                    ambas en verde; ver hallazgo ambiental abajo)
npm run test:e2e                → OK: 2 archivos, 9 tests (incluye canal-chatwoot.e2e-spec.ts,
                                    criterio de salida de la fase)
npm run contrato:deriva         → OK: openapi.interno.json / openapi.json byte a byte
npm run verify (secuencia)      → Falló en 2 puntos, ambos confirmados ambientales (no de la fase):
                                    condición de carrera preexistente en base-por-worker.setup.ts al
                                    crear bases por plantilla bajo alta contención, y un timeout de
                                    CAN4 bajo carga combinada (unitarios+integración+7 contenedores
                                    Docker simultáneos) — reproducido en verde de forma aislada
```

El criterio de salida de la fase (`docs/fases/README.md` fila 04: evento firmado → registro en inbox →
procesado una vez; envío con reintento → cero duplicados) está probado de punta a punta por
`test/e2e/canal-chatwoot.e2e-spec.ts` (T7), en verde.

## Veredicto de `judgment-day` (revisión ciega doble, obligatoria para esta fase)

Transcripción completa en `verify-report.md`. Resumen:

- `target_identity`: `fase-04-canal-chatwoot @ 9e4a10c` (base `7e5bae1`), fix en `e38653a`.
- **1 confirmado (CRITICAL)**: backoff de `Retry-After` sin acotar en `publicador-outbox.ts`,
  contradecía D12. Verificado por el orquestador leyendo el código directamente. Corregido en
  `e38653a`, RED→GREEN observado, todos los checks en verde tras el fix.
- **1 sospecha (suspect, solo un juez)**: posible condición de carrera entre
  `abortarSecuencia()`/`marcarMuerta()` y un segundo publicador concurrente sobre la misma secuencia.
  No verificada ni corregida — deuda documentada abajo.
- **1 informativo (info, solo un juez)**: adjunto de video de Chatwoot mapeado como
  `tipoContenido: 'imagen'` en vez de una variante propia. Cosmético — deuda documentada abajo.
- `terminal_state: approved`.

`sdd-verify` re-verificó de forma independiente ambos hallazgos no corregidos (leyendo el código
línea por línea, no solo transcribiendo el veredicto): ambos confirmados como deuda real, no
corregida por esta fase.

## Documentación actualizada al cerrar

1. **`docs/fases/README.md`** — fila de la Fase 04 marcada `cerrada`; nota de archivo actualizada para
   referenciar las seis fases cerradas (00a, 00b, 01, 02, 03, 04) y los 5 hallazgos abiertos de esta
   fase.
2. **`docs/migracion/inventario.md`** — filas migradas por esta fase, cada una marcada **Migrado** con
   su destino real y tarea: `webhook/verifySignature.ts`/`parseEvent.ts` → conservado en
   `canales/infraestructura/chatwoot/{verificar-firma,traducir-evento}.ts` (T2);
   `webhook/router.ts`/`webhook/dedupe.ts` → rediseñado en el controlador del webhook + inbox
   `evento_entrante` (T3); `chatwoot/enviarMensaje.ts`/`idempotencia.ts` → rediseñado en el puerto de
   salida + adaptador Chatwoot + `plataforma/outbox` (T5-T7); `chatwoot/chatwootClient.*` → conservado
   en `ClienteChatwoot` (T5); `scripts/chatwoot-*.sh`/`infra/chatwoot/` → conservado/portado en
   `infra/` (T8, marcado **Migrado (parcial)**: el `.env` real sigue pendiente de copia manual, y
   `chatwoot-devolver-bot.sh` deliberadamente no se portó). El indicador "escribiendo…"
   (`meta/indicadorEscribiendo.ts`) **no** se marcó como migrado — sigue asignado a la Fase 08, sin
   tocar por esta fase, tal como se pidió.

No se tocó `.claude/skills/whatsapp-meta-conventions/` ni `.atl/skill-registry.md` desde este
archivado — T9 ya los actualizó durante `sdd-apply`, según su propio registro en `tasks.md`; este
cierre no repite ese cambio.

### Requisito de revisión

La Fase 04 requiere RDD por commit de unidad de trabajo **y `judgment-day` obligatorio antes de
`sdd-verify`** (04 está en la lista 04/05/06/10 de `docs/fases/README.md`, regla 6). Ambos se
cumplieron: `judgment-day` corrió sobre el rango de commits de la fase y aprobó (con un fix aplicado);
la transcripción completa vive en `verify-report.md`.

## Verificación de integridad del archivado

- **Origen**: `openspec/changes/fase-04-canal-chatwoot/` (bajo control de Git).
- **Destino**: `openspec/changes/archive/2026-09-28-fase-04-canal-chatwoot/` (movido con `git mv`).
- **Verificación del movimiento**: `diff -r` entre una copia (`cp -R`) del origen tomada antes del
  movimiento y el destino después del movimiento — salida vacía, código de salida 0 (`DIFF_STATUS=0`).
  Los mismos 4 artefactos del origen (`proposal.md`, `design.md`, `tasks.md`, `verify-report.md`,
  `specs/canales/spec.md`) están presentes en el destino, byte a byte, más este `archive-report.md`
  nuevo (aditivo, no existía en el origen).
- **Fusión de `canales`**: ejecutada por `gentle-ai sdd-archive-compose` (salida cero) — nunca por
  Read/Edit del modelo. Los 2 requisitos R3/R4 preexistentes (4 escenarios) quedan intactos; los 8
  requisitos `CAN1-CAN8` (13 escenarios) quedan anexados.
- **Directorio activo de changes**: `openspec/changes/` ya no contiene `fase-04-canal-chatwoot/`; solo
  queda `openspec/changes/archive/`.

## Trabajo pendiente y hallazgos abiertos (deuda declarada, no bloqueante)

**Ninguno bloquea el archivado ni la fusión del delta spec.** Esta fase se cierra con esta deuda
declarada explícitamente, tal como pidió el usuario para esta sesión, en vez de una completitud
sintética. 0 críticos, 3 advertencias (requieren decisión o acción del usuario) y 2 sugerencias
(menores, no bloqueantes).

### Advertencias (requieren decisión o acción del usuario)

1. **Condición de carrera potencial entre `abortarSecuencia`/`marcarMuerta` y un segundo publicador
   concurrente del outbox**: señalada como `suspect` por un solo juez de `judgment-day`, no verificada
   ni corregida. Si un segundo proceso reclamó ya un paso posterior (`SKIP LOCKED`, HTTP en vuelo) en
   el momento en que un fallo permanente de un paso anterior dispara `abortarSecuencia`, esa fila
   podría quedar marcada "secuencia abortada" pese a haberse entregado de verdad. **No bloqueante hoy**:
   el diseño (D12) asume explícitamente "un solo proceso publicador y orden estricto por grupo". Solo
   relevante si en el futuro se escala a más de un worker publicador de outbox — pendiente de
   revisión/corrección si esa decisión de escalado se toma.
2. **`infra/chatwoot/.env` real aún no copiado**: confirmado (`infra/chatwoot/` solo tiene
   `.env.example`, `docker-compose.yml`, `init/`). La migración de la instancia local de Chatwoot
   (proyecto Docker `chatwoot-local` ya en marcha) a la portada (`luxeborealcrm-chatwoot`, nombre que
   usan los scripts desde el fix `8cac7af`) requiere copiar manualmente
   `../ChatLuxeCRM/infra/chatwoot/.env` a `infra/chatwoot/.env` de este repo — bloqueado por permisos
   de sandbox del orquestador durante toda la fase. Pendiente de que el usuario lo copie a mano para
   completar la migración de la instancia temporal de Chatwoot a la portada.
3. **Adjunto de video mapeado como `tipoContenido: 'imagen'`**: señalado como `info` por un solo juez
   de `judgment-day`, confirmado en el código (`traducir-evento.ts:75`, mapa `TIPOS_ADJUNTO`).
   Cosmético/cuestión de tipos — `TipoContenido` (`evento-canal.ts`) no distingue `'video'` hoy de
   `'imagen'`. No bloqueante; ningún escenario depende de esta distinción.

### Sugerencias (menores, no bloqueantes)

4. **`scripts/chatwoot-devolver-bot.sh` deliberadamente no portado**: confirmado (el archivo no existe
   en `scripts/`). Decisión correcta según CLAUDE.md ("no se adelanta trabajo de fases futuras"): ese
   script depende de la máquina de estados bot/humano de la Fase 05. Se portará cuando esa fase exista.
5. **W1 — Dos de los 17 escenarios sin título de test exacto** (hallazgo de `sdd-verify`, no de
   `judgment-day`): `R3 — Evento con firma válida` y `R4 — Reintento del proveedor sobre un evento
   entrante` solo tienen tests con título extendido, no el título exacto que la "Nota de
   implementación" de `specs/canales/spec.md` exige como criterio de aceptación literal. El
   comportamiento subyacente está probado y en verde (confirmado leyendo el contenido de cada test);
   el defecto es exclusivamente de nomenclatura/trazabilidad, no de cobertura funcional faltante. Se
   recomienda, si se retoma esta fase o una futura la toca, renombrar esos 2-3 tests (incluido el test
   combinado de CAN5 a nivel de integración) a su título exacto.

## Aprendizajes clave para fases futuras

1. **Un hallazgo CRITICAL de `judgment-day` corregido dentro de la misma sesión debe re-verificarse en
   el código real, no solo en el mensaje del commit** — `sdd-verify` confirmó explícitamente que el fix
   de `e38653a` (`Math.min(fallo.esperaSugeridaS ?? 0, OUTBOX_BACKOFF_MAX_S)`) está en el código, no
   solo declarado. Esta doble verificación evita que un commit de "fix" quede sin el cambio real.
2. **Un test que combina supertest/superagent con `rawBody: true` de NestJS puede serializar un
   `Buffer` como JSON (`{"type":"Buffer","data":[...]}`) en vez de escribir bytes crudos cuando
   `Content-Type` es `application/json`** — descubierto en T3; la corrección fue enviar
   `fixture.rawBody.toString('utf8')` en vez del `Buffer` directo. Vale la pena que fases futuras con
   verificación de firma sobre body crudo prueben este detalle del harness explícitamente.
3. **Los errores del parser de body de Express (`entity.too.large`, `entity.parse.failed`) corren
   antes del router de NestJS y nunca llegan a un filtro de excepciones global** — confirmado con un
   test de integración real en T3; requirió un middleware dedicado (`traducirErrorDeCuerpo`) registrado
   con `app.use(...)` justo después del parser de body, tal como `design.md` ya anticipaba como plan de
   respaldo (D2).
4. **Un hallazgo `suspect`/`info` de `judgment-day` señalado por un solo juez sigue siendo deuda real
   que debe declararse explícitamente al cerrar**, incluso cuando el diseño actual lo hace no
   bloqueante (ej. la condición de carrera del outbox, no bloqueante mientras corra un solo proceso
   publicador) — no se debe descartar por no venir de ambos jueces.

## Estado del archivado

| Aspecto | Estado |
|---|---|
| Specs fusionadas a la principal | ✓ `canales` extendido (8 req./13 esc. nuevos, R3/R4 intactos) |
| Carpeta del change movida a archivo | ✓ con prefijo de fecha 2026-09-28, `diff -r` vacío |
| Artefactos preservados | ✓ proposal, design, specs, tasks, verify-report, archive-report |
| Documentación actualizada | ✓ `docs/fases/README.md`, `docs/migracion/inventario.md` |
| Suite de test en verde | ✓ 408 unitarios + 120 de integración (x2) + 9 e2e, según `verify-report.md` |
| `judgment-day` | ✓ `approved`, 1 CRITICAL corregido y re-verificado, 2 deudas documentadas |
| Tareas sin terminar | ✓ ninguna (9/9) |
| Hallazgos críticos | ✓ ninguno abierto (el único se corrigió en `e38653a`) |
| Bloqueadores | ✓ ninguno |
| Decisiones/acciones pendientes del usuario (no bloqueantes) | ⚠ condición de carrera del outbox (si se escala a multi-worker), copia manual de `infra/chatwoot/.env`, tipo de adjunto de video, nomenclatura de 2-3 títulos de test |

## Siguiente fase

Fase 05 (Conversaciones) es la siguiente cuando se autorice, según `docs/fases/README.md`. Depende de
esta fase (el puerto de salida único que Fase 04 construyó, `SALIDA_CANAL`, es el que Fase 05
reutilizará agregando la relectura del estado de la conversación antes de cada envío).

---

**Archivado por**: sesión interactiva de `sdd-archive` (ejecución directa de la fase, sin delegación
adicional).
**Ejecutado**: 2026-09-28
**Versión de esquema**: OpenSpec 2.0 (artefactos híbridos: OpenSpec + Engram)
