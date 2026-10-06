# Configuración de negocio — Specification

## Purpose

`parametro` guarda solo configuración del negocio que el código usa para calcular o decidir (horario de atención, recargo de
contra entrega, factor volumétrico, techo de gasto del LLM), tipada y editable por grupos desde la API y el back office, sin
desplegar. Los textos que lee el cliente son casos del asistente (`asistente`) y el estilo del bot vive en `agente`
(AGT18-AGT23, EST-D1-EST-D5). Decisión: ADR-0024.

## Requirements

### Requirement: R15 — Horario, textos y parámetros son datos, no constantes

El horario de atención, los textos enviados al cliente y los parámetros del negocio MUST ser datos editables
(persistidos, con una vía para actualizarlos), nunca constantes en el código. Los **textos** viven en los casos del
asistente (`asistente`) y el **horario y los parámetros** en `parametro` por los grupos de CFG1; el código solo conserva
el texto de respaldo de cada caso del sistema para no dejar al bot mudo.

Fase que lo implementa: 01, 02, 12

#### Scenario: El horario de atención se lee como dato

- Dado que el sistema necesita saber si está dentro o fuera del horario de atención,
- Cuando lo consulta,
- Entonces lo lee de un parámetro editable, nunca de un valor fijo en el código.

#### Scenario: Los textos al cliente vienen de un caso del asistente

- Dado que el bot necesita enviar un texto al cliente (aviso de datos, mensaje de handoff, mensaje de fuera de cobertura, etc.),
- Cuando lo envía,
- Entonces ese texto viene de un caso editable del asistente, con su respaldo en código solo si el caso falta.

#### Scenario: Un parámetro del negocio se ajusta sin desplegar código

- Dado que se ajusta un parámetro del negocio (por ejemplo, el porcentaje de recargo contraentrega o el factor volumétrico),
- Cuando un admin lo guarda desde la configuración,
- Entonces el sistema usa el nuevo valor sin necesidad de desplegar código nuevo.

### Requirement: CFG1 — La configuración se lee y se edita por grupos tipados, solo por un admin

El sistema MUST exponer, solo al rol `admin` (API7), tres grupos de configuración, cada uno con una lectura y una
escritura que validan cada campo por su tipo (no un editor genérico clave/valor):

| Grupo | Lectura | Escritura | `operationId` |
|---|---|---|---|
| Horario | `GET /api/v1/configuracion/horario` | `PUT /api/v1/configuracion/horario` | `obtenerHorario`, `guardarHorario` |
| Envíos | `GET /api/v1/configuracion/envios` | `PUT /api/v1/configuracion/envios` | `obtenerConfiguracionEnvios`, `guardarConfiguracionEnvios` |
| Gasto del LLM | `GET /api/v1/configuracion/gasto-llm` | `PUT /api/v1/configuracion/gasto-llm` | `obtenerGastoLlm`, `guardarGastoLlm` |

Un valor inválido MUST responder `422` con el código `configuracion-invalida` y el motivo de cada campo, sin guardar
nada del grupo. Las rutas MUST aparecer en `openapi/openapi.json`. Los logs de una escritura MUST registrar solo el grupo,
el usuario y los nombres de los campos que cambiaron, nunca el cuerpo completo.

Fase que lo implementa: 12

#### Scenario: Un admin lee un grupo de configuración

- Dado una configuración guardada,
- Cuando un admin llama a `GET /api/v1/configuracion/envios`,
- Entonces la respuesta es `200` con el recargo y el factor volumétrico vigentes y su fecha de actualización.

#### Scenario: Un asesor recibe 403 en la configuración

- Dado un usuario con rol `asesor`,
- Cuando llama a cualquiera de las rutas de configuración,
- Entonces la respuesta es `403`.

#### Scenario: Un grupo con un campo inválido no guarda nada

- Dado un cuerpo de envíos con un recargo válido y un factor volumétrico negativo,
- Cuando un admin lo guarda,
- Entonces la respuesta es `422` con el código `configuracion-invalida`, el motivo del factor, y el recargo vigente no cambia.

#### Scenario: Las rutas de configuración están en el contrato público

- Dado el contrato generado,
- Cuando se compara con `openapi/openapi.json`,
- Entonces las seis operaciones aparecen y `npm run contrato:deriva` termina sin diferencias.

### Requirement: CFG2 — El horario se edita por día, con excepciones por fecha

El grupo Horario MUST aceptar para cada día de la semana (`lun` a `dom`) un rango `desde`-`hasta` en formato `HH:MM` o
`null` (cerrado), y una lista de excepciones `{ fecha, motivo }` (la tabla `excepcion_horario`). Un rango que cruza la
medianoche MUST ser válido (HOR6). Guardar MUST escribir los siete días explícitos en `horario_atencion` en el formato
que ya lee el módulo `horario` (HOR1-HOR7 no cambian) y las excepciones se MUST crear y borrar de una en una. Una
excepción con una fecha ya existente MUST responder `409` con el código `excepcion-duplicada`.

Fase que lo implementa: 12

#### Scenario: Guardar el horario por día

- Dado un horario con lunes de 08:00 a 18:00 y domingo cerrado,
- Cuando un admin lo guarda,
- Entonces `horario_atencion` queda con los siete días y el módulo `horario` evalúa el lunes dentro de ese rango.

#### Scenario: Un día cerrado se guarda como nulo

- Dado el domingo marcado como cerrado,
- Cuando un admin guarda el horario,
- Entonces el domingo queda `null` y una consulta en domingo está fuera de horario (HOR5).

#### Scenario: Una hora inválida se rechaza

- Dado un lunes con `desde` «25:00»,
- Cuando un admin lo guarda,
- Entonces la respuesta es `422` con el código `configuracion-invalida` y el motivo nombra el día.

#### Scenario: Un rango que cruza la medianoche se acepta

- Dado un viernes de 22:00 a 02:00,
- Cuando un admin lo guarda,
- Entonces la respuesta es `200` y el módulo `horario` lo evalúa como válido (HOR6).

#### Scenario: Crear y borrar una excepción

- Dado una fecha de festivo,
- Cuando un admin crea la excepción con su motivo y luego la borra,
- Entonces aparece en el grupo mientras exista y desaparece al borrarla, y el día de la excepción está fuera de horario mientras exista (HOR1).

#### Scenario: Una excepción repetida se rechaza

- Dado una excepción para el 25 de diciembre,
- Cuando un admin intenta crear otra para la misma fecha,
- Entonces la respuesta es `409` con el código `excepcion-duplicada`.

### Requirement: CFG3 — El recargo de contra entrega y el factor volumétrico se editan con su rango

El grupo Envíos MUST aceptar `recargoContraentregaPct` (número de 0 a 100 con hasta dos decimales) y
`factorVolumetrico` (entero positivo hasta 100.000) y MUST guardarlos en `recargo_contraentrega_pct` y
`factor_volumetrico`. El módulo `catalogo` MUST seguir calculando el recargo y el peso volumétrico en código (R1): el
LLM nunca recibe estos parámetros para calcular.

Fase que lo implementa: 12

#### Scenario: Cambiar el recargo cambia la siguiente cotización

- Dado un recargo de 5 % y una cotización con contra entrega,
- Cuando un admin guarda 6 % y el agente cotiza de nuevo,
- Entonces el recargo calculado usa 6 %, sin reiniciar.

#### Scenario: Un recargo fuera de rango se rechaza

- Dado un recargo de 150,
- Cuando un admin lo guarda,
- Entonces la respuesta es `422` con el código `configuracion-invalida` y el valor anterior no cambia.

#### Scenario: Un factor volumétrico no entero se rechaza

- Dado un factor de 4000,5,
- Cuando un admin lo guarda,
- Entonces la respuesta es `422` con el código `configuracion-invalida`.

### Requirement: CFG4 — El techo mensual de gasto del LLM se edita y su estado se ve sin editarse

El grupo Gasto del LLM MUST aceptar `techoMensualUsd` (número mayor que 0 y hasta 10.000) y guardarlo en
`llm_techo_mensual_usd` (LLM7: aplica a la siguiente solicitud). La lectura MUST devolver además el estado que guarda
el gateway (`llm_estado_techo`: aviso del 80 % y techo alcanzado, LLM8 y LLM9) y el gasto del mes; el cuerpo de
escritura MUST NOT aceptar el estado: lo escribe el sistema.

Fase que lo implementa: 12

#### Scenario: Subir el techo rige en la siguiente solicitud

- Dado un techo de 10 USD alcanzado en el mes,
- Cuando un admin guarda 20 USD,
- Entonces la siguiente solicitud al LLM usa el techo de 20 USD (LLM7).

#### Scenario: Un techo no positivo se rechaza

- Dado un techo de 0,
- Cuando un admin lo guarda,
- Entonces la respuesta es `422` con el código `configuracion-invalida`.

#### Scenario: El estado del techo es de solo lectura

- Dado una escritura que incluye un campo de estado,
- Cuando un admin la envía,
- Entonces el estado guardado no cambia y la respuesta lo trata como campo desconocido (`422`).

#### Scenario: La lectura muestra el estado y el gasto del mes

- Dado un estado de aviso del 80 % y un gasto acumulado,
- Cuando un admin lee el grupo,
- Entonces la respuesta trae el techo, el estado y el gasto del mes.

### Requirement: CFG5 — Lo guardado rige en el siguiente mensaje

Guardar un grupo MUST hacer efectivo el cambio desde el siguiente mensaje del cliente, sin reiniciar: el servicio MUST
invalidar las cachés que dependan de la clave guardada (la del catálogo para el recargo y el factor volumétrico) después
de confirmar la escritura. Si la invalidación falla, la escritura ya confirmada MUST conservarse, se MUST registrar un
aviso sin valores y la copia vieja caducará por su TTL de respaldo; la respuesta MUST seguir siendo `200`.

Fase que lo implementa: 12

#### Scenario: Guardar el recargo invalida la caché del catálogo

- Dado una cotización ya cacheada con el recargo anterior,
- Cuando un admin guarda un recargo nuevo,
- Entonces la siguiente cotización lee el valor nuevo y no la copia cacheada.

#### Scenario: Una invalidación fallida no deshace el guardado

- Dado que la invalidación de la caché falla,
- Cuando un admin guarda el recargo,
- Entonces la respuesta es `200`, el valor queda guardado y se registra un aviso sin valores.

### Requirement: CFG6 — `parametro` solo guarda configuración tipada del negocio

La tabla `parametro` MUST contener únicamente las claves del registro tipado de `configuracion`
(`horario_atencion`, `recargo_contraentrega_pct`, `factor_volumetrico`, `llm_techo_mensual_usd`, `llm_estado_techo`) y las
que otras fases declaren allí. Escribir una clave fuera del registro MUST rechazarse. Un valor guardado con el tipo
equivocado MUST ignorarse con un aviso y regir el valor por defecto del módulo dueño (comportamiento de hoy). Tras esta
fase, `parametro` MUST NOT contener claves `mensaje_*`, `aviso_*`, `politica_*` ni `prompt_estilo*`, y el importador MUST
rechazar con un mensaje claro una fila de texto en `parametros.csv`.

Fase que lo implementa: 12

#### Scenario: Escribir una clave fuera del registro se rechaza

- Dado una clave que no está en el registro tipado,
- Cuando el servicio intenta guardarla,
- Entonces el guardado se rechaza y no se escribe nada.

#### Scenario: Un valor del tipo equivocado rige el valor por defecto

- Dado `recargo_contraentrega_pct` guardado como un texto,
- Cuando el catálogo lo lee,
- Entonces registra un aviso y usa el valor por defecto, sin lanzar.

#### Scenario: Después de la limpieza no quedan textos ni estilo en parametro

- Dado una base con la fase aplicada y la semilla corrida,
- Cuando se consulta `parametro`,
- Entonces ninguna clave empieza con `mensaje_`, `aviso_`, `politica_` ni `prompt_estilo`.

#### Scenario: El importador rechaza una clave de texto

- Dado un `parametros.csv` con una fila `mensaje_fuera_cobertura`,
- Cuando se corre `npm run catalogo:importar`,
- Entonces termina con error que nombra la fila, indica que los textos se editan en Casos de uso, y no escribe nada (todo o nada).
