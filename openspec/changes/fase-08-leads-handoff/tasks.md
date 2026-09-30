# Tasks: Fase 08 — Leads y handoff

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio
(regla 6: solo 04/05/06/10).

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest** (`npm test`,
`npm run test:integracion`, `npm run test:e2e`, `npm run evals`); `npm run verify` al cerrar cada slice.
Las tareas con R9-R11 y R14 llevan transcripción completa del RED. Nunca se llama a Telegram real salvo
en la tarea `[manual]` marcada.

Rama: `fase-08-leads-handoff` (desde `main` con la 07 fusionada). Un commit de unidad de trabajo por
tarea, Conventional Commits (encabezado y líneas del cuerpo ≤ 100 caracteres: `npm run commits` antes de
subir), sin atribución de IA.

**Resultado: 9 tareas, dentro del límite de 10.**

## Checklist

- [x] T1 — Escala determinista, detector de "pide persona" y redactor de resumen (dominio de `leads`)
- [x] T2 — Módulo `leads`: persistencia, evaluación de la propuesta y binding real de `EVALUADOR_LEAD`
- [x] T3 — Política "pide persona" en el pipeline y motivo de handoff `pide-persona`
- [ ] T4 — Derivación dentro de horario: handoff `lead-caliente`, etiqueta y observadores de handoff
- [ ] T5 — Captura de datos fuera de horario
- [ ] T6 — Módulo `notificaciones` (Telegram por outbox) y aviso con ventana de 24 h `[manual]` parcial
- [ ] T7 — Recordatorios de leads sin atender
- [ ] T8 — Casos de evals y e2e por webhook de los flujos nuevos
- [ ] T9 — Cierre documental

## Mapeo de escenarios por tarea (LDS 20 + NTF 10 + AGT 5 + CNV 3 = 38)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | LDS1 (5); LDS3 «Mencionar la palabra no es pedirla»; LDS2 «El resumen no lleva datos personales» | 7 |
| T2 | LDS2 (5 restantes); AGT11 «La propuesta que la escala no confirma no deriva», «Sin cobertura no se evalúa el lead» | 7 |
| T3 | LDS3 (3 restantes); AGT14 (2); CNV11 «Petición de persona pasa a handoff pendiente» | 6 |
| T4 | AGT11 «La propuesta confirmada por la escala deriva»; LDS4 «Dentro de horario no se captura, se deriva»; CNV11 «Lead caliente agrega su etiqueta», «El aviso solo se encola tras confirmar la transición» | 4 |
| T5 | LDS4 (3 restantes) | 3 |
| T6 | NTF1 (2), NTF2 (3), NTF3 (2), NTF4 (3) | 10 |
| T7 | LDS5 (3) | 3 |
| T8 | Evals guionadas de escala, "pide persona" y captura; e2e de los tres flujos | 0 nuevos |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.600 de autoría |
| 400-line budget risk | Medium: T2 y T6 pueden superarlo por naturaleza (TDD, ~60 % tests) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 → PR6 → PR7 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No (Q1-Q3 resueltas el 2026-09-30, P33-P35)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

| PR | Tareas | Estimado | Excepción anticipada | Comando enfocado | Rollback |
|---|---|---|---|---|---|
| PR1 | T1 | ~300 | No | `npm test -- modulos/leads` | Quitar el dominio de `leads` |
| PR2 | T2 | ~450 | Sí (fila de Risks) | `npm test -- leads agente` + `npm run test:integracion -- leads` | Volver a `EvaluadorLeadSinEscala` |
| PR3 | T3 | ~300 | No | `npm test -- agente conversaciones` | Quitar la política |
| PR4 | T4 | ~350 | No | `npm test -- conversaciones agente` + `npm run test:e2e` | Quitar el observador |
| PR5 | T5 | ~350 | No | `npm test -- leads agente` | Quitar la captura |
| PR6 | T6 | ~500 | Sí (fila de Risks) | `npm test -- notificaciones leads` + `npm run test:integracion -- notificaciones leads` | Quitar `notificaciones` |
| PR7 | T7+T8+T9 | ~450 | Sí (parte documental sin riesgo) | `npm run evals` + `npm run test:e2e` + `npm run verify` | Revertir barrido, casos y e2e |

---

## T1 — Escala determinista, detector de "pide persona" y redactor

**Objetivo**: D1, D3, D6. Funciones puras en `src/modulos/leads/dominio/`: `escala-lead.ts`,
`detectar-pide-persona.ts`, `redactar-resumen.ts`.

**RED → GREEN → REFACTOR**: RED (transcripción completa) con «LDS1 — Una señal fuerte confirma el lead»
y «LDS3 — Mencionar la palabra no es pedirla»; GREEN; REFACTOR: el vocabulario en una sola constante.

**Hecho cuando**: 7 escenarios en verde. Q1 resuelta (P33).

**Estado (cerrada)**: LDS1 (5), LDS3 «Mencionar la palabra no es pedirla» y LDS2 «El resumen no lleva
datos personales» (parte pura) en verde: 31 tests en `src/modulos/leads/dominio/`. Desviaciones: (1) el
detector de «pide persona» cubre además «Petición explícita…» y «Rechazar hablar con un bot también
deriva» (LDS3, pertenecen a T3 pero su función pura nace aquí) y una negación («no necesito un asesor»)
que no deriva. (2) `redactarResumen` falla cerrado: una cifra de 7 o más dígitos (p. ej. un presupuesto
de `$1.500.000`) también se omite. (3) `NOMBRES_SENALES` se exporta como tupla para que T2 arme el enum
de la herramienta.

**Review requerida**: RDD

## T2 — Módulo `leads`: persistencia, evaluación y binding real

**Objetivo**: D2, D3. `LeadsModule`, `RepositorioLead` (Prisma), `EvaluarPropuestaLead`, adaptador
`EvaluadorLeadDeLeads` en `agente`, herramienta con `senales` enum, efectos `lead-derivado`.

**RED → GREEN → REFACTOR**: RED con «LDS2 — La propuesta confirmada crea un lead derivado» (integración
contra Postgres); GREEN; REFACTOR: integración del upsert y de la redacción del resumen.

**Hecho cuando**: 7 escenarios en verde; `AgenteModule` ya no usa `EvaluadorLeadSinEscala`.

**Estado (cerrada)**: LDS2 (5) y AGT11 (2, ahora con la escala real) en verde, más `RepositorioLeadPrisma`
contra Postgres (4 tests de integración) y dos e2e por webhook (propuesta no confirmada guardada sin
derivar y con el teléfono redactado; señal fuerte → lead derivado). `EvaluadorLeadSinEscala` se eliminó.
Desviaciones: (1) «un lead abierto por conversación» lo garantiza el lock del turno (R8), sin restricción
única ni migración: anotado en `RepositorioLead`. (2) El puerto `EvaluadorLead` ganó `accion` y `leadId`
en su resultado; al modelo solo le llega `{ derivado, motivo? }`. (3) `id_producto` (id o SKU) se resuelve
a id real en el adaptador del agente con `ObtenerFichaProducto`; un producto no resoluble deja el lead sin
producto. (4) `LeadsModule` importa `HorarioModule`; por ahora el efecto `lead-derivado` solo se emite (T4
lo convierte en handoff) y `derivado: true` ya se guarda. (5) La decisión `capturar` fuera de horario (LDS4)
nace aquí en el caso de uso; sus instrucciones y el cierre de la captura son de T5.

**Review requerida**: RDD

## T3 — Política "pide persona" y motivo `pide-persona`

**Objetivo**: D6. `PoliticaPidePersona` en el pipeline, `MotivoHandoff` gana `pide-persona`,
`leads.RegistrarPidePersona`.

**RED → GREEN → REFACTOR**: RED con «LDS3 — Petición explícita de hablar con una persona»; GREEN;
REFACTOR: el orden del pipeline se declara en un solo lugar.

**Hecho cuando**: 6 escenarios en verde.

**Estado (cerrada)**: LDS3 (4), AGT14 (2) y CNV11 «Petición de persona pasa a handoff pendiente» en verde
(`registrar-pide-persona.spec.ts`, `politica-pide-persona.spec.ts`, `procesar-turno.spec.ts`) y un e2e por
webhook nuevo (`test/e2e/leads.e2e-spec.ts`: la petición deriva sin llamar al LLM, con el lead guardado y la
conversación en `handoff_pendiente`; mencionar la palabra sigue al LLM). Desviaciones: (1) `pide_persona` no
está en el vocabulario de la escala: la escribe directamente `RegistrarPidePersona`. (2) Fuera de horario la
política registra el lead pendiente de captura y deja seguir el turno al LLM; las instrucciones de captura
llegan en T5. (3) El orden del pipeline sigue declarado en un solo lugar, la fábrica de `POLITICAS_TURNO` de
`agente.module.ts`.

**Review requerida**: RDD

## T4 — Derivación dentro de horario y observadores de handoff

**Objetivo**: D4, D7. `ContenidoLlm` traduce `lead-derivado` a handoff; `RegistroObservadoresHandoff`
en `conversaciones`; etiqueta `lead-caliente`.

**RED → GREEN → REFACTOR**: RED con «AGT11 — La propuesta confirmada por la escala deriva»; GREEN;
REFACTOR: un observador que lanza no revierte el handoff (test).

**Hecho cuando**: 4 escenarios en verde.

**Review requerida**: RDD

## T5 — Captura de datos fuera de horario

**Objetivo**: D5. `ObtenerCapturaPendiente`, `CompletarCaptura`, instrucciones de captura en
`ArmarContextoInicial`, puerto `CAPTURA_LEAD`, parámetro `mensaje_captura_completa`.

**RED → GREEN → REFACTOR**: RED con «LDS4 — Handoff fuera de horario dispara la captura de datos»;
GREEN; REFACTOR: la conversación permanece en `bot` en todos los tests.

**Hecho cuando**: 3 escenarios en verde. Q2 resuelta (P34).

**Review requerida**: RDD

## T6 — Módulo `notificaciones` y aviso con ventana de 24 h

**Objetivo**: D8, D9, D11. `Notificador`, `NotificadorTelegram`, manejador de outbox `notificacion.telegram`,
`AvisarLead` con `UPDATE ... RETURNING`, `TelegramFalso` en `test/soporte/`, variables de entorno.

**RED → GREEN → REFACTOR**: RED (transcripción completa) con «NTF2 — Dos derivaciones simultáneas avisan
una sola vez» y «NTF1 — El aviso no lleva datos personales completos»; GREEN; REFACTOR: integración del
manejador contra `TelegramFalso` (429/500/401).

**`[manual]` al final** (Q4): el usuario crea el bot y el grupo, pone las dos variables en su entorno y
corre un lead de prueba; se anota aquí el resultado.

**Hecho cuando**: 10 escenarios en verde; resultado `[manual]` anotado o marcado pendiente.

**Review requerida**: RDD

## T7 — Recordatorios de leads sin atender

**Objetivo**: D10. `RecordarLeads`, job repetible `barrido-leads`, `LEADS_RECORDATORIO_MIN`.

**RED → GREEN → REFACTOR**: RED con «LDS5 — Recordatorio a un lead sin atender»; GREEN; REFACTOR:
«El recordatorio no se repite» contra Postgres. Q3 resuelta (P35).

**Hecho cuando**: 3 escenarios en verde.

**Review requerida**: RDD

## T8 — Casos de evals y e2e por webhook

**Objetivo**: `test/e2e/leads.e2e-spec.ts` (lead confirmado dentro de horario → handoff, etiqueta y aviso
al `TelegramFalso`; fuera de horario → captura y aviso, la conversación sigue en `bot`; "pide persona")
y casos guionados en `test/evals/casos/sinteticos/` (escala confirmada, no confirmada, sin señal fuerte
no traspasa, captura).

**RED → GREEN → REFACTOR**: RED con el e2e de lead dentro de horario; GREEN (cableado); REFACTOR:
`npm run verify`, `npm run test:e2e` y `npm run evals` completos.

**Hecho cuando**: e2e y evals nuevos en verde.

**Review requerida**: RDD

## T9 — Cierre documental

`docs/migracion/inventario.md` (filas `leads/*`, `telegram/*`, `queue/leadsQueue.ts`,
`catalogo/notificar.ts`), `docs/fases/README.md`, `CLAUDE.md` si cambió algún comando,
`verify-report.md` con "qué aprendimos"; fusión de los delta specs y archivado.

**Hecho cuando**: checklist §12 de `luxeboreal-arquitectura` completo para la 08.

**Review requerida**: RDD

## Tareas `[manual]`

| Tarea | Qué hace el usuario | Bloquea | Por qué no se automatiza |
|---|---|---|---|
| T6 | Crear el bot de Telegram y el grupo, poner `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` en su entorno | Q4 | Credenciales que nunca entran al repo |
