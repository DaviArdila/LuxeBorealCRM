# Verify Report — fase-05-conversaciones

- Change: `fase-05-conversaciones` · Rama: `fase-05-conversaciones`
- Verificado: 2026-09-28, contra el estado real del árbol de trabajo (commits `9b9416d`..`151949f`,
  13 commits, working tree limpio).
- Ejecutor: orquestador directamente (diagnóstico, sin autoridad de mutación adicional a la ya
  ejercida durante `sdd-apply`/judgment-day de esta misma sesión; no se corrigió nada nuevo en este
  paso). `sdd-verify` no pudo delegarse: el hook `PreToolUse:Agent` del entorno rechazó el dispatch
  a cualquier agente `sdd-*` con "SDD child dispatch refused" pese a confirmar el preflight canónico
  con `AskUserQuestion` dos veces — mismo defecto ya documentado en `proposal.md` (bloqueó
  `sdd-explore`) y en `tasks.md` T1 (bloqueó `sdd-apply`); los agentes de `judgment-day`
  (`jd-judge-a/b`, `jd-fix-agent`) sí se delegaron sin problema, así que el defecto parece específico
  de la ruta `sdd-*`, no de la delegación en general.

## Alcance verificado

1. Cada escenario de `specs/conversaciones/spec.md` (R5-R8, R13 parcial, CNV1-CNV6, 20 escenarios)
   tiene cobertura de test real, ejecutada de verdad (no solo inspección estática).
2. El criterio de salida de la fase (`docs/fases/README.md` fila 05: tests 6-9 y 15 del `SPEC.md`
   del prototipo §9, reescritos y en verde con un "agente eco").
3. `lint`, `typecheck`, `fronteras`, unitarios, integración, e2e.
4. Decisiones D1-D17 de `design.md` implementadas tal como quedaron fijadas (incluidas D16/D17,
   agregadas durante `sdd-apply` por vacíos reales del diseño original).
5. El veredicto completo de `judgment-day` (obligatorio para esta fase, regla 6 de
   `docs/fases/README.md`), transcrito y verificado en el código real, no solo en los commits.

## Checks ejecutados (comandos reales, no asumidos)

| Comando | Resultado |
|---|---|
| `npm run verify` (secuencia completa: prisma:generar → lint → typecheck → fronteras → deriva del contrato → unitarios + integración) | **Verde.** 111 test files, 602 tests passed (602). |
| `npm run test:e2e` | **Verde.** 2 test files, 9 tests passed (9). |
| `npm run fronteras` (incluida la regla 13 nueva, `solo-conversaciones-importa-canales`) | **Verde.** "no dependency violations found (259 modules, 632 dependencies cruised)". |

Los `ERROR` de `IndicadorPostgres`/`IndicadorRedis` que aparecen en el log de `npm run verify` son
esperados: `test/integracion/salud.spec.ts` apunta deliberadamente a un puerto inalcanzable para
probar el *health check* degradado (mismo patrón ya documentado en el `verify-report.md` de la
Fase 04). No es un hallazgo de esta fase.

## Escenarios de spec — cobertura real verificada

Se buscó cada título de escenario (`grep "it('<ID> — ..."`) en todo `src/` y `test/` y se confirmó
contra los títulos exactos de `specs/conversaciones/spec.md`.

| Requisito | Escenario (título exacto de la spec) | Título exacto en el código | Nivel |
|---|---|---|---|
| R5 | El estado cambia a humano mientras se envía una secuencia de varios mensajes | Sí | integración |
| R5 | El estado sigue en bot durante todo el envío | Sí | integración |
| R6 | Un origen no permitido no puede devolver la conversación a bot | Sí (x2) | unitario + integración |
| R6 | Un origen no permitido no puede llevar la conversación a pausado | Sí (x2) | unitario + integración |
| R6 | Un origen permitido devuelve la conversación a bot | Sí (x2) | unitario + integración |
| R7 | humano vence sin actividad del asesor | Sí | integración |
| R7 | handoff_pendiente vence sin ser recogido | Sí | integración |
| R7 | Un mensaje del asesor renueva la ventana de humano | Sí | integración |
| R8 | Eco humano durante la ventana de debounce cancela el job | Sí | integración |
| R8 | Dos procesamientos de la misma conversación no corren en paralelo | **No** (ver hallazgo W1) | — |
| R13 | Se supera el límite de mensajes por hora | Sí | integración |
| R13 | Se supera el límite de mensajes por día | Sí | integración |
| CNV1 | Cuatro mensajes del cliente en 3 segundos producen una sola invocación | **No** (ver hallazgo W1) | — |
| CNV2 | Tres mensajes entrantes en estado humano no generan ninguna respuesta | Sí | integración |
| CNV3 | El primer mensaje del cliente tras la espera recibe un único aviso | Sí | integración |
| CNV3 | Un segundo mensaje del cliente no repite el aviso | Sí | integración |
| CNV4 | Con el interruptor apagado, el mensaje se registra sin generar respuesta | Sí | integración |
| CNV5 | Un evento de estado "pending" sobre una conversación en manos humanas la devuelve al bot | Sí | integración |
| CNV5 | Un evento de estado "open" sobre una conversación en bot equivale a un eco humano | Sí | integración |
| CNV6 | El agente eco reenvía el texto del último mensaje del turno | Sí | unitario |

18 de 20 escenarios tienen al menos un test con el título exacto que `specs/conversaciones/spec.md`
exige. 2 no lo tienen — ver hallazgo W1 abajo. En los 20 casos el comportamiento subyacente sí está
probado y en verde (confirmado leyendo el contenido de cada test, no solo su título); el problema es
exclusivamente de nomenclatura/trazabilidad literal, no de cobertura funcional faltante — mismo tipo
de hallazgo (W1) que dejó abierto el `verify-report.md` de la Fase 04.

### Criterio de salida de la fase (tests 6-9 y 15 del prototipo)

- Test 6 (eco humano durante debounce → cero envíos): cubierto por `R8 — Eco humano durante la
  ventana de debounce cancela el job` (`consumidor-conversaciones.spec.ts`).
- Test 7 (eco humano después de generar, antes de enviar → cero envíos): cubierto por
  `R5 — El estado cambia a humano mientras se envía una secuencia de varios mensajes`
  (`enviar-respuesta-turno.spec.ts`).
- Test 8 (estado humano, tres mensajes → cero invocaciones): cubierto por `CNV2 — Tres mensajes
  entrantes en estado humano no generan ninguna respuesta`.
- Test 9 (expiración de `HUMANO_TTL_HORAS` → bot retoma solo): cubierto por `R7 — humano vence sin
  actividad del asesor`.
- Test 15 (ráfaga de 4 mensajes en 3 s → una invocación): cubierto funcionalmente por el test sin
  título exacto de CNV1 (ver W1) — el comportamiento sí está probado y en verde.

## Decisiones D1-D17 — verificación puntual

- **D2** (repositorio con bloqueo optimista, reintento único): confirmado en
  `repositorio-conversacion-prisma.ts` (`UPDATE ... WHERE version = $leida`) y
  `transicionar-conversacion.ts` (relee y reintenta una vez, `ConflictoDeVersionPersistente` en el
  segundo choque). Probado con conflicto de versión real en `transicionar-conversacion.spec.ts`.
- **D3/D4** (FSM pura, tipo `OrigenTransicion` cerrado): confirmado en `maquina-estados.ts`, sin
  imports fuera de sí misma (regla `dominio-aislado` en verde).
- **D6/D7** (debounce + lock): confirmado en `cola-turno.ts`/`lock-turno.ts`. Hallazgo real de
  `sdd-apply` ya documentado: BullMQ rechaza `:` en `jobId` (corregido antes del primer commit de
  T4, `turno-<id>` en vez de `turno:<id>`).
- **D9** (agente eco, contrato mínimo): confirmado en `agente-eco.ts`, con TSDoc explícito de
  *stand-in*.
- **D10** (punto único de salida, relectura antes de enviar): confirmado en
  `enviar-respuesta-turno.ts`. Ver D17 para la excepción documentada de T8.
- **D11** (barrido de vencimientos, sin `ENVIAR_RESPUESTA_TURNO`): confirmado en
  `barrido-vencimientos.ts` — ningún camino de `ejecutarBarrido` llama a `ENVIAR_RESPUESTA_TURNO` ni
  `SALIDA_CANAL`.
- **D12/D13** (marca de espera + parámetro `mensaje_espera_handoff`): confirmado en
  `marca-espera-handoff.ts` y `repositorio-parametro-conversaciones-prisma.ts`.
- **D14** (interruptor global, solo lectura, default activo): confirmado en
  `interruptor-global-redis.ts`.
- **D15** (registro en `AppModule` después de `CanalesModule`): confirmado en `app.module.ts`.
- **D16** (agregada en `sdd-apply`): `LECTOR_MENSAJE_CANAL` nuevo en `canales` porque `EventoCanal`
  nunca trae texto (R14/CAN5). Confirmado en `puertos/lector-mensaje-canal.ts` y su adaptador
  Chatwoot, exportado en `canales/index.ts` y en `canales.module.ts` (`exports`).
- **D17** (agregada en `sdd-apply`): el aviso de espera de T8 no puede pasar por
  `EnviarRespuestaTurno` porque exige `estado === 'bot'` literal (R5) y la conversación sigue en
  `handoff_pendiente`. Confirmado: `avisarEsperaSiCorresponde` llama a `SALIDA_CANAL` directamente,
  con su propia relectura de estado antes de enviar.

No se encontró ninguna decisión de D1-D17 implementada de forma distinta a lo que fija `design.md`.

## Veredicto de judgment-day (resumen fiel, corrido en esta misma sesión)

**JUDGMENT: APPROVED ✅** — target `c81b983..d6b4ecb` (T1-T8), 2 rondas de corrección (el máximo
permitido por el protocolo).

- **Ronda 1** — ambos jueces confirmaron un CRITICAL: `ConsumidorConversaciones.manejarMensajeEntrante`
  no era idempotente ante la reentrega del mismo evento (`ContadorRateLimit.verificarLimite`
  incrementaba sin deduplicar por `evento.idMensaje`; el puerto `ConsumidorEventosCanal` exige
  idempotencia explícitamente). Corregido en `ddb72d2` (+ `LectorMensajeCanalChatwoot.obtenerTexto`
  pasa a cumplir de verdad su contrato "nunca lanza") y `3270d9e` (el arnés de test de T8 no se
  había actualizado con el nuevo provider).
- **Re-juicio de la ronda 1**: ambos jueces confirmaron un CRITICAL **nuevo, causado por el propio
  fix**: la marca de idempotencia se creaba *antes* de que el trabajo real (rate limit, buffer,
  debounce, aviso de espera) terminara. Un fallo transitorio de Redis/Postgres/BullMQ a mitad de
  turno dejaba la marca puesta sin que el mensaje se hubiera bufferizado ni encolado — la reentrega
  posterior (reintento normal del inbox) se descartaba en silencio, perdiendo el mensaje del cliente
  para siempre. Cambiaba un bug de doble conteo por uno peor.
- **Ronda 2** (última permitida): corregido en `e17c5bd` — la marca de "procesado" se crea recién
  *después* de que el trabajo protegido termine sin lanzar (lectura de "¿ya procesado?" temprana y
  barata para el corto-circuito habitual; escritura solo al final, nunca en un `finally`).
- **Re-juicio final** (última ronda permitida): ningún juez encontró CRITICAL. Ambos coincidieron en
  que el criterio de "nunca perder un mensaje en silencio" debe primar sobre "nunca duplicar un
  conteo" cuando hay que elegir entre los dos ante un fallo transitorio genuino.

Re-verificado directamente en el código (no solo transcrito): se leyó `consumidor-conversaciones.ts`
completo — el único camino que llega a `marcarSiEsPrimeraVez` es el que sigue a un `await` exitoso
de `procesarTrasVerificaciones`; ningún camino de excepción llega a esa línea.

### Hallazgos WARNING/SUGGESTION de judgment-day (informativos, no bloqueantes, sin corregir)

1. `EnviarRespuestaTurno` relee el estado una sola vez y envía todo el lote de `pasos[]` en una
   llamada, en vez de releer antes de cada mensaje como pide la letra literal de R5 — hoy
   enmascarado porque `AgenteEco` siempre produce un único paso (CNV6); relevante cuando la Fase 07
   conecte un generador que produzca secuencias de varios pasos.
2. `ProcesarTurno.drenar` vacía el buffer de Redis antes de invocar el generador/envío; si
   cualquiera de los dos falla, los mensajes ya drenados se pierden (el reintento del job solo lleva
   `idConversacion`, no el contenido).
3. `LockTurno` no tiene *heartbeat*/renovación; un turno más largo que `LOCK_TURNO_TTL_S` (30 s por
   defecto) dejaría expirar el lock a mitad de proceso — no observable hoy porque `AgenteEco` es
   instantáneo, riesgo real cuando la Fase 07 conecte un generador LLM más lento.
4. `esquema.ts` no valida de forma cruzada `HANDOFF_ESPERA_MIN < HANDOFF_TTL_MIN`; una
   configuración inválida podría anular CNV3 en silencio.
5. `LectorMensajeCanalChatwoot.obtenerTexto() === null` se convierte en `''` y se envía como mensaje
   vacío al cliente, en vez de tratarse como un fallo de lectura.
6. `avisarEsperaSiCorresponde` crea la marca de espera antes de la relectura final de estado; una
   carrera con una transición concurrente fuera de `handoff_pendiente` podría dejar la marca huérfana
   y suprimir el aviso de un episodio de `handoff_pendiente` futuro dentro de la misma ventana de TTL.
7. (Ronda 2) Ventana estrecha entre `buffer.push` y `colaTurno.encolarConDebounce`: si el segundo
   falla tras el éxito del primero, un reintento exitoso puede duplicar una fila en el buffer del
   turno.
8. (Ronda 2) La guarda de idempotencia deja de ser atómica (lectura + trabajo + escritura, en vez de
   un único `SET NX`); no explotable hoy porque `ProcesadorInbox` corre con `concurrency: 1`, pero
   sería una condición de carrera real si en el futuro se escala a más de un worker de inbox
   concurrente sobre la misma cola.

## Hallazgos

### Nuevo, encontrado en esta verificación (no señalado por judgment-day)

**W1 — 2 de 20 escenarios de la fase no tienen un test con el título exacto** que
`specs/conversaciones/spec.md` exige (misma clase de hallazgo que W1 de la Fase 04):

- `R8 — Dos procesamientos de la misma conversación no corren en paralelo`: los tests que cubren
  este comportamiento usan títulos extendidos distintos (`procesar-turno.spec.ts:122` — "el segundo
  no adquiere el lock"; `test/integracion/conversaciones/procesar-turno.spec.ts:158` — "no producen
  dos respuestas"), ninguno usa el título exacto.
- `CNV1 — Cuatro mensajes del cliente en 3 segundos producen una sola invocación`: el test que cubre
  este escenario (`procesar-turno.spec.ts:100`) se llama "cuatro mensajes acumulados producen una
  sola invocación del generador" — título distinto, no exacto.

**Severidad: WARNING, no CRITICAL.** El comportamiento subyacente de ambos escenarios está probado y
pasa en verde de verdad (confirmado leyendo el contenido de cada test). El defecto es de
nomenclatura/trazabilidad literal, no de cobertura funcional faltante. No bloquea el criterio de
salida de la fase. Se recomienda, si se retoma esta fase o una futura la toca, renombrar esos 2
tests a su título exacto.

## `docs/migracion/inventario.md`

Filas 41-46, 54 (parcial) y 61 ya pasaron a **Migrado** durante T8 (commit `d6b4ecb`), con lo
pospuesto anotado explícitamente (contador de audio → Fase 07; disparo de `handoff_pendiente` y
notificación → Fase 08; escritura del interruptor global → Fase 09).

## ADR

Ningún ADR nuevo en esta fase (confirmado: `git diff --name-only main..fase-05-conversaciones --
docs/adr/` no devuelve archivos). Las decisiones D16/D17 tienen alternativas reales evaluadas, pero
son detalles de implementación dentro del alcance ya aprobado de la fase (no cambian una regla de
negocio ni una decisión de arquitectura transversal), así que quedaron documentadas en `design.md`
en vez de como ADR — consistente con el criterio de la skill `luxeboreal-fases` ("decisión con
alternativas reales → ADR" aplica a decisiones de alcance mayor, como Postgres-vs-Redis de fuente de
verdad en la Fase 05 original, ya cubierta por ADR-0003).

## Qué aprendimos que cambia las fases siguientes

1. **Patrón reutilizable para toda guarda de idempotencia futura**: marcar "hecho" *antes* de
   intentar un trabajo no-idempotente evita duplicados pero arriesga perder el trabajo en silencio
   si algo falla a mitad de camino; marcar *después* del éxito evita la pérdida pero puede
   reintroducir un duplicado más estrecho. Ante esa disyuntiva, priorizar "nunca perder" sobre "nunca
   duplicar" — un duplicado es visible y auditable (una fila de más, un conteo de más), una pérdida
   silenciosa no. La Fase 07 (motor real, más puntos de fallo por turno) y la Fase 08 (notificaciones
   a Telegram, outbox propio) deberían revisar sus propias guardas de idempotencia bajo este mismo
   criterio.
2. **`REPOSITORIO_CONTACTO` no existe** pese a que `design.md` de esta fase lo daba por resuelto
   desde la Fase 01/04. Cualquier fase futura que necesite resolver/crear un `Contacto` (Fase 08:
   leads; Fase 11: usuarios) debe verificar el estado real del repositorio antes de asumir que ese
   puerto ya existe.
3. **La guarda de idempotencia de `ConsumidorConversaciones` asume `ProcesadorInbox` con
   `concurrency: 1`** (hallazgo WARNING #8). Si alguna fase futura sube la concurrencia del inbox de
   `canales` por rendimiento, esta guarda deja de ser segura y necesita volver a un `SET NX`
   atómico de extremo a extremo (aceptando de nuevo el riesgo más estrecho de duplicado que la ronda
   2 introdujo a cambio de eliminar la pérdida silenciosa).
4. **`EnviarRespuestaTurno` relee el estado una sola vez para todo el lote de pasos** (hallazgo
   WARNING #1), no por mensaje como pide la letra literal de R5. La Fase 07, al conectar un
   generador real que sí produzca secuencias de varios pasos (collage + texto, por ejemplo), MUST
   resolver esto antes de que sea observable — hoy está enmascarado porque `AgenteEco` siempre
   produce un único paso.
5. **Un hook del entorno (`PreToolUse:Agent`) bloquea la delegación a cualquier agente `sdd-*`**
   (`sdd-explore`, `sdd-apply`, `sdd-verify` — probado en esta misma fase), pese a confirmar el
   preflight canónico repetidamente. Los agentes de `judgment-day` (`jd-judge-a/b`, `jd-fix-agent`)
   sí se delegan sin problema, así que el defecto parece acotado a la ruta `sdd-*` del orquestador,
   no a la delegación de sub-agentes en general. Cualquier fase futura debería asumir que `sdd-*` no
   se puede delegar hasta que esto se resuelva, y planear la implementación/verificación directa
   del orquestador como el camino normal, no como una contingencia.

## Resumen

- **CRITICAL**: 0 (los 2 encontrados por judgment-day — uno original, uno causado por su propia
  primera corrección — ya fueron corregidos y re-verificados en el código real).
- **WARNING**: 8 de judgment-day (informativos, deuda documentada, no bloqueantes) + 1 nuevo (W1,
  nomenclatura de 2 títulos de test no exacta).
- **SUGGESTION**: ninguna nueva de esta verificación.

**Todos los checks ejecutables pasaron en verde de forma real** (`npm run verify` completo, 602
tests; `npm run test:e2e`, 9 tests; `npm run fronteras` con la regla 13 nueva). Las 8 tareas de
`tasks.md` están marcadas `[x]` y sus 13 commits existen en la rama. El veredicto de judgment-day
está confirmado en el código, no solo en los mensajes de commit.

## Recomendación

**Lista para `sdd-archive`.** Ningún hallazgo es bloqueante: el criterio de salida de la fase está
probado de punta a punta (tests 6-9 y 15 del prototipo, vía sus equivalentes R5-R8/CNV2), el
CRITICAL de judgment-day está corregido y re-verificado dos veces, y los hallazgos abiertos (8
WARNING/SUGGESTION de judgment-day + W1 de nomenclatura) son deuda documentada explícitamente
aceptada, no defectos de comportamiento.
