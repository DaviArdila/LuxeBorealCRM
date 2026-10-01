# Tasks: Fase 08d — Avisos al asesor con enlace a la conversación

Review requerida (por commit de unidad de trabajo): **RDD**. `judgment-day` **no** es obligatorio (regla 6: solo
04/05/06/10).

TDD estricto: RED observado → GREEN → REFACTOR. Runner **Vitest** (`npm test`, `npm run test:integracion`,
`npm run test:e2e`, `npm run evals`); `npm run verify` al cerrar cada slice. Nunca se llama a Telegram ni a un LLM
real salvo en la tarea `[manual]`. Sin cambio de esquema de base de datos (Q3 por defecto: Redis).

Rama: `fase-08d-avisos-con-enlace` (desde `main`). Un commit de unidad de trabajo por tarea, Conventional Commits
(encabezado y líneas del cuerpo ≤ 100 caracteres: `npm run commits` antes de subir), sin atribución de IA. Antes de
cada push, la batería completa de `CLAUDE.md`. Cada tarea cita su commit al cerrarse.

**Resultado: 7 tareas, dentro del límite de 10.**

## Checklist

- [x] T1 — Configuración nueva, `construirEnlaceConversacion` y `armarAviso` ampliado (motivo, producto, enlace) (`89e84fe`)
- [x] T2 — Los avisos de lead y el recordatorio llevan enlace y producto (`ObtenerReferenciaConversacion`) (`3a7c909`)
- [x] T3 — Aviso por todo traspaso sin lead (`AvisoTraspaso`, `EventoHandoff.version`, límite por instancia) (`8c961f8`)
- [x] T4 — Marca de «cliente esperando» en `conversaciones` (Redis) y su limpieza (`e204a81`)
- [x] T5 — `BarridoEsperas`, `ObservadorEsperaCliente` y `AvisoEsperaCliente` (`fbe99aa`)
- [x] T6 — Evals y e2e del recorrido completo
- [ ] T7 — Guía de operación, cierre documental y prueba real `[manual]`

## Mapeo de escenarios por tarea (NTF1 3 + NTF2 4 + NTF5 4 + NTF6 5 + NTF7 5 + CNV12 6 = 27)

| Tarea | Escenarios | # |
|---|---|---|
| T1 | NTF1 (3); NTF5 (4) | 7 |
| T2 | (sin escenarios nuevos: integración de NTF1/NTF5 sobre los avisos de lead existentes) | 0 |
| T3 | NTF2 (4); NTF6 (5) | 9 |
| T4 | CNV12 (6) | 6 |
| T5 | NTF7 (5) | 5 |
| T6 | Casos de evals y e2e (sin escenarios nuevos) | 0 |
| T7 | Guía y cierre | 0 |

## Tareas

### T1 — Configuración, enlace y aviso ampliado

- Variables `CHATWOOT_URL_PUBLICA`, `ESPERA_CLIENTE_MIN`, `ESPERA_CLIENTE_BARRIDO_MS` en el esquema Zod, con sus
  pruebas y `.env.example`.
- `construirEnlaceConversacion` (pura) y `DatosAviso` con `traspaso`/`espera`, `motivo`, `producto`, `enlace`,
  `esperaMin`; `armarAviso` redacta (R14) y pone el enlace en su propia línea.
- RED: pruebas de NTF5 (4) y NTF1 (3). Sin cableado todavía.
- Forecast: ~250 líneas (60 % tests). Ceremonia completa: toca R14.

### T2 — Los avisos de lead con enlace y producto

- `conversaciones` expone `ObtenerReferenciaConversacion`; `AvisarLead` y `RecordarLeads` arman el enlace y el
  nombre del producto (sin SKU) y degradan a «sin enlace» con `warn` si falta el id.
- Integración: un lead derivado deja una fila de outbox con el enlace.
- Forecast: ~250 líneas.

### T3 — Aviso por todo traspaso sin lead

- `EventoHandoff.version`; `AvisoTraspaso` (observador de los motivos que no son de lead); clave de idempotencia
  `traspaso:<conversacionId>:<version>:<motivo>`; texto por motivo; NTF2 por instancia.
- `npm run fronteras` confirma la dependencia `notificaciones → conversaciones`; si la rechaza, el observador se
  mueve a `leads` y se anota la desviación aquí.
- Integración contra la restricción única del outbox (reintento sin duplicar; otra versión avisa).
- Forecast: ~350 líneas.

### T4 — Marca de cliente esperando

- `MarcaEsperaCliente` (puerto, Redis y memoria): `registrar` (`ZADD NX`, no si ya avisada), `cerrar`,
  `vencidas(limite)`, `marcarAvisada`.
- `ConsumidorConversaciones` la registra cuando el mensaje llega en `humano`/`handoff_pendiente`; todo eco humano y
  toda transición a `bot` la cierran. Un fallo de Redis no frena el mensaje.
- Forecast: ~350 líneas.

### T5 — Barrido y aviso de espera

- `BarridoEsperas` (cola repetible, patrón de `BarridoVencimientos`), `RegistroObservadoresEspera`,
  `AvisoEsperaCliente`. Un aviso por espera; si el observador falla, se deshace la marca.
- Integración con Postgres y Redis reales y `ClockFalso`.
- Forecast: ~350 líneas.

### T6 — Evals y e2e

- E2E por webhook firmado: tope de turnos → aviso con enlace; cliente en `humano` sin respuesta → aviso de espera.
- Evals guionadas: **sin cambios (desviación anotada en `sdd-apply`, 2026-10-01)**. Las evals miden lo que el agente le
  dice al cliente; el aviso de Telegram sale de `notificaciones`, fuera del agente, así que una aserción de evals no lo
  alcanza. Que el aviso no lleve SKU ni datos personales lo cubren `armarAviso` (unitarias, con negativos) y los e2e.
- Los dos e2e no tuvieron un RED clásico (el comportamiento venía de T3 y T5): se hizo una **prueba de mutación**
  (quitar el registro de `AvisoTraspaso` y el de `AvisoEsperaCliente`) y ambos fallaron.
- El e2e de espera retrocede el instante de la marca en Redis en vez de adelantar el reloj: el webhook firmado valida
  su marca de tiempo contra el `CLOCK` de la app, y un reloj falso lo rechazaría.
- Forecast: ~250 líneas.

### T7 — Guía y cierre

- `docs/operacion/avisos-al-asesor.md` (qué avisos hay, qué dicen, cómo configurarlos, qué hacer si no llega el
  enlace), `CLAUDE.md` (mapa de documentación y variables), `docs/fases/README.md`, `docs/CONTEXTO_SESIONES.md`,
  `docs/PREGUNTAS_ABIERTAS.md`, `verify-report.md` y archivo del change.
- **`[manual]`**: aviso real en Telegram y enlace tocable desde el celular con un Chatwoot accesible (Q4); confirmar
  si el enlace usa `id` o `display_id` (Q5).

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1.400 de autoría (≈ 60 % tests) |
| 400-line budget risk | Medium: T3, T4 y T5 pueden acercarse por tests (TDD) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (T1, T2) → PR2 (T3) → PR3 (T4, T5) → PR4 (T6, T7) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |
