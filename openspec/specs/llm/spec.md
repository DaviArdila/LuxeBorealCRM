# LLM — Specification

## Purpose

La pasarela de LLM es el único camino entre el agente y los proveedores de modelos (`SPEC.md` §3
principio 5; `docs/adr/0002-pasarela-llm.md`): tipos propios en `LlmPort` → `LlmGateway` (timeout,
reintento, circuit breaker, fallback, registro de uso y costo, techo de gasto, trazas) → un
adaptador sobre el AI SDK con `@openrouter/ai-sdk-provider`. Implementa la parte de costo de
**R13** (`openspec/specs/conversaciones/spec.md`: cada llamada deja su fila en `uso_llm` y el techo
mensual se hace cumplir desde el código) y deja la base de **R1/R2**
(`openspec/specs/agente/spec.md`) que la Fase 07 usará: el gateway transporta definiciones y
llamadas de herramientas sin interpretarlas. Protege **R14**
(`openspec/specs/privacidad/spec.md`: nunca contenido ni PII en logs o trazas) y aplica **R15**
(`openspec/specs/configuracion-negocio/spec.md`: modelos, timeouts, techo y textos son datos, no
constantes).

Decisiones de producto aprobadas que esta spec usa tal cual: techo mensual del LLM de **10 USD**,
configurable (`LLM_TECHO_MENSUAL_USD` + parámetro editable, desactivado en `NODE_ENV=test`); aviso
al **80 %** por log estructurado `warn` + fila observable (sin Telegram); clave
**`mensaje_techo_gasto`** con texto a definir por el negocio (default provisional en la proposal);
nivel 2 directo **pospuesto** (el gateway deja la extensión lista y ante caída total devuelve error
tipado). El timeout exacto del perfil `conversacion` lo fija `sdd-design` (recomendado 15 s) con la
restricción de que MUST quedar por debajo de `LOCK_TURNO_TTL_S` (heredado de la Fase 05).

Fuera de esta spec (ver proposal, Out of Scope): el motor real (política, bucle de herramientas),
las 6 herramientas con efectos, los prompts versionados, el historial de turnos para el LLM, los
modelos de respaldo concretos (los elige la Fase 07 con las evals), el consumo del error tipado
(handoff + texto de cortesía, Fases 07/08) y el resto de R13 (agrupación de mensajes, collage, tope
de turnos). El *binding* `GENERADOR_RESPUESTA → AgenteEco` (CNV6) queda intacto en esta fase.

## Nota de implementación

El título exacto de cada escenario **es** el criterio de aceptación, no un detalle de estilo. Cada
test de esta fase MUST nombrarse `"<id del requisito> — <título del escenario>"`, usando el título
exacto de los encabezados `#### Scenario:` de abajo, sin parafrasear. El prefijo `LLM#` no colisiona
con `CAN#` (`canales`) ni con `CNV#` (`conversaciones`).

## Requirements

### Requirement: LLM1 — Puerto LlmPort con tipos propios y error tipado

El módulo `llm` MUST exponer un puerto `LlmPort` (token DI) con tipos propios de mensajes,
definición de herramientas (esquema Zod + JSON Schema, sin nombres concretos), respuesta (`texto?`,
`llamadasHerramienta?`, `uso?`) y metadatos opacos del proveedor que el llamador solo transporta.
Los fallos MUST devolverse como un error tipado de pasarela que distingue al menos `timeout`,
`no-reintentable`, `circuito-abierto`, `techo-alcanzado` y `proveedor-caido` (ADR-0002). Ningún tipo
del SDK de un proveedor MUST aparecer fuera de `modulos/llm/infraestructura`.

Fase que lo implementa: 06

#### Scenario: LLM1 — Generación con tipos propios sin SDK en el contrato

- Dado un llamador que solo conoce `LlmPort` y sus tipos propios,
- Cuando pide una generación con mensajes, prompt de sistema y definiciones de herramientas,
- Entonces recibe una respuesta con tipos propios (`texto?`, `llamadasHerramienta?`, `uso?`,
  metadatos opacos) sin importar ningún tipo del SDK del proveedor.

#### Scenario: LLM1 — Error tipado distingue cada causa de fallo

- Dado que una llamada al LLM falla por timeout, por error no reintentable, por circuito abierto,
  por techo alcanzado o por caída total del proveedor,
- Cuando el gateway devuelve el fallo,
- Entonces el código de error tipado indica exactamente cuál de esas cinco causas ocurrió,
  observable por el llamador sin inspeccionar mensajes de texto.

#### Scenario: LLM1 — Metadatos opacos del proveedor se transportan sin interpretar

- Dado que la respuesta del proveedor trae metadatos propios (p. ej. firmas de razonamiento),
- Cuando el gateway la entrega al llamador,
- Entonces esos metadatos llegan opacos y sin modificar, y el gateway no toma ninguna decisión a
  partir de su contenido.

### Requirement: LLM2 — Transporte agnóstico al contenido (R1, R2)

El gateway MUST transportar definiciones y llamadas de herramientas sin interpretarlas: MUST NOT
calcular dinero, MUST NOT acceder a ningún dato fuera de las herramientas, y MUST NOT convertir en
silencio argumentos de herramientas inválidos — un argumento inválido MUST devolverse como error de
herramienta hacia el modelo (ADR-0002; base de **R1** y **R2** de
`openspec/specs/agente/spec.md`, que la Fase 07 hace cumplir de extremo a extremo).

Fase que lo implementa: 06 (base); 07 (cumplimiento de extremo a extremo)

#### Scenario: LLM2 — Definiciones y llamadas de herramientas se transportan sin interpretar

- Dado una definición de herramienta y una llamada del modelo con argumentos,
- Cuando pasan por el gateway en cualquier dirección,
- Entonces llegan idénticas al otro extremo: el gateway no filtra, no reordena, no recalcula ningún
  valor numérico ni consulta ninguna fuente de datos.

#### Scenario: LLM2 — Argumentos inválidos devuelven error de herramienta, nunca objeto vacío

- Dado que el modelo devuelve una llamada con argumentos que no validan contra el esquema de la
  herramienta,
- Cuando el gateway procesa esa llamada,
- Entonces no la sustituye por un objeto vacío ni la corrige en silencio: devuelve un error de
  herramienta hacia el modelo indicando la causa de validación.

### Requirement: LLM3 — Timeout por perfil de uso

Cada llamada MUST abortarse al superar el timeout del perfil activo (`conversacion`, `evals`). El
timeout del perfil `conversacion` MUST quedar por debajo de `LOCK_TURNO_TTL_S`: un LLM más lento que
el lock del turno (heredado de la Fase 05, sin heartbeat) deja el turno sin dueño. El valor exacto
lo fija `sdd-design` (recomendado 15 s).

Fase que lo implementa: 06

#### Scenario: LLM3 — Llamada que supera el timeout del perfil se aborta

- Dado un perfil con timeout configurado y un proveedor que no responde a tiempo,
- Cuando la llamada supera ese timeout,
- Entonces el gateway aborta la llamada, registra el intento como `timeout` en `uso_llm` y aplica la
  política de reintento y fallback de LLM4–LLM5.

#### Scenario: LLM3 — Timeout de conversación por debajo del TTL del lock de turno

- Dado el valor vigente de `LOCK_TURNO_TTL_S` y la configuración del perfil `conversacion`,
- Cuando se comparan ambos valores,
- Entonces el timeout del perfil es estrictamente menor que el TTL del lock.

### Requirement: LLM4 — Reintento acotado solo ante fallos reintentables

Ante 429, 5xx, timeout o aborto, el gateway MUST reintentar con backoff hasta **2 reintentos** como
máximo (3 intentos en total); a diferencia del `geminiClient` del prototipo, los timeouts SÍ se
reintentan (**A7**). Ante cualquier otro 4xx MUST NOT repetir el intento contra el mismo modelo.

Fase que lo implementa: 06

#### Scenario: LLM4 — Fallo reintentable se reintenta como máximo 2 veces

- Dado un proveedor que responde 429 (o 5xx, o la llamada expira por timeout),
- Cuando el gateway ejecuta la llamada,
- Entonces la reintenta con espera creciente hasta 2 veces y, si el tercer intento también falla,
  devuelve el error tipado correspondiente sin un cuarto intento.

#### Scenario: LLM4 — Error 4xx distinto de 429 no se reintenta contra el mismo modelo

- Dado un proveedor que responde un 4xx distinto de 429 (p. ej. solicitud inválida),
- Cuando el gateway ejecuta la llamada,
- Entonces no repite el intento contra ese mismo modelo: pasa al siguiente modelo del perfil
  (LLM5) o, si no quedan modelos, devuelve el error tipado `no-reintentable`.

### Requirement: LLM5 — Circuit breaker y fallback nivel 1 por perfil (Q4)

El gateway MUST probar los modelos del perfil en orden de prioridad (nivel 1): si un modelo falla,
el siguiente responde sin intervención del llamador. Cuando un modelo supera el umbral configurado
de fallos, el circuit breaker MUST dejar de llamarlo durante la ventana configurada
(`circuito-abierto` para ese tramo). El nivel 2 directo queda **pospuesto** (Q4): el gateway MUST
exponer el punto de extensión del último recurso sin implementar ningún proveedor directo, y ante
caída total de OpenRouter MUST devolver el error tipado `proveedor-caido` para que la Fase 07 lo
derive a humano (degradación visible, nunca silencio).

Fase que lo implementa: 06

#### Scenario: LLM5 — Caída del primer modelo deriva al siguiente sin intervención del llamador

- Dado un perfil con al menos dos modelos y el primero caído,
- Cuando se pide una generación,
- Entonces el llamador recibe una respuesta del siguiente modelo del perfil sin haber cambiado nada
  en su llamada, y `uso_llm` registra el intento fallido y el exitoso.

#### Scenario: LLM5 — Circuito abierto evita llamar al modelo en fallo sostenido

- Dado un modelo que superó el umbral configurado de fallos consecutivos,
- Cuando llega una nueva solicitud dentro de la ventana configurada,
- Entonces el gateway no llama al proveedor para ese modelo y devuelve el error tipado
  `circuito-abierto` (o la respuesta del siguiente modelo del perfil, según la cadena), y pasada la
  ventana permite una llamada de prueba.

#### Scenario: LLM5 — Caída total de OpenRouter devuelve error tipado sin proveedor directo

- Dado que OpenRouter en su conjunto no responde y el nivel 2 directo sigue pospuesto (Q4),
- Cuando se pide una generación,
- Entonces el gateway devuelve el error tipado `proveedor-caido` sin llamar a ningún proveedor
  directo, y la llamada queda registrada en `uso_llm` como fallida.

### Requirement: LLM6 — Cada llamada deja su fila en uso_llm (R13)

Cada llamada al LLM que llega al proveedor, con éxito o con error, MUST dejar una fila en
`uso_llm` con proveedor, modelo, tokens de entrada, salida y caché, costo estimado en USD, latencia
y resultado, que permite sumar el gasto del mes (**R13** de
`openspec/specs/conversaciones/spec.md`, escenario «Costo de cada llamada al LLM registrado»;
criterio nunca-perder > nunca-duplicar heredado de la Fase 05: ante duda, mejor fila duplicada
auditable que llamada sin costo).

Fase que lo implementa: 06

#### Scenario: LLM6 — Llamada exitosa registra proveedor, modelo, tokens, costo, latencia y resultado

- Dado que el agente hace una llamada al LLM durante un turno,
- Cuando la llamada termina con éxito,
- Entonces queda una fila en `uso_llm` con proveedor, modelo, tokens de entrada, salida y caché,
  costo estimado en USD, latencia en ms y resultado exitoso.

#### Scenario: LLM6 — Llamada fallida también deja su fila en uso_llm

- Dado que una llamada al LLM termina con error (timeout, 5xx, circuito abierto o caída del
  proveedor),
- Cuando el gateway devuelve el error tipado,
- Entonces queda igualmente una fila en `uso_llm` con proveedor, modelo intentado, latencia y
  resultado fallido (tokens y costo en cero si el proveedor no los reportó).

### Requirement: LLM7 — Techo mensual de gasto configurable (R13, R15, Q1)

El gateway MUST comparar el gasto mensual acumulado en `uso_llm` contra el techo
`LLM_TECHO_MENSUAL_USD` (default **10 USD/mes** como sub-presupuesto del LLM dentro de los 20 USD
de R13, aprobado en Q1), combinado con el parámetro editable del negocio (**R15**). En
`NODE_ENV=test` el techo MUST estar desactivado para no interferir con los tests.

Fase que lo implementa: 06

#### Scenario: LLM7 — Gasto bajo el techo permite la llamada con normalidad

- Dado un gasto mensual acumulado por debajo de `LLM_TECHO_MENSUAL_USD`,
- Cuando se pide una generación,
- Entonces el gateway llama al LLM con normalidad y la llamada queda registrada en `uso_llm`.

#### Scenario: LLM7 — Techo desactivado en entorno de pruebas

- Dado `NODE_ENV=test` con cualquier valor de gasto acumulado (incluso por encima del techo),
- Cuando se pide una generación,
- Entonces el gateway llama al LLM con normalidad y nunca devuelve `techo-alcanzado`.

#### Scenario: LLM7 — El techo se puede subir desde el parámetro sin reiniciar

- Dado un gasto mensual que alcanzó `LLM_TECHO_MENSUAL_USD` y un gateway que ya devolvió `techo-alcanzado`,
- Cuando el negocio guarda un valor mayor en el parámetro `llm_techo_mensual_usd`,
- Entonces la siguiente solicitud usa ese techo y el gateway vuelve a llamar al LLM sin reiniciar el proceso; un valor inválido (no numérico o no positivo) se ignora y rige `LLM_TECHO_MENSUAL_USD`.

### Requirement: LLM8 — Aviso al 80 % del techo (Q2)

Al cruzar el **80 %** del techo mensual (`LLM_UMBRAL_AVISO_PCT`, aprobado en Q2), el gateway MUST
emitir un log estructurado de severidad `warn` y una fila observable del gasto, **una sola vez por
mes** (sin Telegram: las notificaciones llegan con `notificaciones/` en la Fase 08).

Fase que lo implementa: 06

#### Scenario: LLM8 — Cruce del 80 % emite aviso warn una vez por mes

- Dado un gasto mensual por debajo del 80 % del techo,
- Cuando una llamada registrada hace que el acumulado cruce ese umbral,
- Entonces el gateway emite un log estructurado `warn` con el gasto y el techo (sin contenido de
  mensajes ni PII) y deja una fila observable, y las llamadas siguientes del mismo mes no repiten el
  aviso.

### Requirement: LLM9 — Al 100 % del techo, cero llamadas y error tipado (R15, Q3)

Cuando el gasto mensual alcanza el 100 % del techo, el gateway MUST NOT llamar al LLM y MUST
devolver el error tipado `techo-alcanzado` para que las Fases 07/08 deriven a humano. El texto de
cortesía que acompaña esa derivación MUST leerse del parámetro **`mensaje_techo_gasto`** (**R15**;
texto a definir por el negocio, default provisional en la proposal — el gateway no elige textos).

Fase que lo implementa: 06 (error + parámetro); 07/08 (handoff + texto)

#### Scenario: LLM9 — Gasto al 100 % no llama al LLM y devuelve techo-alcanzado

- Dado un gasto mensual acumulado igual o superior al techo,
- Cuando se pide una generación,
- Entonces el gateway no hace ninguna llamada al proveedor y devuelve el error tipado
  `techo-alcanzado`; el bloqueo queda visible en la fila observable del gasto.

#### Scenario: LLM9 — Texto de derivación vive en el parámetro mensaje_techo_gasto

- Dado que el negocio actualiza el parámetro `mensaje_techo_gasto`,
- Cuando se lee ese texto (p. ej. al derivar a humano por techo),
- Entonces se usa el valor actualizado sin desplegar código nuevo, y el gateway nunca trae un texto
  fijo propio para este caso.

### Requirement: LLM10 — Trazas sin contenido ni datos personales (R14)

El gateway MUST NOT emitir prompts, respuestas, contenido de mensajes ni datos personales (números
completos, cédula, correo, tokens) a ningún log o traza; los logs solo llevan identificadores,
modelo, latencias, conteos y códigos de error (**R14** de
`openspec/specs/privacidad/spec.md`; el `redact` de plataforma es red de fondo, nunca el único
mecanismo). `uso_llm` MUST guardar solo conteos, modelo, costo, latencia y resultado — nunca texto
de mensajes.

Fase que lo implementa: 06

#### Scenario: LLM10 — Logs del gateway nunca contienen prompts, respuestas ni PII

- Dado una generación con prompt, herramientas y respuesta cualesquiera,
- Cuando se inspeccionan todos los logs y trazas que emitió el gateway para esa llamada,
- Entonces ninguno contiene el texto del prompt, de la respuesta ni del contenido de mensajes, ni
  números completos, cédula, correo o tokens (verificado por test de redacción contra el logger
  real).

#### Scenario: LLM10 — uso_llm guarda conteos y metadatos, nunca contenido

- Dado cualquier llamada al LLM con contenido arbitrario,
- Cuando se lee su fila en `uso_llm`,
- Entonces la fila contiene solo proveedor, modelo, conteos de tokens, costo estimado, latencia y
  resultado — ningún texto de mensajes, prompts ni datos personales.

### Requirement: LLM11 — Adaptador OpenRouter sin reintentos propios (ADR-0002)

El adaptador AI SDK sobre OpenRouter MUST vivir solo en `modulos/llm/infraestructura`, MUST ser el
único lugar donde aparecen `ai` y `@openrouter/ai-sdk-provider`, y MUST NOT reintentar por su
cuenta: ante un fallo hace exactamente un intento contra el proveedor y propaga el error al gateway,
que es el único que decide reintentos, fallback y circuito (restricción de ADR-0002, no una opción).

Fase que lo implementa: 06

#### Scenario: LLM11 — Adaptador fallido hace un solo intento y propaga el error

- Dado un proveedor que responde un error reintentable,
- Cuando el adaptador ejecuta la llamada,
- Entonces hace exactamente un intento contra el proveedor y propaga el error al gateway sin esperar
  ni reintentar por su cuenta.

#### Scenario: LLM11 — SDK del proveedor solo aparece en la infraestructura de llm

- Dado el árbol de `src/`,
- Cuando corre `npm run fronteras`,
- Entonces ningún import de `ai`, `@openrouter/ai-sdk-provider` ni de otro SDK de proveedor fuera
  de `modulos/llm/infraestructura` pasa la verificación.

### Requirement: LLM12 — Configuración por perfil validada con Zod (R15)

La configuración del LLM MUST organizarse por perfil de uso (`conversacion`, `evals`): lista de
modelos en orden de prioridad (principal `openai/gpt-5.6-luna`, ADR-0002; los respaldos concretos
los elige la Fase 07 con las evals), timeout, `max_tokens` y reintentos — más
`LLM_TECHO_MENSUAL_USD` y `LLM_UMBRAL_AVISO_PCT` — validada con Zod en `plataforma/config` y
documentada en `.env.example` sin secretos (**R15**: cambiar de modelo es cambiar datos + correr
evals, nunca tocar código; PLT1: sin la config válida no se arranca).

Fase que lo implementa: 06

#### Scenario: LLM12 — Misma conversación contra 2 modelos cambiando solo configuración

- Dada una misma conversación de referencia y dos perfiles que solo difieren en la lista de modelos,
- Cuando se corre la generación con cada perfil sin tocar código,
- Entonces cada corrida usa su modelo correspondiente (visible en `uso_llm`) y ambas producen una
  respuesta del contrato `LlmPort`.

#### Scenario: LLM12 — Configuración LLM inválida impide el arranque nombrando la variable

- Dada una variable `LLM_*` requerida ausente o con valor que no cumple el esquema (p. ej. timeout
  no positivo o lista de modelos vacía),
- Cuando se intenta arrancar la aplicación,
- Entonces el proceso no acepta tráfico y el error nombra la variable que falló sin imprimir su
  valor.

### Requirement: LLM13 — Repositorio uso_llm best-effort con agregado mensual

El repositorio de `uso_llm` (infraestructura de `llm`, sobre la tabla ya migrada en la Fase 01)
MUST escribir cada fila con criterio best-effort nunca-perder (ante duda, mejor fila duplicada
auditable que llamada sin costo) sin tumbar la respuesta al cliente si la escritura falla, y MUST
exponer la lectura agregada del gasto mensual por proveedor y modelo para el techo y futuros
reportes.

Fase que lo implementa: 06

#### Scenario: LLM13 — Fallo de escritura no tumba la respuesta y queda visible

- Dado que la escritura en `uso_llm` falla de forma transitoria,
- Cuando el gateway devuelve la respuesta (o el error tipado) de la llamada,
- Entonces la respuesta se entrega igual al llamador y el fallo de persistencia queda visible en un
  log estructurado de error para auditoría posterior.

#### Scenario: LLM13 — Agregado mensual por proveedor y modelo para el techo

- Dadas filas de `uso_llm` del mes en curso y de meses anteriores, de varios proveedores y modelos,
- Cuando se consulta el gasto mensual,
- Entonces la suma incluye solo el mes en curso, desglosada por proveedor y modelo, y coincide con
  la que el gateway usa para comparar contra el techo.
