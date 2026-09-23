# 0003. Postgres como fuente de verdad del estado de conversación

- Estado: propuesta
- Fecha: 2026-09-22

## Contexto

En el prototipo el estado bot/humano vive en Redis (`conv:<n>:estado`) y se espeja en Postgres
(`estado_conversacion`) con dos escrituras sin transacción; si la segunda falla, quedan distintos.
La máquina de estados solo advierte ante transiciones inválidas y las permite
(`maquinaEstados.ts:59-63`). El estado es por número de teléfono, no por sesión, aunque ADR-008 del
prototipo establece que el escalamiento es de sesión.

## Alternativas

1. Mantener Redis como verdad + espejo (hoy).
2. Postgres como verdad, Redis como caché de lectura del estado.
3. Postgres como verdad, sin caché (lecturas directas).

## Decisión

Opción 3 para empezar: tabla `conversacion` (una fila por sesión) con `estado`, `expira_control_en`
y `version` para bloqueo optimista; cada transición es un `UPDATE … WHERE version = ?` en una
transacción que también escribe la outbox (ADR-0004). Redis se queda para lo efímero: buffer de
debounce, locks, dedupe, historial reciente, cachés. Si la latencia de lectura lo pidiera (no se
espera con este volumen), se agrega caché sin cambiar la fuente de verdad. La máquina de estados
**rechaza** transiciones inválidas.

## Consecuencias

- Una sola escritura autoritativa; nada que reconciliar tras un `FLUSHALL`.
- Transiciones y efectos (outbox) atómicos.
- Costo: una consulta a Postgres por lectura de estado (≈ms), aceptable con decenas de
  conversaciones por hora.
- Pendiente de P3 (`docs/PREGUNTAS_ABIERTAS.md`): si se guarda o no el historial de mensajes.
