# Tasks: Fase 05 — Conversaciones

Review requerida (por commit de unidad de trabajo): **RDD**. Además, esta fase **completa** (no cada
tarea) requiere **`judgment-day` obligatorio antes de `sdd-verify`** — `fase-05-conversaciones` está
en la lista 04/05/06/10 de `docs/fases/README.md` regla 6, confirmado en `proposal.md` §"Decisiones
ya tomadas". Ver sección "Review de la fase" al final; ninguna tarea individual la repite.

Convención de conteo (`openspec/config.yaml` §rules.tasks, "Máximo 10 tareas por change"): cada
**tarea** (`T1`…`T8`) es una unidad de trabajo completa que termina en **un solo commit**. Los seis
slices del Approach de `proposal.md` (`(a)`-`(f)`) se reparten en **8 tareas**, agrupando por orden
de construcción real (dominio → repositorio → efímero → debounce/lock/processor → consumidor →
salida → vencimientos → aviso de espera) en vez de una tarea por slice literal, porque `(b)` mezcla
piezas con dependencias internas distintas (repositorio Postgres vs. providers Redis) que conviene
separar para que cada `RED→GREEN` sea observable por sí solo.

**Resultado: 8 tareas, dentro del límite de 10.** No hace falta proponer partir la fase.

## Nota de conteo de escenarios (verificada línea por línea, 2026-09-28)

Esta fase implementa por primera vez **R5, R6, R7, R8** y **R13 (parcial)** (índice existente,
`SPEC.md` §4, sin spec propia todavía) y agrega el delta nuevo **CNV1-CNV6**
(`specs/conversaciones/spec.md` de este change). Total: **20 escenarios**:

- **R5 (2)**, **R6 (3)**, **R7 (3)**, **R8 (2)**, **R13 (2)**, **CNV1 (1)**, **CNV2 (1)**, **CNV3
  (2)**, **CNV4 (1)**, **CNV5 (2)**, **CNV6 (1)**.

R6 se prueba a **dos niveles** (unitario en T1, confirmado a nivel de integración en T2 con el mismo
título exacto), igual que CAN2/CAN3/CAN5 en la Fase 04.

## Checklist

- [x] T1 — Dominio FSM puro (`calcularTransicion`, `OrigenTransicion`) (S(a))
- [x] T2 — Repositorio de `Conversacion` (Prisma) + orquestación de transición con reintento de versión (S(b1))
- [x] T3 — Efímero en Redis: buffer, lock, contador de rate limit, interruptor global (S(b2)) — **desviación**: los tests de los cuatro *providers* quedaron en `test/integracion/conversaciones/redis-turno.spec.ts` (no colocados), porque necesitan Redis real y el proyecto `unit` de Vitest no levanta infraestructura; el comando de esta fila queda `npm run test:integracion -- redis-turno`, no `npm test -- .../redis`
- [x] T4 — Debounce + lock + processor del turno + "agente eco" (S(d)) — incluye D16 (`LECTOR_MENSAJE_CANAL` en `canales`, decidido con el usuario durante `sdd-apply`)
- [x] T5 — Consumidor de `CONSUMIDOR_EVENTOS_CANAL` + registro en `AppModule` (S(c)) — ver desviaciones abajo
- [x] T6 — Punto único de salida (`conversaciones/salida`) + regla de fronteras (S(e)) — clase adelantada en T5, aquí solo la regla 13 y su test dedicado
- [x] T7 — Barrido de vencimientos (S(f1))
- [ ] T8 — Aviso único de espera en `handoff_pendiente` + cierre documental (S(f2))

## Mapeo de escenarios por tarea (20 escenarios, R5+R6+R7+R8+R13+CNV1-CNV6)

| Tarea | Requisitos (primario) | # Escenarios primarios | Soporte (mismo escenario, otro nivel) |
|---|---|---|---|
| T1 | R6(3, unitario) | 3 | — |
| T2 | R7 esc. "Un mensaje del asesor renueva la ventana de humano"(1) | 1 | R6(3, integración, mismos títulos que T1) |
| T3 | — (providers efímeros, sin escenario propio de spec) | 0 | — |
| T4 | CNV1(1), CNV6(1) | 2 | R8 esc. "Dos procesamientos... no corren en paralelo"(1) |
| T5 | CNV2(1), CNV4(1), CNV5(2), R13(2), R8 esc. "Eco humano durante la ventana de debounce cancela el job"(1) | 7 | — |
| T6 | R5(2) | 2 | — |
| T7 | R7 esc. "humano vence..."(1), R7 esc. "handoff_pendiente vence..."(1) | 2 | — |
| T8 | CNV3(2) | 2 | — |
| **Total** | | **20** | |

R8 tiene 2 escenarios: "Dos procesamientos... no corren en paralelo" (primario T4, confirmado con el
lock real) y "Eco humano durante la ventana de debounce cancela el job" (primario T5, necesita el
consumidor real para disparar la cancelación).

## Matriz de amenazas aplicable a esta fase

| Vector | Mitigación | RED test | Tarea(s) |
|---|---|---|---|
| El bot escribe por encima de un humano (carrera cliente↔asesor) | Tres capas: debounce reemplazable (T4), cancelación en el eco (T5), relectura en la salida única (T6) | T5/T6 combinados reproducen los tests 6 y 7 del prototipo | T4, T5, T6 |
| Dos jobs de la misma conversación corriendo en paralelo | Lock `SET NX EX` por conversación (T3, T4) | segundo job no adquiere el lock, cero respuesta duplicada | T3, T4 |
| Transición de estado que se permite aunque no debería (**A6**) | `calcularTransicion` lanza, nunca solo `warn` (T1) | origen no permitido hacia `bot`/`pausado` → excepción | T1, T2 |
| Conflicto de escritura concurrente sobre `conversacion.version` | `UPDATE … WHERE version = $leida`, reintento único (T2) | dos transiciones concurrentes sobre la misma fila → una gana, la otra reintenta sobre estado fresco | T2 |
| Cliente en `humano` sigue costando turnos de LLM | El consumidor no encola nada mientras el estado no sea `bot` (T5) | tres mensajes en `humano` → cero invocaciones del generador | T5 |
| Interruptor global apagado no detiene realmente al bot | El consumidor lo verifica antes de encolar (T5) | interruptor apagado → mensaje registrado, cero respuesta | T5 |
| Aviso de espera repetido (spam al cliente) | Marca `NX` en Redis, una sola vez por episodio de `handoff_pendiente` (T8) | segundo mensaje del cliente en la misma espera → sin aviso adicional | T8 |
| `handoff_pendiente`/`humano` nunca vencen si el barrido no corre | Job repetible de BullMQ, mismo patrón que `plataforma/colas` de la Fase 04 (T7) | fila vencida → vuelve a `bot` con origen `ttl`, sin mensaje al cliente | T7 |

Ninguna tarea de esta fase agrega una fila propia distinta a las que `design.md` ya identificó.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2.550 líneas de autoría (estimación propia de `sdd-tasks`; cada tarea la corrige con su diff real al aplicarla) |
| 400-line budget risk | **Alto**: T5 (~460, consumidor + wiring de módulo + cinco escenarios de integración distintos), T4 (~420, cola + lock + processor + agente eco + integración BullMQ/Redis real). Medio en T2, T6, T7. Bajo en T1, T3, T8 |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → … → PR8 (8 tareas, ver abajo) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Alto

`Decision needed before apply: No` porque `auto-chain` ya trae la cadena `stacked-to-main` cacheada
desde el preflight de esta sesión y desde "Entrega" de `proposal.md`/`design.md`; `sdd-apply` procede
con T1 sin pedir confirmación adicional.

**Excepción automática vs. pregunta explícita, por tarea** (`openspec/config.yaml` §rules.tasks). La
fila 3 de Risks de `proposal.md` anticipa explícitamente **"presupuesto de ~400 líneas por slice con
dominio + infraestructura + processor + salida"**:

- **T4 (BullMQ + processor, infraestructura nueva), T5 (consumidor + wiring, infraestructura nueva)**:
  si el diff real confirma o supera el estimado, `size:exception` se aplica **automáticamente**,
  citando esa fila; `sdd-apply` no pregunta.
- **T2 (aplicación: reintento de versión), T6 (aplicación: salida única), T7 (aplicación: barrido)**:
  no son "infraestructura nueva" en el sentido de esa fila — si su diff real supera
  significativamente el presupuesto, `sdd-apply` **MUST pedir `size:exception`** antes de continuar.
- **T1, T3, T8**: bajo presupuesto esperado; T8 además cierra con documentación (sin riesgo de
  presupuesto en esa parte, `openspec/config.yaml` §rules.tasks).

Ninguna tarea recorta tests, comentarios ni documentación para acercarse al presupuesto.

Estimación de líneas de autoría por tarea (propia de `sdd-tasks`, no medida):

| Tarea | Archivo(s) principal(es) | Estimado | Anticipado en Risks de `proposal.md` |
|---|---|---|---|
| T1 | `dominio/maquina-estados.ts` + spec, `puertos/repositorio-conversacion.ts`, config (`HUMANO_TTL_HORAS`, `HANDOFF_TTL_MIN`) | ~180 | No (bajo presupuesto) |
| T2 | `infraestructura/prisma/repositorio-conversacion-prisma.ts`, `aplicacion/transicionar-conversacion.ts` + specs, test de integración | ~260 | No — pregunta si excede |
| T3 | `infraestructura/redis/{buffer-turno,lock-turno,contador-rate-limit,interruptor-global-redis}.ts` + specs, config (`LOCK_TURNO_TTL_S`, `RATE_LIMIT_POR_HORA`, `RATE_LIMIT_POR_DIA`) | ~230 | No (bajo presupuesto) |
| T4 | `infraestructura/colas/cola-turno.ts`, `aplicacion/{procesar-turno,agente-eco}.ts` + specs, config (`DEBOUNCE_MS`, `CONVERSACIONES_CONCURRENCIA`), test de integración | ~420 | **Sí** — fila 3 de Risks |
| T5 | `aplicacion/consumidor-conversaciones.ts` + spec, `conversaciones.module.ts`, `index.ts`, `app.module.ts`, test de integración (5 escenarios) | ~460 | **Sí** — fila 3 de Risks |
| T6 | `puertos/salida-conversacion.ts`, `aplicacion/enviar-respuesta-turno.ts` + specs, `.dependency-cruiser.cjs`, test de integración | ~280 | No — pregunta si excede |
| T7 | `infraestructura/colas/barrido-vencimientos.ts` + spec, config (`CONVERSACIONES_BARRIDO_MS`), test de integración | ~230 | No — pregunta si excede |
| T8 | `infraestructura/redis/marca-espera-handoff.ts`, `infraestructura/prisma/repositorio-parametro-conversaciones-prisma.ts` + specs, config (`HANDOFF_ESPERA_MIN`), `docs/migracion/inventario.md`, `docs/fases/README.md` | ~230 | No (bajo presupuesto en código; cierre documental sin riesgo) |
| **Total** | | **~2.290** | |

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | T1: dominio FSM puro (R6) | PR1 | `npm test -- modulos/conversaciones/dominio` | N/A — función pura, sin I/O | Revertir `src/modulos/conversaciones/dominio/**`, `src/modulos/conversaciones/puertos/repositorio-conversacion.ts` |
| 2 | T2: repositorio de `Conversacion` + reintento de versión (R6 confirmado, R7 parcial) | PR2 | `npm run test:integracion -- repositorio-conversacion` `npm run test:integracion -- transicionar-conversacion` | Postgres real (Testcontainers) | Revertir `src/modulos/conversaciones/{infraestructura/prisma/repositorio-conversacion-prisma,aplicacion/transicionar-conversacion}.ts` (+specs) |
| 3 | T3: buffer, lock, rate limit, interruptor global | PR3 | `npm test -- modulos/conversaciones/infraestructura/redis` | Redis real (Testcontainers) para los tests que lo requieran | Revertir `src/modulos/conversaciones/infraestructura/redis/**` |
| 4 | T4: debounce + lock + processor + agente eco (CNV1, CNV6, R8 lock) | PR4 | `npm run test:integracion -- procesar-turno` | Redis + BullMQ reales (Testcontainers) | Revertir `src/modulos/conversaciones/{infraestructura/colas/cola-turno,aplicacion/procesar-turno,aplicacion/agente-eco}.ts` (+specs) |
| 5 | T5: consumidor de eventos de canal (CNV2, CNV4, CNV5, R13, R8 eco) | PR5 | `npm run test:integracion -- consumidor-conversaciones` | Postgres + Redis reales; `EventoCanal` de prueba (sin depender de Chatwoot real) | Revertir `src/modulos/conversaciones/aplicacion/consumidor-conversaciones.ts` (+spec), `conversaciones.module.ts`, `index.ts`; revertir el `import` en `src/app.module.ts` |
| 6 | T6: punto único de salida (R5) | PR6 | `npm run test:integracion -- enviar-respuesta-turno` | Postgres + Redis reales + doble de `SALIDA_CANAL` | Revertir `src/modulos/conversaciones/{puertos/salida-conversacion,aplicacion/enviar-respuesta-turno}.ts` (+specs), regla nueva de `.dependency-cruiser.cjs` |
| 7 | T7: barrido de vencimientos (R7) | PR7 | `npm run test:integracion -- barrido-vencimientos` | Postgres real + `CLOCK` de prueba | Revertir `src/modulos/conversaciones/infraestructura/colas/barrido-vencimientos.ts` (+spec) |
| 8 | T8: aviso único de espera + cierre documental (CNV3) | PR8 | `npm run test:integracion -- marca-espera-handoff` | Redis + Postgres reales | Revertir `src/modulos/conversaciones/infraestructura/{redis/marca-espera-handoff,prisma/repositorio-parametro-conversaciones-prisma}.ts` (+specs); revertir cambios de `docs/migracion/inventario.md`, `docs/fases/README.md` |

Diagrama de dependencia (cadena lineal, `stacked-to-main`; cada PR se fusiona a `main` antes de abrir
el siguiente, siguiendo el orden de construcción de `design.md`):

```
PR1 (dominio FSM) → PR2 (repositorio + reintento) → PR3 (Redis efímero)
  → PR4 (debounce+lock+processor+eco) → PR5 (consumidor) → PR6 (salida única)
  → PR7 (barrido de vencimientos) → PR8 (aviso de espera + cierre)
```

---

## T1 — Dominio FSM puro

**Objetivo**: construir `calcularTransicion` (D3 de `design.md`): valida los orígenes permitidos
hacia `bot`/`pausado` (**R6**), calcula `expiraControlEn` con el `CLOCK` inyectado según el destino, y
**lanza** ante una transición con origen no permitido (**A6**). Sin I/O.

**Dependencias**: ninguna (primera tarea de la fase).

**Archivos** (`design.md`, tabla "File Changes", slice (a)):
- `src/modulos/conversaciones/dominio/maquina-estados.ts` + `.spec.ts` (Create) — `calcularTransicion`,
  `OrigenTransicion` (D3, D4).
- `src/modulos/conversaciones/puertos/repositorio-conversacion.ts` (Create) — token + interfaz (solo
  la firma; la implementación llega en T2).
- `src/plataforma/config/esquema.ts` + spec (Modify) — `HUMANO_TTL_HORAS`, `HANDOFF_TTL_MIN`.

**Escenarios cubiertos** (título exacto, `specs/conversaciones/spec.md`):
- `R6 — Un origen no permitido no puede devolver la conversación a bot`
- `R6 — Un origen no permitido no puede llevar la conversación a pausado`
- `R6 — Un origen permitido devuelve la conversación a bot`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `maquina-estados.spec.ts` con los tres escenarios contra la función inexistente. Correr
   `npm test -- modulos/conversaciones/dominio` y observar fallo.
2. GREEN: implementar `calcularTransicion` con la tabla de orígenes permitidos y el cálculo de
   `expiraControlEn` (`ahora + HUMANO_TTL_HORAS` para `humano`, `ahora + HANDOFF_TTL_MIN` para
   `handoff_pendiente`, `null` en los demás casos) hasta que los tres escenarios pasen.
3. REFACTOR: confirmar que el archivo no importa nada de `@nestjs/*`, `ioredis` ni Prisma
   (`dominio-aislado`); que el reloj llega como parámetro, nunca `Date.now()`/`new Date()` directo
   (R del CLAUDE.md sobre el reloj inyectado).

**Hecho cuando**:
- Los tres escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Un destino `bot`/`pausado` con cualquier otro origen lanza `TransicionInvalida` (o equivalente) sin
  mutar nada (función pura).
- `HUMANO_TTL_HORAS`/`HANDOFF_TTL_MIN` están en el esquema Zod con los defaults del prototipo (3 h,
  45 min).

**Comando de test**: `npm test -- modulos/conversaciones/dominio`

**Slice de PR**: S(a)

**Review requerida**: RDD

---

## T2 — Repositorio de `Conversacion` (Prisma) + orquestación de transición con reintento de versión

**Objetivo**: `REPOSITORIO_CONVERSACION` sobre la tabla `Conversacion` ya migrada (D2 de `design.md`):
buscar por `chatwootConversationId` (nunca por teléfono, **P1**), y `transicionar` con bloqueo
optimista (`UPDATE … WHERE version = $leida`) y **un** reintento ante conflicto. La aplicación
(`transicionar-conversacion.ts`) llama a `calcularTransicion` (T1) y después al repositorio.

**Dependencias**: T1 (`calcularTransicion`, `OrigenTransicion`).

**Archivos** (`design.md`, tabla "File Changes", slice (b)):
- `src/modulos/conversaciones/infraestructura/prisma/repositorio-conversacion-prisma.ts` + spec
  (Create) — `obtenerPorConversacionCanal`, `transicionar` con reintento de versión, `listarVencidas`
  (usada en T7).
- `src/modulos/conversaciones/aplicacion/transicionar-conversacion.ts` + spec (Create) — orquesta D3
  + repositorio.
- `test/integracion/conversaciones/transicionar-conversacion.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `R7 — Un mensaje del asesor renueva la ventana de humano`
- Confirmación de integración (mismo título que T1): `R6 — Un origen no permitido no puede devolver
  la conversación a bot`, `R6 — Un origen no permitido no puede llevar la conversación a pausado`,
  `R6 — Un origen permitido devuelve la conversación a bot`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `transicionar-conversacion.spec.ts` contra Postgres real (Testcontainers): los tres
   escenarios de R6 a nivel de integración, más el de R7 (dos ecos humanos seguidos, el segundo debe
   recalcular `expiraControlEn` desde su propio instante). Correr
   `npm run test:integracion -- transicionar-conversacion` y observar fallo.
2. GREEN: implementar el repositorio y la orquestación hasta que los cuatro casos pasen, incluido un
   test que fuerza un conflicto de versión (dos llamadas concurrentes) y confirma que la segunda
   reintenta sobre el estado fresco en vez de fallar.
3. REFACTOR: confirmar que `obtenerPorConversacionCanal` nunca busca por número/teléfono; que ningún
   archivo de esta tarea importa `@prisma/client` fuera de `infraestructura/` (regla 4/12).

**Hecho cuando**:
- Los cuatro escenarios listados pasan, con el título exacto del escenario como nombre del test,
  contra Postgres real.
- Un conflicto de versión simulado se resuelve con un reintento, sin propagar el error al primer
  intento.

**Comando de test**: `npm run test:integracion -- transicionar-conversacion`

**Slice de PR**: S(b1)

**Review requerida**: RDD

---

## T3 — Efímero en Redis: buffer, lock, contador de rate limit, interruptor global

**Objetivo**: los cuatro *providers* de Redis que el resto de la fase consume (D6, D7, D14 de
`design.md`), adaptados a NestJS (**A1**: sin abrir conexión al importar).

**Dependencias**: ninguna (independiente del dominio/repositorio; puede ir en paralelo con T1/T2 si
se quiere, pero se numera después por legibilidad del checklist).

**Archivos** (`design.md`, tabla "File Changes", slice (b)):
- `src/modulos/conversaciones/infraestructura/redis/buffer-turno.ts` + spec (Create) — `push`,
  `leerYVaciar` (atómico), `tamano`, `vaciar`.
- `src/modulos/conversaciones/infraestructura/redis/lock-turno.ts` + spec (Create) — `adquirir`,
  `liberar` (`SET NX EX`).
- `src/modulos/conversaciones/infraestructura/redis/contador-rate-limit.ts` + spec (Create) —
  `verificarLimite` (INCR + EXPIRE hora/día).
- `src/modulos/conversaciones/infraestructura/redis/interruptor-global-redis.ts` + spec (Create) —
  `estaActivo` (default `true` si la clave no existe).
- `src/plataforma/config/esquema.ts` + spec (Modify) — `LOCK_TURNO_TTL_S`, `RATE_LIMIT_POR_HORA`,
  `RATE_LIMIT_POR_DIA`.

**Escenarios cubiertos**: ninguno con id propio (providers de infraestructura, como T1/T8 de la Fase
04); habilitan CNV1/R8 (T4), CNV2/CNV4/R13/R8 (T5) y CNV3 (T8).

**RED → GREEN → REFACTOR** (planificado):
1. RED: un spec por archivo contra Redis real (Testcontainers): `buffer-turno` (push→leerYVaciar
   vacía y devuelve en orden; `tamano` refleja lo acumulado), `lock-turno` (segundo `adquirir` sobre
   la misma clave falla mientras la primera no libera), `contador-rate-limit` (cuenta correctamente
   por hora y por día, con `CLOCK` de prueba), `interruptor-global-redis` (`true` por defecto,
   respeta la clave si existe).
2. GREEN: implementar cada provider como *provider* de NestJS (sin abrir el cliente Redis al
   importar el módulo — se inyecta).
3. REFACTOR: confirmar que ningún archivo abre una conexión Redis propia fuera de la inyección de
   dependencias del módulo (**A1**).

**Hecho cuando**:
- Los cuatro *providers* pasan sus tests de implementación contra Redis real.
- Ninguno abre una conexión al importarse (verificable: importar el archivo sin el módulo de Nest no
  produce ningún efecto de red).

**Comando de test**: `npm test -- modulos/conversaciones/infraestructura/redis`

**Slice de PR**: S(b2)

**Review requerida**: RDD

---

## T4 — Debounce + lock + processor del turno + "agente eco"

**Objetivo**: cola BullMQ con `jobId` reemplazable por conversación (D6), processor que adquiere el
lock y drena el buffer en bucle mientras el estado siga `bot` (D8), y el adaptador *stand-in*
`AgenteEco` del puerto `GENERADOR_RESPUESTA` (D9).

**Dependencias**: T3 (buffer, lock).

**Archivos** (`design.md`, tabla "File Changes", slice (d)):
- `src/modulos/conversaciones/infraestructura/colas/cola-turno.ts` + spec (Create) —
  `encolarConDebounce`, `cancelarJobDiferido` (D6).
- `src/modulos/conversaciones/aplicacion/procesar-turno.ts` + spec (Create) — D8.
- `src/modulos/conversaciones/aplicacion/agente-eco.ts` + spec (Create) — D9, con TSDoc explícito de
  *stand-in*.
- `src/modulos/conversaciones/puertos/generador-respuesta.ts` (Create) — token + interfaz
  `RespuestaTurno`/`GeneradorRespuesta`.
- `src/plataforma/config/esquema.ts` + spec (Modify) — `DEBOUNCE_MS`, `CONVERSACIONES_CONCURRENCIA`.
- `test/integracion/conversaciones/procesar-turno.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `CNV1 — Cuatro mensajes del cliente en 3 segundos producen una sola invocación`
- `CNV6 — El agente eco reenvía el texto del último mensaje del turno`
- `R8 — Dos procesamientos de la misma conversación no corren en paralelo`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `procesar-turno.spec.ts` con los tres escenarios contra BullMQ + Redis reales (sin el
   consumidor todavía: el test encola directamente vía `encolarConDebounce` y llama al *handler* del
   processor). Correr `npm run test:integracion -- procesar-turno` y observar fallo.
2. GREEN: implementar `cola-turno.ts` (mismo patrón de reemplazo de job que `chatQueue.ts` del
   prototipo), `procesar-turno.ts` (adquiere lock, bucle de drenado, invoca `GENERADOR_RESPUESTA`,
   libera lock en `finally`) y `AgenteEco` (un único paso con el texto del último mensaje) hasta que
   los tres escenarios pasen.
3. REFACTOR: confirmar que un segundo job sobre la misma conversación mientras el primero tiene el
   lock no invoca `GENERADOR_RESPUESTA` una segunda vez; que el lock se libera incluso si el
   generador lanza (bloque `finally`).

**Nota de tamaño**: cola + lock + processor + agente eco + integración BullMQ/Redis real — está
**anticipada** por la fila 3 de Risks de `proposal.md`; `size:exception` automática si el diff real
la confirma.

**Hecho cuando**:
- Los tres escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Cuatro mensajes en 3 s producen exactamente una invocación de `GENERADOR_RESPUESTA.generar`.
- El agente eco devuelve un único paso con el texto del último mensaje, sin ningún campo de
  `handoff`.

**Comando de test**: `npm run test:integracion -- procesar-turno`

**Slice de PR**: S(d)

**Review requerida**: RDD

---

## T5 — Consumidor de `CONSUMIDOR_EVENTOS_CANAL` + registro en `AppModule`

**Objetivo**: `ConsumidorConversaciones` (D5 de `design.md`) traduce los tres tipos de `EventoCanal`
de la Fase 04 a las acciones de esta fase: `mensaje-entrante` (gateo por interruptor/rate-limit/
estado, después debounce), `mensaje-humano` (transición a `humano` + cancelación de job + vaciado de
buffer), `estado-conversacion` (transiciones equivalentes de `pending`/`resolved`/`open`). Se registra
en `onModuleInit` vía `RegistroConsumidorEventosCanal` (Fase 04).

**Dependencias**: T2 (repositorio/transición), T3 (rate limit, interruptor), T4 (debounce,
cancelación de job).

**Archivos** (`design.md`, tabla "File Changes", slice (c)):
- `src/modulos/conversaciones/aplicacion/consumidor-conversaciones.ts` + spec (Create) — D5, CNV5.
- `src/modulos/conversaciones/conversaciones.module.ts`, `index.ts` (Create) — D15.
- `src/app.module.ts` (Modify) — importa `ConversacionesModule` después de `CanalesModule`.
- `test/integracion/conversaciones/consumidor-conversaciones.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `CNV2 — Tres mensajes entrantes en estado humano no generan ninguna respuesta`
- `CNV4 — Con el interruptor apagado, el mensaje se registra sin generar respuesta`
- `CNV5 — Un evento de estado "pending" sobre una conversación en manos humanas la devuelve al bot`
- `CNV5 — Un evento de estado "open" sobre una conversación en bot equivale a un eco humano`
- `R13 — Se supera el límite de mensajes por hora`
- `R13 — Se supera el límite de mensajes por día`
- `R8 — Eco humano durante la ventana de debounce cancela el job`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `consumidor-conversaciones.spec.ts` con los siete escenarios, contra Postgres + Redis reales
   y `EventoCanal` de prueba (sin depender de Chatwoot real: los fixtures de la Fase 04 ya cubren la
   traducción, aquí se construye el `EventoCanal` directamente). Correr
   `npm run test:integracion -- consumidor-conversaciones` y observar fallo.
2. GREEN: implementar `ConsumidorConversaciones.consumir` con el switch de la tabla de D5 hasta que
   los siete escenarios pasen; registrar el módulo en `AppModule` y confirmar con un test de arranque
   que `RegistroConsumidorEventosCanal` ya no usa `ConsumidorRegistrador` por defecto.
3. REFACTOR: confirmar que el consumidor es idempotente ante una transición que no cambia nada
   (ADR-0004); que ninguna rama del switch importa `SALIDA_CANAL` directamente (eso es T6).

**Nota de tamaño**: consumidor + wiring de módulo + cinco escenarios de integración distintos — está
**anticipada** por la fila 3 de Risks de `proposal.md`; `size:exception` automática si el diff real
la confirma.

**Hecho cuando**:
- Los siete escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Con el interruptor apagado o el rate limit superado, el mensaje queda registrado (contacto/
  actividad) pero `GENERADOR_RESPUESTA` no se invoca ninguna vez.
- Un eco humano durante el debounce deja el buffer vacío y el job cancelado (verificable con
  `cola-turno`).

**Comando de test**: `npm run test:integracion -- consumidor-conversaciones`

**Desviaciones reales encontradas al implementar (`sdd-apply`, 2026-09-28)**:
1. `design.md` D2 asumía un `REPOSITORIO_CONTACTO` "ya resuelto por la Fase 01/04" — no existe en el
   repositorio. Se agregó `RepositorioConversacion.obtenerOCrear` (resuelve/crea el `Contacto` por
   `chatwootContactId` internamente); no se creó un puerto de `contactos` propio (regla 2, sin otro
   consumidor que lo justifique).
2. `ProcesarTurno` (T4) exige `ENVIAR_RESPUESTA_TURNO` para que Nest resuelva el árbol de
   dependencias; sin él, `AppModule` no compila. Se adelantó `aplicacion/enviar-respuesta-turno.ts`
   de T6 (la clase real, D10) — T6 ahora solo agrega la regla de fronteras y su test dedicado.
3. Bug real encontrado en el primer arranque completo (`test/e2e/aplicacion.e2e-spec.ts`):
   `CanalesModule` nunca exportaba `RegistroConsumidorEventosCanal` en su arreglo `exports` de
   Nest (solo en el barril TS `index.ts`) — Nest no lo resolvía fuera del módulo. Corregido en
   `canales.module.ts`.
4. Regresión real en `test/e2e/canal-chatwoot.e2e-spec.ts` (Fase 04): ese test registra su propio
   consumidor de prueba sobre `AppModule` completo; con `ConversacionesModule` ya registrado, su
   `onModuleInit` se adelantaba y el segundo `registrar` lanzaba (D8: "dos módulos no pueden
   competir"). Corregido con `.overrideModule(ConversacionesModule).useModule(ModuloVacio)` en ese
   test — sigue probando `canales` en aislamiento, como pretendía.

**Slice de PR**: S(c)

**Review requerida**: RDD

---

## T6 — Punto único de salida (`conversaciones/salida`) + regla de fronteras

**Objetivo**: `ENVIAR_RESPUESTA_TURNO` (D10 de `design.md`) relee el estado justo antes de encolar en
`SALIDA_CANAL` y aborta si no es `bot` (**R5**). Regla nueva de `dependency-cruiser`: solo
`modulos/conversaciones` puede importar `SALIDA_CANAL` (D15, previsto por D9 de la Fase 04).

**Dependencias**: T2 (lectura de estado), T4 (para conectar el processor con la salida real en vez de
un doble en el test de T4).

**Nota (adelantado en T5)**: `puertos/salida-conversacion.ts` se creó en T4 (necesario para el
contrato de `ProcesarTurno`) y `aplicacion/enviar-respuesta-turno.ts` se creó en T5 (Nest exige
`ENVIAR_RESPUESTA_TURNO` resuelto para que `AppModule` compile con `ConversacionesModule`
registrado). T6 parte de ahí: solo falta la regla de fronteras y el test dedicado de esta tarea.

**Archivos** (`design.md`, tabla "File Changes", slice (e)):
- `src/modulos/conversaciones/puertos/salida-conversacion.ts` (Create) — token + interfaz. **Ya
  creado en T4.**
- `src/modulos/conversaciones/aplicacion/enviar-respuesta-turno.ts` + spec (Create) — D10. **Clase
  ya creada en T5; falta su spec dedicado (unitario y/o el escenario propio de abajo).**
- `.dependency-cruiser.cjs` (Modify) — regla nueva. **Pendiente.**
- `test/integracion/conversaciones/enviar-respuesta-turno.spec.ts` (Create) — con un doble de
  `SALIDA_CANAL` que registra las llamadas. **Pendiente.**

**Escenarios cubiertos** (título exacto):
- `R5 — El estado cambia a humano mientras se envía una secuencia de varios mensajes`
- `R5 — El estado sigue en bot durante todo el envío`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `enviar-respuesta-turno.spec.ts` con los dos escenarios contra un doble de `SALIDA_CANAL`
   (registra si se llamó o no) y Postgres real para el estado. Correr
   `npm run test:integracion -- enviar-respuesta-turno` y observar fallo.
2. GREEN: implementar `EnviarRespuestaTurno.enviar`: relee el estado, si no es `bot` no llama al
   doble, si es `bot` lo llama con los pasos recibidos.
3. REFACTOR: correr `npm run fronteras` y confirmar que la regla nueva rechaza un `import` de prueba
   de `SALIDA_CANAL` desde otro módulo cualquiera.

**Hecho cuando**:
- Los dos escenarios listados pasan, con el título exacto del escenario como nombre del test.
- `npm run fronteras` falla si algo fuera de `modulos/conversaciones` importa `SALIDA_CANAL`.
- `src/modulos/conversaciones/aplicacion/procesar-turno.ts` (T4) ya usa `ENVIAR_RESPUESTA_TURNO` en
  vez de un doble.

**Comando de test**: `npm run test:integracion -- enviar-respuesta-turno`

**Slice de PR**: S(e)

**Review requerida**: RDD

---

## T7 — Barrido de vencimientos

**Objetivo**: job repetible de BullMQ (D11 de `design.md`, mismo patrón que `plataforma/colas` de la
Fase 04) que busca conversaciones vencidas en `humano`/`handoff_pendiente` y las devuelve a `bot`
sin enviar nada al cliente (**R7**).

**Dependencias**: T2 (`listarVencidas`, `transicionar`).

**Archivos** (`design.md`, tabla "File Changes", slice (f)):
- `src/modulos/conversaciones/infraestructura/colas/barrido-vencimientos.ts` + spec (Create) — D11.
- `src/plataforma/config/esquema.ts` + spec (Modify) — `CONVERSACIONES_BARRIDO_MS`.
- `test/integracion/conversaciones/barrido-vencimientos.spec.ts` (Create).

**Escenarios cubiertos** (título exacto):
- `R7 — humano vence sin actividad del asesor`
- `R7 — handoff_pendiente vence sin ser recogido`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `barrido-vencimientos.spec.ts` con los dos escenarios: una conversación en `humano`/
   `handoff_pendiente` con `expiraControlEn` en el pasado (`CLOCK` de prueba), correr el barrido,
   confirmar que vuelve a `bot` con origen `ttl` y que **no** se llama a `ENVIAR_RESPUESTA_TURNO`.
   Correr `npm run test:integracion -- barrido-vencimientos` y observar fallo.
2. GREEN: implementar `ejecutarBarrido` y `programarBarridoRepetible` hasta que los dos escenarios
   pasen.
3. REFACTOR: confirmar que un conflicto de versión en una fila del barrido se salta sin reintentar
   (D11: el próximo barrido la recoge).

**Hecho cuando**:
- Los dos escenarios listados pasan, con el título exacto del escenario como nombre del test.
- Ninguna transición del barrido invoca `ENVIAR_RESPUESTA_TURNO` ni `SALIDA_CANAL`.

**Comando de test**: `npm run test:integracion -- barrido-vencimientos`

**Slice de PR**: S(f1)

**Review requerida**: RDD

---

## T8 — Aviso único de espera en `handoff_pendiente` + cierre documental

**Objetivo**: la marca efímera que garantiza como máximo un mensaje de espera por episodio de
`handoff_pendiente` (D12) y el parámetro `mensaje_espera_handoff` propio de `conversaciones` (D13,
Q1 de la proposal). Cierra la fase: `docs/migracion/inventario.md` y `docs/fases/README.md`.

**Dependencias**: T5 (el consumidor es quien decide, sobre un mensaje entrante en
`handoff_pendiente`, si corresponde el aviso), T6 (envía el aviso por el punto único de salida).

**Archivos** (`design.md`, tabla "File Changes", slice (f)):
- `src/modulos/conversaciones/infraestructura/redis/marca-espera-handoff.ts` + spec (Create) — D12.
- `src/modulos/conversaciones/infraestructura/prisma/repositorio-parametro-conversaciones-prisma.ts` +
  spec (Create) — D13, con default embebido para `mensaje_espera_handoff`.
- `src/plataforma/config/esquema.ts` + spec (Modify) — `HANDOFF_ESPERA_MIN`.
- `src/modulos/conversaciones/aplicacion/consumidor-conversaciones.ts` (Modify) — agrega la rama de
  `handoff_pendiente` (D12) a `mensaje-entrante`.
- `test/integracion/conversaciones/aviso-espera-handoff.spec.ts` (Create).
- `docs/migracion/inventario.md` (Modify) — filas 41-46, 54 (parcial), 61 pasan a **Migrado**, con la
  nota de lo pospuesto (`contadorAudio`, disparo de `handoff_pendiente`, escritura del interruptor).
- `docs/fases/README.md` (Modify) — Fase 05 a `cerrada` (al terminar `sdd-verify`/`sdd-archive`, no
  en esta tarea; aquí solo se prepara el contenido).

**Escenarios cubiertos** (título exacto):
- `CNV3 — El primer mensaje del cliente tras la espera recibe un único aviso`
- `CNV3 — Un segundo mensaje del cliente no repite el aviso`

**RED → GREEN → REFACTOR** (planificado):
1. RED: `aviso-espera-handoff.spec.ts` con los dos escenarios (conversación en `handoff_pendiente`
   desde antes de `HANDOFF_ESPERA_MIN`, un mensaje del cliente después de esa ventana → un aviso; un
   segundo mensaje → ninguno). Correr `npm run test:integracion -- aviso-espera-handoff` y observar
   fallo.
2. GREEN: implementar la marca `NX` en Redis, el repositorio de parámetros y la rama nueva del
   consumidor hasta que los dos escenarios pasen.
3. REFACTOR: confirmar que la marca se limpia en cualquier transición que saca a la conversación de
   `handoff_pendiente` (revisar T2/T5); redactar el cierre de `docs/migracion/inventario.md` y
   `docs/fases/README.md` (fila 05 pasa a "spec en revisión" con la ruta del change, no a "cerrada"
   todavía — eso lo hace `sdd-archive`).

**Hecho cuando**:
- Los dos escenarios listados pasan, con el título exacto del escenario como nombre del test.
- `docs/migracion/inventario.md` refleja qué filas de la Fase 05 quedaron migradas y qué quedó
  explícitamente pospuesto (contador de audio → Fase 07; disparo de `handoff_pendiente`,
  notificación, captura fuera de horario → Fase 08; escritura del interruptor global → Fase 09).

**Comando de test**: `npm run test:integracion -- aviso-espera-handoff`

**Slice de PR**: S(f2)

**Review requerida**: RDD

---

## Review de la fase

Al completar T1-T8: correr `npm run verify` completo, `npm run test:e2e` si esta fase agrega algún
flujo observable de punta a punta (a confirmar — hoy no agrega endpoints HTTP nuevos, solo consumo
interno de eventos ya probado en integración), y luego la skill `judgment-day` sobre el rango de
commits `fase-05-conversaciones` (obligatorio, regla 6 de `docs/fases/README.md`) **antes** de
`sdd-verify`. El veredicto y cualquier corrección aplicada quedan documentados en `verify-report.md`
al cerrar la fase (`sdd-verify → sdd-archive`), no en este archivo.
