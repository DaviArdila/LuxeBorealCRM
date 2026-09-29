# Tasks: Fase 07a — Contrato del turno y políticas deterministas

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio:
la Fase 07 no está en la lista 04/05/06/10 (`docs/fases/README.md` regla 6, `CLAUDE.md` §Flujo).

TDD estricto (`openspec/config.yaml` `strict_tdd: true`): por tarea, RED observado → GREEN →
REFACTOR. Runner: **Vitest** — `npm test` (proyecto `unit`), `npm run test:integracion`,
`npm run test:e2e`. `npm run verify` al cerrar cada slice de PR. Las tareas de reglas R1-R16 (R5,
R6, R12, R13, R14) llevan transcripción completa del RED, no resumen (ceremonia proporcional al
riesgo, `luxeboreal-fases` §5).

Rama: `fase-07a-turno-y-politicas` (desde `main`). Un commit de unidad de trabajo por tarea,
Conventional Commits, sin atribución de IA.

**Resultado: 7 tareas, dentro del límite de 10.**

## Checklist

- [x] T1 — Contrato ampliado del turno + consumidor con tipo de contenido
- [x] T2 — Handoff ejecutado por conversaciones + espejo del estado en el canal
- [x] T3 — Guardia de envío por paso (R5 literal)
- [x] T4 — Módulo agente: pipeline, composición por AppModule y regla de fronteras 15
- [ ] T5 — Política de mensajes no textuales (R12) + contador de audios + textos del agente
- [ ] T6 — Tope de turnos por sesión (R13) + aviso de datos (R14)
- [ ] T7 — E2E por webhook + cierre documental

## Mapeo de escenarios por tarea (29)

| Tarea | Escenarios (título exacto en el delta) | # |
|---|---|---|
| T1 | CNV6 «El agente eco reenvía el texto del último mensaje del turno»; CNV7 (3); CNV8 «Una respuesta sin pasos no envía ningún mensaje» | 5 |
| T2 | CNV8 «El generador pide handoff y la conversación queda esperando a un asesor», «La vuelta al bot por vencimiento se espeja como pendiente», «Una vuelta al bot que vino del canal no se espeja», «El eco del espejo abierta no vuelve a transicionar» | 4 |
| T3 | CAN9 (2); CNV9 (2) | 4 |
| T4 | AGT1 «Un turno de texto llega hasta la generación de contenido» | 1 |
| T5 | R12 (6: todos salvo «Ubicación entrante», que es de 07b); AGT1 «Una política que responde corta el resto del pipeline»; AGT3 «Un texto configurado por el negocio reemplaza al de respaldo», «Sin el parámetro se usa el texto de respaldo» | 9 |
| T6 | R13 «Tope de turnos alcanzado», «Una sesión nueva reinicia el conteo de turnos»; AGT2 (3); AGT3 «Fuera de horario el handoff usa su propio texto» | 6 |
| T7 | Sin escenarios nuevos: confirma a nivel e2e, con el mismo título, R12 «Primer audio del cliente», «Segundo audio consecutivo», «Imagen entrante», «Tipo no manejado», AGT2 «La primera respuesta de la conversación lleva el aviso en el mismo mensaje» y R13 «Tope de turnos alcanzado» | 0 |

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~2.000 de autoría (estimación de planeación; cada tarea anota su diff real) |
| 400-line budget risk | High: PR2 y PR3 lo superan por naturaleza (fila de Risks de `proposal.md`) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

| Tarea | Estimado | Anticipado en Risks |
|---|---|---|
| T1 | ~380 | No — preguntar si excede |
| T2 | ~300 | Sí (PR2) |
| T3 | ~280 | Sí (PR2) |
| T4 | ~350 | Sí (PR3) |
| T5 | ~250 | Sí (PR3) |
| T6 | ~250 | No — preguntar si excede |
| T7 | ~200 | No (parte documental sin riesgo) |

| PR | Tareas | Comando enfocado | Harness | Rollback |
|---|---|---|---|---|
| PR1 | T1 | `npm test -- modulos/conversaciones` + `npm run test:integracion -- conversaciones` | Postgres/Redis (Testcontainers) | Revertir contrato, consumidor, `ProcesarTurno`, `AgenteEco` |
| PR2 | T2+T3 | `npm test -- conversaciones canales` + `npm run test:integracion -- conversaciones outbox` | Testcontainers | Revertir espejo, handoff y guardia |
| PR3 | T4+T5 | `npm test -- modulos/agente` + `npm run fronteras` | Unitarios con dobles; Redis real para contadores | Quitar `conGenerador(AgenteModule)` de `AppModule` y el módulo `agente` |
| PR4 | T6+T7 | `npm test -- modulos/agente` + `npm run test:e2e` + `npm run verify` | Stack e2e con Chatwoot falso | Revertir políticas de tope/aviso y el e2e |

Cada PR usa como base `main` tras fusionar el anterior (skill `chained-pr`).

---

## T1 — Contrato ampliado del turno + consumidor con tipo de contenido

**Objetivo**: D1, D2, D5 de `design.md`. El generador recibe `SolicitudTurno` y devuelve
`RespuestaTurno`; el consumidor guarda `tipoContenido` y solo lee texto de Chatwoot si es `texto`;
`ProcesarTurno` arma el contexto con capacidades; una respuesta sin pasos no llama a la salida.

**Archivos**: `conversaciones/puertos/{generador-respuesta,salida-conversacion}.ts`,
`aplicacion/{consumidor-conversaciones,procesar-turno,enviar-respuesta-turno,agente-eco,capacidades-turno}.ts`,
`index.ts`; `canales/index.ts` (exporta `perfilDeCapacidades`); specs e integración de
`test/integracion/conversaciones/`.

**RED → GREEN → REFACTOR**:
1. RED: `procesar-turno.spec.ts` con «CNV7 — Un audio llega al generador con su tipo y sin leer texto
   de Chatwoot» y «CNV8 — Una respuesta sin pasos no envía ningún mensaje»; `npm test -- procesar-turno`
   debe fallar por tipo/compilación o por la llamada con 0 mensajes.
2. GREEN: contrato, consumidor, contexto, capacidades, eco adaptado.
3. REFACTOR: el buffer viejo sin `tipoContenido` se lee como `texto` (test propio).

**Hecho cuando**: 5 escenarios en verde; los tests de integración de la Fase 05 siguen en verde con la
firma nueva.

**Review requerida**: RDD

## T2 — Handoff ejecutado por conversaciones + espejo del estado en el canal

**Objetivo**: D3. Tras enviar los pasos, `ProcesarTurno` transiciona a `handoff_pendiente` con el
origen mapeado, cancela el job y vacía el buffer; `TransicionarConversacion` encola el espejo con la
tabla pura `espejoEstadoCanal`.

**Archivos**: `conversaciones/dominio/espejo-estado-canal.ts` (+spec),
`aplicacion/{procesar-turno,transicionar-conversacion}.ts` (+specs),
`test/integracion/conversaciones/{procesar-turno,barrido-vencimientos,consumidor-conversaciones}.spec.ts`.

**RED → GREEN → REFACTOR**:
1. RED: «CNV8 — El generador pide handoff y la conversación queda esperando a un asesor» con un
   generador doble que pide handoff; falla porque la conversación sigue en `bot`.
2. GREEN: handoff y espejo; los cuatro escenarios de T2.
3. REFACTOR: el eco de nuestro propio `abierta` es un no-op (escenario propio, integración).

**Hecho cuando**: 4 escenarios en verde (unitario + integración contra Postgres real y outbox real).

**Review requerida**: RDD

## T3 — Guardia de envío por paso (R5 literal)

**Objetivo**: D7. `canales` define `GuardiaEnvioCanal` y su registro; el publicador la consulta
antes de cada paso con `requiereEstado`; `conversaciones` registra su guardia y marca
`requiereEstado` en los pasos del turno (`bot`) y en el aviso de espera (`handoff_pendiente`).

**Archivos**: `canales/puertos/guardia-envio-canal.ts`, `aplicacion/registro-guardia-envio-canal.ts`,
`aplicacion/{salida-canal-outbox,publicar-efecto-canal}.ts`, `canales.module.ts`, `index.ts`;
`conversaciones/aplicacion/guardia-envio-conversaciones.ts`, `consumidor-conversaciones.ts`,
`enviar-respuesta-turno.ts`, `conversaciones.module.ts`; specs e integración con el outbox real.

**RED → GREEN → REFACTOR**:
1. RED: «CAN9 — La guardia niega el envío y la secuencia se aborta» en `publicar-efecto-canal.spec.ts`;
   falla porque el adaptador se llama igual.
2. GREEN: puerto, registro, consulta y `FalloPublicacion('permanente')`.
3. REFACTOR: «CNV9 — La conversación pasa a humano entre dos pasos ya encolados» a nivel de
   integración (publicador real + Postgres).

**Hecho cuando**: 4 escenarios en verde; los tests de canal de la Fase 04 siguen verdes (sin guardia
registrada, todo se envía como antes).

**Review requerida**: RDD

## T4 — Módulo agente: pipeline, composición por AppModule y regla de fronteras 15

**Objetivo**: D4, D6 (estructura), D9, D10 y ADR-0016. `AgenteModule` provee
`GENERADOR_RESPUESTA → MotorTurno` con `ContenidoEcoProvisional` como única política;
`ConversacionesModule.conGenerador`; `AppModule` compone; regla 15 con fixture; config
`AGENTE_TOPE_TURNOS`, `AGENTE_SESION_TTL_H`.

**Archivos**: `src/modulos/agente/**` (módulo, barril, `dominio/politica-turno.ts`,
`aplicacion/motor-turno.ts`, `aplicacion/politicas/contenido-eco-provisional.ts`, puertos y
adaptadores de D8/D9), `conversaciones/conversaciones.module.ts`, `src/app.module.ts`,
`src/plataforma/config/esquema.ts`, `.env.example`, `.dependency-cruiser.cjs`,
`test/fronteras/dependency-cruiser.spec.ts`, `test/fakes/*`.

**RED → GREEN → REFACTOR**:
1. RED: «AGT1 — Un turno de texto llega hasta la generación de contenido» en `motor-turno.spec.ts` y
   el fixture de la regla 15 (`npm run fronteras` no la detecta todavía).
2. GREEN: módulo, composición, regla.
3. REFACTOR: test de arranque (`Test.createTestingModule` con `AppModule`) confirma que
   `GENERADOR_RESPUESTA` resuelve a `MotorTurno`.

**Hecho cuando**: escenario en verde; `npm run fronteras` detecta el fixture; la app arranca.

**Review requerida**: RDD

## T5 — Política de mensajes no textuales (R12) + contador de audios + textos del agente

**Objetivo**: D6 (tabla R12), D8 (contador), D9 (textos). Función pura `decidirNoTextuales`, política,
contador Redis por sesión, repositorio de textos con respaldos del prototipo (P31).

**Archivos**: `agente/dominio/decidir-no-textuales.ts`, `aplicacion/politicas/politica-no-textuales.ts`,
`aplicacion/texto-handoff.ts`, `infraestructura/redis/contadores-sesion-redis.ts`,
`infraestructura/prisma/repositorio-parametro-agente-prisma.ts` (+specs, integración Redis/Postgres).

**RED → GREEN → REFACTOR**:
1. RED: «R12 — Segundo audio consecutivo» (transcripción completa): falla porque no hay política.
2. GREEN: los 6 escenarios de R12 de esta tarea + AGT1 «corta» + AGT3 (2).
3. REFACTOR: el texto del motivo `audio-repetido` usa `texto-handoff.ts` (compartido con T6).

**Hecho cuando**: 9 escenarios en verde; el contador expira con `AGENTE_SESION_TTL_H` (integración).

**Review requerida**: RDD

## T6 — Tope de turnos por sesión (R13) + aviso de datos (R14)

**Objetivo**: D6 (`PoliticaTopeTurnos`), D8 (primer turno = versión 0 y 0 turnos), función pura
`anteponerAviso`, registro del turno solo cuando `cuentaTurno`.

**Archivos**: `agente/dominio/aviso-datos.ts`, `aplicacion/politicas/politica-tope-turnos.ts`,
`aplicacion/motor-turno.ts` (+specs).

**RED → GREEN → REFACTOR**:
1. RED: «AGT2 — La primera respuesta de la conversación lleva el aviso en el mismo mensaje»
   (transcripción completa).
2. GREEN: tope, reinicio por sesión, aviso, texto fuera de horario (puerto `HORARIO` doble).
3. REFACTOR: un solo lugar decide "¿cuenta como turno?" (el motor, no cada política).

**Hecho cuando**: 6 escenarios en verde.

**Review requerida**: RDD

## T7 — E2E por webhook + cierre documental

**Objetivo**: confirmar el flujo completo por HTTP (webhook firmado → inbox → turno → outbox → Chatwoot
falso) y dejar la documentación al día.

**Archivos**: `test/e2e/agente-politicas.e2e-spec.ts`; `docs/migracion/inventario.md` (filas
`estado/buffer.ts, lock.ts, contadorAudio.ts`, `motor/*` parcial), `docs/fases/README.md` (estado de
07a), `MODELO_DATOS.md` §3 (claves de texto del agente, si el usuario aprobó P31).

**RED → GREEN → REFACTOR**:
1. RED: el e2e de «R12 — Segundo audio consecutivo» espera `toggle_status` `open` en el Chatwoot falso;
   falla si algo del cableado falta.
2. GREEN: ajustes de cableado (no de lógica).
3. REFACTOR: `npm run verify` y `npm run test:e2e` completos.

**Hecho cuando**: los 6 títulos de la tabla de mapeo pasan en e2e; checklist §12 de
`luxeboreal-arquitectura` completo para 07a.

**Review requerida**: RDD

## Tareas `[manual]`

Ninguna en 07a. La prueba con Chatwoot real queda para la corrida manual de 07c.
