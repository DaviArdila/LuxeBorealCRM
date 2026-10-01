# Verify report: Fase 08d — Avisos al asesor con enlace a la conversación

- Fecha: 2026-10-01 · Rama: `fase-08d-avisos-con-enlace` (desde `main`, **sin subir**; el plan de entrega la parte en 4 PRs apilados)
- Change: `openspec/changes/archive/2026-10-01-fase-08d-avisos-con-enlace/`
- Guía de operación: [`docs/operacion/avisos-al-asesor.md`](../../../../docs/operacion/avisos-al-asesor.md)
- Commits de unidad de trabajo: spec `e6488d8`, aprobación `70a3080`, T1 `89e84fe`, T2 `3a7c909`, T3 `8c961f8`, T4 `e204a81`,
  T5 `fbe99aa`, T6 `3834ba7`; el cierre documental (T7) en el commit que archiva el change.

## Alcance verificado

Las siete tareas `[x]`. **T7 queda con un pendiente `[manual]`**: un aviso real en Telegram y el enlace abierto desde el
celular con un Chatwoot accesible. Todo lo automático está verificado contra Postgres y Redis reales, con la app completa,
BullMQ consumiendo de verdad y un Telegram simulado.

## Resultado por comando (rama completa)

| Comando | Resultado |
|---|---|
| `npm run lint`, `typecheck`, `fronteras` (485 módulos), `contrato:deriva` | Verde |
| `npm test` (unitarios) | 162 archivos, **1.167 tests**, todos pasan (partía de 1.080) |
| `npm run test:integracion` | 305 de 306; falla solo `prompts-build.spec.ts` (ver «Defectos de entorno») |
| `npm run test:e2e` | 6 archivos, **39 tests**, todos pasan (dos nuevos) |
| `npm run evals` | **APROBADA**, 0 críticas fallidas, 100 % |
| `npm run commits` | Los 8 commits válidos |

## Escenarios de la spec

Los 27 escenarios (NTF1 3 + NTF2 4 + NTF5 4 + NTF6 5 + NTF7 5 + CNV12 6) tienen su prueba; el mapa por tarea está en `tasks.md`.

| Requisito | Dónde se prueba |
|---|---|
| NTF1, NTF5 | `armar-aviso.spec.ts`, `enlace-conversacion.spec.ts`, `resolver-enlace-conversacion.spec.ts`, `armar-datos-aviso-lead.spec.ts`; e2e de leads (línea `Atender:`) |
| NTF2, NTF6 | `aviso-traspaso.spec.ts`, `procesar-turno.spec.ts` (versión del evento, transición fallida); e2e del tope de turnos |
| NTF7 | `procesar-esperas-clientes.spec.ts`, `aviso-espera-cliente.spec.ts`, `barrido-esperas.spec.ts` (Postgres y Redis reales); e2e del cliente que espera |
| CNV12 | `transicionar-conversacion.spec.ts` (cierre), `redis-turno.spec.ts` (adaptador), `consumidor-conversaciones.spec.ts` (registro) |

## Revisión (RDD)

El único candidato revisado con el flujo nativo fue la corrección del CSV de datos de prueba (`SKU-AS005`), **aprobada** con un hallazgo
informativo ya resuelto en la práctica (el importador aceptó la fila). Esa corrección es independiente de la 08d y **no está commiteada**.
Las ocho unidades de la 08d son commits locales; la revisión nativa por commit queda para cuando se preparen los PRs.

## Desviaciones respecto a la spec y por qué

1. **`ReferenciaConversacionModule`** además del caso de uso (D6): `notificaciones` necesitaba leer una conversación sin instanciar
   colas ni canales. Es un módulo mínimo, como `ObservadoresHandoffModule`.
2. **El cierre de la espera vive en `TransicionarConversacion`**, no en el consumidor (D4): así cubre también la vuelta a bot por
   vencimiento (`ttl`) y cualquier transición futura. Costó añadir una dependencia a ocho arneses de prueba.
3. **`notificaciones → conversaciones` pasó `npm run fronteras`** (D3): el plan B de mover el observador a `leads` no hizo falta.
4. **Las claves de Redis cuelgan de `COLAS_PREFIJO`**: es el prefijo que cada worker de pruebas ya aísla. Sin él, un barrido de un
   archivo de prueba habría reclamado las esperas de otro.
5. **`RegistroObservadoresEspera.notificar` devuelve un booleano** (D5), a diferencia del de handoff: el barrido lo necesita para devolver
   la espera y reintentar.
6. **T6 sin cambios en las evals**: miden lo que el agente le dice al cliente, no el aviso de Telegram. Lo cubren las unitarias y los e2e.
7. **El e2e de espera retrocede la marca en Redis en vez de adelantar el reloj**: el webhook firmado valida su marca de tiempo contra el
   `CLOCK` de la app.
8. **`CHATWOOT_URL_PUBLICA` vacía se trata como ausente** (`z.preprocess`): una variable de `.env` en blanco es lo habitual.
9. **El e2e de leads usaba el mismo número para el contacto y la conversación.** Con el enlace ahora contiene el id de la conversación y
   la aserción «el aviso no lleva el id del contacto» chocaba; se separaron los ids (en Chatwoot real nunca coinciden).

## Defectos de entorno vistos (no son de esta fase)

| Test | Causa |
|---|---|
| `prompts-build.spec.ts` | Llama a `execFileSync('npx', …)` sin shell: en Windows `npx` es `npx.cmd` (`spawnSync npx ENOENT`). El build real funciona y deja los tres `.md` en `dist/`. En Linux (CI) pasa |
| `aislamiento.spec.ts` (PER10), `webhook.spec.ts` (CAN1, 500 ms), `salud.spec.ts`, `migracion.spec.ts`, `aplicacion.e2e` (A1, 20 s) | Sensibles al tiempo: pasan aislados o en una segunda corrida; fallan según la carga de la máquina |
| Un `Stream isn't writeable` en el primer comando Redis de `MarcaMensajeProcesado` | Carrera de conexión perezosa en código previo; aparece rara vez al arrancar una app en la corrida completa |

## Límites conocidos

- **La marca de «cliente esperando» se pierde si Redis se reinicia.** Es un aviso de apoyo: el traspaso ya avisó.
- **Un «gracias» también abre una espera**: no se interpreta el contenido (R14). Un aviso por espera y tiempo configurable.
- **Un aviso por conversación cuando se agota el techo de gasto**: si molesta, se agrupa en una fase posterior.
- **Los textos de los avisos son constantes del código**, no filas de `parametro` (son para el equipo, no para el cliente).
- **El enlace solo abre en el celular si Chatwoot es accesible desde internet** (P49) y falta confirmar si usa `id` o `display_id` (P50).
- Un fallo al encolar un aviso de traspaso se registra pero no se reintenta (a diferencia del de espera, que se devuelve al barrido).

## Pendientes abiertos

- `[manual]` T7: aviso real en Telegram y enlace abierto desde el celular con un Chatwoot accesible (P49, P50).
- Heredados: corrida real de evals (EVL3), P30, P32, P36 y P41.

## Qué aprendimos que cambia las fases siguientes

1. **Un puerto con doble en memoria y adaptador Redis** (`MarcaEsperaCliente`) se probó en tres niveles con poco costo; el kill switch
   de la 09a puede seguir el mismo molde.
2. **Añadir una dependencia a una clase central cuesta ocho arneses.** `TransicionarConversacion` ya tiene cinco: si crece más, conviene
   que los arneses compartan una fábrica de pruebas en vez de listar los proveedores a mano.
3. **El `Record` exhaustivo por motivo de handoff** (`AvisoTraspaso`) hace que un motivo nuevo no compile hasta decidir si avisa:
   usar ese patrón en cualquier tabla «motivo → comportamiento».
4. **Las pruebas de tiempo reales se estorban entre sí**: tres de las que fallaron esta fase lo hacen por carga. Antes del corte (Fase 10)
   conviene darles holgura o moverlas a un reloj falso.
5. **La 09a puede reutilizar los avisos**: el kill switch apagado debería avisar al asesor por el mismo camino.
