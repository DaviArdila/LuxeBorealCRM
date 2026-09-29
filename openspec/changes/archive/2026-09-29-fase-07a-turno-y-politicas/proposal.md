# Proposal: Fase 07a — Contrato del turno y políticas deterministas

- Change: `fase-07a-turno-y-politicas` · Fase de la hoja de ruta: **07a** (primera de tres partes de la
  Fase 07, `docs/fases/README.md`) · Rama: `fase-07a-turno-y-politicas`
- Fecha: 2026-09-29 · Estado: **spec en revisión**
- Depende de: Fases 00a-06 y `politicas-contraentrega`, cerradas y archivadas.
- Análisis completo de la Fase 07 (qué se hereda, inconsistencias, migración, partición):
  `exploration.md` de este change.

## Intent

El agente real no se puede enchufar hoy: el puerto `GeneradorRespuesta` solo recibe
`{idMensaje, texto}` y solo devuelve texto. El agente no sabe si llegó un audio, en qué conversación
está, ni puede pedir un traspaso a humano. Además, la Fase 05 dejó tres huecos que se vuelven visibles
en cuanto el bot haga algo más que un eco: el estado no se espeja en Chatwoot (un traspaso quedaría
invisible para el asesor), la relectura de R5 es por lote y no por mensaje, y una respuesta vacía
lanzaría un error.

Este change deja el **turno** listo para el agente real y construye las reglas del turno que **no
necesitan LLM**: mensajes no textuales (R12), tope de turnos (R13), aviso de asistente automatizado
(R14) y traspaso a humano ejecutado por `conversaciones`. El agente de esta parte todavía termina en
un eco; la 07b lo reemplaza por el LLM sin tocar el contrato.

Éxito: por webhook firmado (e2e), un audio recibe el pedido de texto, un segundo audio deja la
conversación en `handoff_pendiente` con estado `open` en Chatwoot, una imagen recibe el pedido de
descripción, un sticker no produce nada, el primer texto recibe el eco con el aviso de datos, y al
llegar al tope de turnos la conversación pasa a un asesor.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde quedó |
|---|---|---|
| El agente nunca devuelve la conversación a `bot` | Ningún motivo de handoff del agente mapea a `bot` | **R6**, `openspec/specs/conversaciones/spec.md` |
| Toda salida al cliente pasa por `conversaciones` | Los pasos del agente salen por `EnviarRespuestaTurno` | **R5** |
| Textos al cliente como datos | Claves de `parametro`, con respaldo provisional en un solo lugar | **R15**; patrón de las Fases 05-06 |
| Sin PII ni contenido en logs | Los motivos de handoff y los tipos se loguean; el texto nunca | **R14** |
| Tiempo por `Clock` | Contadores con TTL vía Redis; lógica con `Clock` | skill `luxeboreal-arquitectura` §3 |
| Entrega | `auto-chain`, `stacked-to-main`, ~400 líneas por PR | Preflight 2026-09-23 |
| Review | RDD por commit; `judgment-day` **no** es obligatorio (07 no está en 04/05/06/10) | `CLAUDE.md`, regla 6 |

## Scope

### In Scope

1. **Contrato ampliado del turno** (`conversaciones`): el generador recibe el contexto (conversación,
   contacto, canal, versión, capacidades de salida) y los mensajes con su tipo de contenido; devuelve
   pasos de texto (la imagen se agrega en 07b) y un handoff opcional con motivo.
2. **El consumidor conserva el tipo de contenido** y solo lee el texto de Chatwoot cuando el mensaje es
   de texto.
3. **Handoff ejecutado por `conversaciones`**: primero salen los pasos, después la transición a
   `handoff_pendiente`.
4. **Espejo del estado en Chatwoot**: `handoff_pendiente`/`humano` → `open`; vuelta a `bot` por TTL o
   admin → `pending` (hueco de la Fase 05, I8).
5. **Relectura del estado por paso en el publicador** del outbox (R5 literal, aprendizaje 4 de la
   Fase 05): un paso cuya conversación ya no está en el estado requerido aborta el resto.
6. **Módulo `agente`** con el pipeline de políticas (A5), cableado por `AppModule` (ADR-0016).
7. **Políticas**: mensajes no textuales (R12, contador de audios), tope de turnos (R13), aviso de datos
   en el primer turno (R14), texto de handoff según horario, y un eco provisional al final.
8. **Regla de fronteras 15**: `conversaciones` no importa `agente`.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| LLM, bucle de herramientas, las 7 herramientas, historial, prompts, salida de imagen | 07b | Capa siguiente |
| Evals, set dorado, corrida manual, modelos de respaldo | 07c | Necesitan el agente completo |
| "Pide hablar con una persona" sin LLM, escala de leads, captura fuera de horario, Telegram | 08 | **R9-R11** |
| Geocodificación de la ubicación | Según P27 | Decisión de negocio pendiente |
| Indicador "escribiendo…" | 08 | Inventario (`meta/indicadorEscribiendo.ts`) |
| Endpoints | — | No hay endpoints nuevos |

## Qué se migra del prototipo

| Prototipo | Decisión | Destino | Motivo |
|---|---|---|---|
| `motor/enrutadorTipoMensaje.ts` | Rediseñar | `agente/aplicacion/politicas/politica-no-textuales.ts` | **A5**; textos a parámetros (**R15**) |
| `estado/contadorAudio.ts` | Rediseñar | `agente/infraestructura/redis/contadores-sesion-redis.ts` | Por sesión, no por número (**P1**) |
| Tope de turnos (`motor.ts:80-87`) | Rediseñar | `politica-tope-turnos.ts` | Por sesión bot (**P29**) |
| `mensajeHandoff(dentroHorario)` | Conservar la regla | `agente` (parámetros + `HORARIO`) | Visible al cliente |
| Espejo de status (`maquinaEstados.ts:99-106`) | Rediseñar | `conversaciones` (`TransicionarConversacion` + `SALIDA_CANAL`) | **A3**: la FSM no llama a Chatwoot; encola un efecto |
| `enviarMensaje` con `estadosPermitidos` (`chatwoot/enviarMensaje.ts:19-53`) | Rediseñar | Guardia de envío en el publicador del outbox | **R5** por paso, sobre el outbox (ADR-0004) |
| `aviso_datos` dentro del prompt | Rediseñar | Prefijo determinista (AGT2) | **R14** MUST, no "si el modelo se acuerda" |
| Tests: `mensajeNoTextual` (3), `handoffExplicito` (parte de transición) | Rediseñar (se reescriben, no se copian) | Unitarios de políticas + e2e | Regla de migración |

## Capabilities

### New Capabilities

- Ninguna spec nueva: los requisitos nuevos del agente van a `openspec/specs/agente/spec.md`
  (prefijo `AGT#`, sin colisión con `API#`/`CAN#`/`CAT#`/`CNV#`/`LLM#`).

### Modified Capabilities

- `conversaciones`: MODIFIED CNV6, R13; ADDED CNV7 (contexto del turno), CNV8 (handoff y espejo),
  CNV9 (relectura por paso).
- `agente`: MODIFIED R12; ADDED AGT1 (pipeline), AGT2 (aviso de datos), AGT3 (textos del agente).
- `canales`: ADDED CAN9 (guardia de envío por paso).

## Approach

Siete tareas (detalle en `tasks.md`): contrato + consumidor → handoff + espejo → guardia por paso →
módulo `agente` y cableado → R12 → tope + aviso → e2e y cierre. TDD estricto con Vitest (`npm test`,
`npm run test:integracion`, `npm run test:e2e`). Entrega en 4 PRs apilados (~2.000 líneas).

## Affected Areas

| Área | Impacto |
|---|---|
| `src/modulos/conversaciones/` | Modificado: contrato, consumidor, `ProcesarTurno`, `EnviarRespuestaTurno`, `TransicionarConversacion`, módulo dinámico, barril |
| `src/modulos/canales/` | Modificado: guardia de envío en `PublicarEfectoCanal`, barril (perfil de capacidades, guardia) |
| `src/modulos/agente/` | **Nuevo** |
| `src/app.module.ts` | `ConversacionesModule.conGenerador(AgenteModule)` |
| `src/plataforma/config/esquema.ts` | `AGENTE_TOPE_TURNOS`, `AGENTE_SESION_TTL_H` |
| `.dependency-cruiser.cjs` | Regla 15 |
| `prisma/`, `openapi/` | Sin cambio |

## Risks

| Riesgo | Prob. | Mitigación |
|---|---|---|
| El espejo a Chatwoot no comparte transacción con la transición | Media | Clave idempotente por versión; desviación de ADR-0004 anotada en `design.md` D3 |
| El eco de nuestro propio `toggle_status` vuelve como evento y dispara otra transición | Media | CNV5 ya ignora `open` fuera de `bot` y `pending` sobre `bot`; escenario propio en CNV8 |
| Cambiar la firma del puerto rompe los tests de integración de la Fase 05 | Alta | T1 adapta `AgenteEco` y los tests en el mismo commit |
| PR2 (T2+T3: handoff, espejo y guardia por paso) y PR3 (T4+T5: módulo `agente` y R12) superan ~400 líneas por naturaleza (TDD estricto, ~60 % tests) | Media | `size:exception` automática citando esta fila; ninguna tarea recorta tests |
| Tope de turnos por sesión cambia el comportamiento del prototipo | Baja | P29 con recomendación; default configurable |

## Rollback Plan

Revertir los PRs de la cadena. Sin esquema ni endpoints. El `AgenteEco` sigue existiendo como
generador por defecto de `ConversacionesModule`: quitar `conGenerador(AgenteModule)` de `AppModule`
vuelve al comportamiento de la Fase 05.

## Dependencies

Ninguna externa. Docker para integración y e2e (Testcontainers).

## Preguntas abiertas

| # | Pregunta | Bloquea | Recomendación |
|---|---|---|---|
| P27 | Ubicación entrante: ¿qué hace el bot? El prototipo nunca la usó y poblar ciudad/departamento exige geocodificación inversa (un tercero recibiría coordenadas del cliente) | Texto de R12 (07a) y su prueba en 07b | Sin geocodificar: la ubicación entra al turno como "el cliente compartió su ubicación" y el bot pide ciudad y departamento para cotizar |
| P28 | Ráfaga con texto y audio/imagen juntos: ¿qué gana? | No (default) | Si la ráfaga trae algún texto, gana el texto; la respuesta fija solo si no hay texto |
| P29 | ¿El tope de turnos y el historial se reinician cuando la conversación vuelve al bot? | No (default) | Sí: se cuentan por sesión bot (cambia la versión de la conversación) |
| P31 | Textos provisionales nuevos (`mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada`, `mensaje_handoff`, `mensaje_handoff_fuera_horario`, `aviso_datos`, y en 07b `mensaje_error_llm`) | No | Usar los textos del prototipo, que ya estuvieron en uso real; el negocio los cambia en `parametro` |

P27 bloquea solo el escenario de ubicación: si no se responde, 07a implementa el resto y ese escenario
queda con la recomendación marcada como provisional.

## Success Criteria

- [ ] El generador recibe tipo de contenido y contexto; devuelve pasos y handoff opcional.
- [ ] Audio, segundo audio, imagen, sticker y tope se comportan como R12/R13 por webhook (e2e).
- [ ] El primer turno de una conversación lleva el aviso de datos en el mismo mensaje.
- [ ] Un handoff deja `handoff_pendiente` y encola `open` en Chatwoot; una vuelta por TTL encola
  `pending`.
- [ ] Un paso cuya conversación salió de `bot` antes de publicarse no se envía y aborta el resto.
- [ ] `npm run verify` y `npm run test:e2e` en verde; cada escenario de los deltas tiene su test
  `<id> — <título>`.
