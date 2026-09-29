# 0013. Circuit breaker de la pasarela LLM en memoria del proceso

- Estado: aceptada (2026-09-29)
- Fecha: 2026-09-28

## Contexto

El gateway de la Fase 06 (`openspec/changes/fase-06-pasarela-llm/design.md`, D5) necesita un circuit
breaker por modelo (umbral 5 fallos consecutivos de proveedor, ventana 60 s, 1 sonda en semi-abierto)
para no golpear a un proveedor caído ni quemar presupuesto de reintentos. Hay que decidir dónde vive
ese estado. Hechos: despliegue de un solo proceso en un solo VPS (ADR-0001, ADR-0006); el gateway es
singleton en el módulo `llm`; Redis ya está disponible (Fase 05 lo usa para lock/buffer/rate limit).

## Alternativas

1. **En memoria del proceso** (`Map` en el gateway): cero latencia, cero modo de fallo nuevo, se
   pierde al reiniciar (el circuito «olvida» y redescubre en ≤ 5 fallos).
2. **En Redis** (`llm:cb:<modelo>` con TTL): compartido entre instancias, sobrevive reinicios; añade
   1–2 roundtrips al camino crítico del turno y un modo de fallo más (si Redis cae, el CB no decide).

## Decisión

En memoria del proceso (alternativa 1). Con una sola instancia no hay nada que compartir y perder el
estado al reiniciar es benigno (el costo de redescubrir es ≤ 5 llamadas fallidas, cada una acotada
por el timeout D3).

La sonda del estado semi-abierto siempre se resuelve: un éxito o cualquier respuesta 4xx no
reintentable del proveedor cierran el circuito (el proveedor respondió; un 4xx nunca cuenta como
fallo), y un fallo reintentable lo reabre otros 60 s. Una sonda que nunca reporta (proceso
interrumpido a mitad de la llamada) se reemplaza por una nueva pasada otra ventana; sin esto el
modelo quedaba bloqueado hasta reiniciar (hallazgo C1 de `judgment-day`, Fase 06).

## Consecuencias

- El camino del turno no depende de Redis para decidir el circuito; menos latencia y menos fallos.
- Si algún día hay N réplicas, cada una aprende por su cuenta (se acepta hoy; con 1 réplica es
  indistinguible). Pasar a Redis requeriría un ADR nuevo que reemplace este.
- Prohibido: leer `process.env` o `Date.now()` para el circuito — el tiempo entra por `CLOCK`
  (reloj inyectado) y las transiciones son funciones puras testeables con `ClockFalso`.
