# Verify Report -- fase-04-canal-chatwoot

- Change: `fase-04-canal-chatwoot` . Rama: `fase-04-canal-chatwoot`
- Verificado: 2026-09-28, contra el estado real del arbol de trabajo (commits `d55a07a`..`e38653a`,
  working tree limpio salvo `openspec/changes/fase-04-canal-chatwoot/{design.md,proposal.md,specs/}`
  y `docs/adr/0004-inbox-outbox.md`/`docs/fases/README.md` sin commitear -- artefactos de planeacion,
  no codigo de produccion).
- Ejecutor: `sdd-verify` (diagnostico, sin autoridad de mutacion; no se corrigio nada).

## Alcance verificado

1. Cada escenario de `specs/canales/spec.md` (CAN1-CAN8) mas R3/R4 del esqueleto existente tiene
   cobertura de test real, ejecutada de verdad (no solo inspeccion estatica).
2. El criterio de salida de la fase (`docs/fases/README.md` fila 04) probado por
   `test/e2e/canal-chatwoot.e2e-spec.ts`.
3. `lint`, `typecheck`, `fronteras`, `contrato:deriva`.
4. Decisiones D1-D16 de `design.md` implementadas tal como quedaron fijadas, incluida Q4
   (`clave_idempotencia`).
5. Revision honesta de hallazgos documentados por `sdd-apply` durante la fase, marcando explicitamente
   los 4 abiertos senalados por la orquestacion mas cualquier otro encontrado.
6. `npm run verify` completo, con hallazgos ambientales confirmados por separado.

## Checks ejecutados (comandos reales, no asumidos)

| Comando | Resultado |
|---|---|
| `npm run lint` | **Verde.** Sin salida de error (`eslint .`). |
| `npm run typecheck` | **Verde.** `tsc --noEmit` sin errores. |
| `npm run prisma:generar` | **Verde.** Cliente generado (Prisma 7.10.0). |
| `npm run fronteras` | **Verde.** "no dependency violations found (229 modules, 533 dependencies cruised)". |
| `npm test` (unitarios) | **Verde.** 73 test files, 408 tests passed (408). Coincide con lo que reportan T2-T7 de tasks.md. |
| `npm run test:integracion` | **Verde.** 26 test files, 120 tests passed (120). Corrido dos veces de forma aislada, ambas en verde. Los ERROR de IndicadorPostgres/IndicadorRedis en el log son esperados: test/integracion/salud.spec.ts apunta deliberadamente a un puerto inalcanzable (127.0.0.1:65533) para probar el health check degradado (documentado en T4). |
| `npm run test:e2e` | **Verde.** 2 test files, 9 tests passed (9), incluye canal-chatwoot.e2e-spec.ts (T7, criterio de salida). |
| `npm run contrato:deriva` | **Verde.** openapi/openapi.interno.json y openapi/openapi.json coinciden byte a byte con lo generado en memoria. |
| `npm run verify` (secuencia completa) | **Fallo en dos puntos, ambos confirmados ambientales (ver seccion siguiente), no de la fase.** |

## Hallazgo ambiental en npm run verify

npm run verify corre unitarios e integracion en la misma sesion de Vitest, ademas de los siete
contenedores Docker ya en marcha desde antes de esta verificacion (Chatwoot local + Postgres/Redis/
MinIO de plataforma). Con esa carga combinada, npm run verify reporto:

1. test/integracion/catalogo/fuente-catalogo-directorio.spec.ts -> FAIL:
   "duplicate key value violates unique constraint pg_database_datname_index" en
   test/soporte/base-por-worker.setup.ts:22 (CREATE DATABASE ... TEMPLATE ...) -- condicion de
   carrera de infraestructura de test preexistente (no es codigo de esta fase) cuando varios workers
   de Vitest intentan crear su base por plantilla al mismo tiempo bajo contencion de recursos.
2. test/integracion/canales/procesador-inbox.spec.ts -> 1 test fallo por timeout:
   "CAN4 -- Un consumidor que falla siempre agota los reintentos con error e intentos visibles"
   (vi.waitFor expiro esperando que error quedara no nulo tras los reintentos con backoff
   exponencial de BullMQ, 2/4/8/16 s).

Confirmacion de que es ambiental, no un defecto de la fase: se corrio npm run test:integracion
en aislamiento dos veces (antes y despues del npm run verify combinado) y ambas veces
26/26 archivos, 120/120 tests pasaron en verde, incluido el mismo test de CAN4 que fallo bajo
npm run verify. La causa es contencion de recursos (Docker/Postgres/CPU) al correr unitarios +
integracion + los contenedores de Chatwoot local simultaneamente en esta maquina, no un defecto del
codigo de la fase. Reportado como hallazgo ambiental, tal como pedia el encargo (punto 6).

## Escenarios de spec -- cobertura real verificada

Se busco cada titulo de escenario (grep sobre it('<ID> -- ...')) en todo src/ y test/ y se
confirmo contra los titulos exactos de specs/canales/spec.md y del esqueleto
openspec/specs/canales/spec.md (R3, R4).

| Requisito | Escenario (titulo exacto de la spec) | Test con titulo exacto | Nivel |
|---|---|---|---|
| CAN1 | El webhook responde antes de 500 ms tras registrar el evento | SI exacto | integracion |
| CAN2 | Una peticion sin cabecera de firma se rechaza sin registrar nada | SI exacto (x2) | unitario + integracion |
| CAN3 | Un evento de un tipo distinto a los reconocidos se ignora sin registrarse | SI exacto (x2) | unitario + integracion |
| CAN4 | Un consumidor que falla siempre agota los reintentos con error e intentos visibles | SI exacto | integracion |
| CAN5 | Un evento con texto y adjuntos se registra sin ese contenido | SI exacto | unitario |
| CAN5 | El telefono completo del contacto nunca queda en el payload guardado | SI exacto | unitario |
| CAN6 | Enviar un mensaje... llamada de mensajes de Chatwoot | SI exacto | integracion |
| CAN6 | Cambiar el estado... toggle_status | SI exacto | integracion |
| CAN6 | Etiquetar... labels | SI exacto | integracion |
| CAN7 | Un 429 o 5xx de Chatwoot se reintenta con backoff | SI exacto | integracion |
| CAN7 | Un 4xx de Chatwoot falla de inmediato sin reintentar | SI exacto | integracion |
| CAN8 | El canal WhatsApp devuelve su perfil de capacidades real | SI exacto | unitario |
| CAN8 | Un canal distinto de WhatsApp devuelve un perfil explicito de no soportado | SI exacto | unitario |
| R3 | Evento con firma valida | NO sin titulo exacto (ver hallazgo W1) | -- |
| R3 | Evento con firma invalida | SI exacto | unitario (integracion con titulo extendido) |
| R4 | Reintento del proveedor sobre un evento entrante | NO sin titulo exacto (ver hallazgo W1) | -- |
| R4 | Reintento de un job de envio tras un fallo | SI exacto | integracion |

15 de 17 escenarios tienen al menos un test con el titulo exacto que exige
specs/canales/spec.md, seccion "Nota de implementacion" (MUST nombrarse... sin parafrasear).
2 no lo tienen -- ver hallazgo W1 abajo. En los 17 casos el comportamiento subyacente si esta
probado y en verde (confirmado leyendo el contenido de cada test, no solo su titulo); el
problema es exclusivamente de nomenclatura/trazabilidad literal, no de cobertura funcional
faltante.

## Decisiones D1-D16 -- verificacion puntual

- **D2** (body crudo, limite 1 MB, traducirErrorDeCuerpo): implementado en
  src/configurar-aplicacion.ts/src/main.ts; confirmado con test de integracion real (ver T3 en
  tasks.md, hallazgo de que el filtro global de NestJS no interceptaba entity.too.large/
  entity.parse.failed, resuelto con middleware dedicado).
- **D11/Q4** (clave_idempotencia): confirmado en prisma/schema.prisma:419
  (claveIdempotencia String @unique @map("clave_idempotencia")) y en la migracion aditiva
  20260927120000_outbox_clave_idempotencia.
- **D12** (backoff acotado a OUTBOX_BACKOFF_MAX_S): confirmado en
  src/plataforma/outbox/publicador-outbox.ts:157-160 -- el Math.min(fallo.esperaSugeridaS ?? 0,
  OUTBOX_BACKOFF_MAX_S) del commit e38653a esta en el codigo, no solo en el mensaje del commit.
- **D13** (reconciliacion existeMensajeConMarca): implementada completa (no el escenario
  alternativo), consistente con la verificacion real de T1 contra Chatwoot v4.17.1 local.
- **D15** (union de etiquetas, no reemplazo): confirmado por los tests de "CAN6 -- Etiquetar..." y
  el titulo adicional "CAN6 -- cambiarEstado traduce...".
- **D9** (puerto SALIDA_CANAL exportado, ADAPTADOR_CANAL no exportado): confirmado por fronteras
  en verde (229 modulos, sin violaciones) y por inspeccion de canales.module.ts/puertos/index.ts.

No se encontro ninguna decision de D1-D16 implementada de forma distinta a lo que fija design.md.

## Veredicto de judgment-day (transcrito completo, sin editar)

target_identity: fase-04-canal-chatwoot @ 9e4a10c (base 7e5bae1), fix en e38653a
round: 1
confirmed: [1] -- Retry-After (esperaSugeridaS) sin acotar a OUTBOX_BACKOFF_MAX_S en
                  src/plataforma/outbox/publicador-outbox.ts, contradecia D12 de design.md.
                  Verificado por el orquestador leyendo el codigo directamente (no solo por un
                  juez). Corregido en el commit e38653a: RED observado (test forzando
                  esperaSugeridaS=999999, fallaba con "expected 999999 to be <= 300"), luego
                  GREEN, con lint/typecheck/test (408/408)/test:integracion (120/120)/fronteras
                  todos en verde tras el fix.
suspect: [1] -- posible condicion de carrera entre abortarSecuencia()/marcarMuerta() (en
                publicador-outbox.ts) y un segundo publicador concurrente sobre la misma
                secuencia: si un segundo proceso reclamo ya un paso posterior (SKIP LOCKED, HTTP
                en vuelo) en el momento en que un fallo permanente de un paso anterior dispara
                abortarSecuencia, esa fila podria quedar marcada "secuencia abortada" pese a
                haberse entregado de verdad. Solo un juez (B) lo senalo; NO se verifico ni se
                corrigio. Deuda documentada, no bloqueante -- el repo hoy corre un solo proceso
                publicador (D12, sin jitter, "un solo proceso publicador y orden estricto por
                grupo" ya lo asume explicitamente), asi que el riesgo es real solo si en el futuro
                se escala a mas de un worker de outbox.
info: [1] -- src/modulos/canales/infraestructura/chatwoot/traducir-evento.ts: un adjunto de
             Chatwoot con file_type:'video' se mapea a tipoContenido:'imagen' en vez de tener su
             propia variante 'video' en el tipo TipoContenido (evento-canal.ts). Solo un juez (A)
             lo senalo. Cosmetico/cuestion de tipos, no bloqueante.
terminal_state: approved

Re-verificado por sdd-verify de forma independiente (no solo transcrito):

- El fix del hallazgo "confirmed" esta en el codigo (ver seccion D12 arriba), no solo en el mensaje
  del commit.
- El "suspect" (condicion de carrera) se leyo linea por linea en publicador-outbox.ts:145-201: el
  codigo en efecto no coordina abortarSecuencia con un reclamo concurrente de un paso posterior;
  la mitigacion real es organizativa (un solo proceso publicador), no de codigo. Confirmado como
  deuda abierta, no corregida por esta fase.
- El "info" (video->imagen) se confirmo en traducir-evento.ts:75: video: 'imagen' en el mapa
  TIPOS_ADJUNTO. Confirmado como deuda abierta, no corregida por esta fase.

## Hallazgos

### Abiertos, no bloqueantes (los 4 senalados por la orquestacion, confirmados por sdd-verify)

1. **Condicion de carrera abortarSecuencia/marcarMuerta** (suspect de judgment-day). Confirmado
   en el codigo. No bloqueante mientras el repo corra un solo proceso publicador (asuncion
   explicita de D12). Riesgo real solo si se escala a mas de un worker de outbox -- deuda a
   resolver si/cuando eso ocurra.
2. **Adjunto de video mapeado como imagen** (info de judgment-day). Confirmado en el codigo
   (traducir-evento.ts:75). Cosmetico/tipos, no bloqueante; TipoContenido no distingue 'video' hoy.
3. **infra/chatwoot/.env no existe** -- confirmado (ls infra/chatwoot/ solo muestra .env.example,
   docker-compose.yml, init/). La migracion de chatwoot-local (proyecto Docker ya en marcha) a
   luxeborealcrm-chatwoot (nombre que usan los scripts portados desde el fix 8cac7af) requiere
   copiar manualmente ../ChatLuxeCRM/infra/chatwoot/.env a infra/chatwoot/.env de este repo --
   bloqueado por permisos de sandbox para el orquestador; decision operativa que le corresponde al
   usuario, documentada en el resultado de T8 de tasks.md.
4. **chatwoot-devolver-bot.sh deliberadamente no portado** -- confirmado (el archivo no existe en
   scripts/). Decision correcta segun CLAUDE.md ("no se adelanta trabajo de fases futuras"): ese
   script depende de la maquina de estados bot/humano de la Fase 05.

### Nuevo, encontrado por sdd-verify (no senalado por judgment-day)

**W1 -- Dos de los 17 escenarios de la fase no tienen un test con el titulo exacto que
specs/canales/spec.md declara como "el criterio de aceptacion, no un detalle de estilo"**:

- R3 -- Evento con firma valida: el unico test que cubre este escenario a nivel de integracion se
  llama 'R3 -- Evento con firma valida: responde 2xx y deja la fila redactada en evento_entrante'
  (test/integracion/canales/webhook.spec.ts:128) -- titulo extendido, no el titulo exacto.
- R4 -- Reintento del proveedor sobre un evento entrante: las tres instancias que cubren este
  escenario usan titulos extendidos con dos puntos y texto adicional
  (test/integracion/canales/webhook.spec.ts:222, test/integracion/canales/procesador-inbox.spec.ts:155,
  src/modulos/canales/aplicacion/registrar-evento-entrante.spec.ts:65) -- ninguna usa el titulo
  exacto 'R4 -- Reintento del proveedor sobre un evento entrante'.

Adicionalmente, la integracion de CAN5 (test/integracion/canales/webhook.spec.ts) fusiona los
dos escenarios de CAN5 en un solo test con un titulo combinado
('CAN5 -- Un evento con texto y adjuntos se registra sin ese contenido, y el telefono nunca queda'),
contradiciendo la afirmacion de tasks.md ("Nota de conteo de escenarios") de que "CAN2, CAN3 y CAN5
tienen un test unitario (T2) y un test de integracion (T3) con el mismo titulo exacto" -- cierto
para CAN2/CAN3, no para CAN5 a nivel de integracion (si lo es a nivel unitario, donde ambos titulos
existen exactos).

**Severidad: WARNING, no CRITICAL.** El comportamiento subyacente de los 17 escenarios esta probado
y pasa en verde de verdad (confirmado leyendo el contenido de cada test, no solo el titulo); el
defecto es de nomenclatura/trazabilidad literal contra una regla que la propia spec marca como MUST,
no de cobertura funcional faltante. No bloquea el criterio de salida de la fase (que si esta probado
con su titulo exacto en el e2e). Se recomienda, si se retoma esta fase o una futura la toca,
renombrar esos 2-3 tests a su titulo exacto (o dividir el test combinado de CAN5) para que la
trazabilidad escenario-test sea literal, tal como exige la spec.

### Sugerencia (no bloqueante)

- test/soporte/base-por-worker.setup.ts (infraestructura de test preexistente, no de esta fase)
  tiene una condicion de carrera real al crear bases por plantilla bajo alta contencion de workers
  paralelos (CREATE DATABASE ... TEMPLATE sin reintento ante "duplicate key value violates unique
  constraint"). Se manifesto solo bajo npm run verify con 7 contenedores Docker adicionales ya en
  marcha en esta maquina; no se manifesto corriendo los proyectos por separado. Fuera del alcance
  de esta fase (no toca ningun archivo de canales/outbox/colas), pero vale la pena una mejora de
  robustez (retry con backoff en crearBaseConReintento) en una fase de mantenimiento futura.

## Resumen

- **CRITICAL**: 0 (el unico encontrado por judgment-day ya fue corregido y re-verificado en el
  codigo real, no solo en el mensaje del commit).
- **WARNING**: 1 nuevo (W1, nomenclatura de 2-3 titulos de test no exacta) + 2 reconfirmados de
  judgment-day (condicion de carrera de abortarSecuencia, adjunto de video) -- ambos ya
  documentados como deuda abierta no bloqueante.
- **SUGGESTION**: 1 (robustez de base-por-worker.setup.ts ante contencion, fuera del alcance de
  esta fase) + 2 items operativos abiertos que dependen del usuario (.env de Chatwoot,
  chatwoot-devolver-bot.sh diferido a la Fase 05 -- ambos ya documentados y correctos).

**Todos los checks ejecutables pasaron en verde de forma real** (lint, typecheck, fronteras,
contrato:deriva, 408 unitarios, 120 de integracion x2, 9 e2e). Las 9 tareas de tasks.md estan
marcadas [x] y sus commits existen en el rango declarado. El fix del hallazgo CRITICAL de
judgment-day esta confirmado en el codigo. Los hallazgos abiertos son deuda documentada y
explicitamente aceptada (condicion de carrera single-process, tipo de video, .env manual, script
diferido a Fase 05) mas un hallazgo nuevo de nomenclatura (W1) que no afecta comportamiento ni
criterio de salida.

## Recomendacion

**Lista para sdd-archive.** Ningun hallazgo es bloqueante: el criterio de salida de la fase esta
probado de punta a punta, el hallazgo CRITICAL de judgment-day esta corregido y re-verificado, y
los 4 items abiertos senalados por la orquestacion (mas W1, nuevo) son deuda documentada, no
defectos de comportamiento. El hallazgo ambiental de npm run verify no es un fallo de la fase --
confirmado corriendo cada proyecto de Vitest por separado, dos veces, ambas en verde.
