# Agente — Specification

## Purpose

El agente LLM atiende al cliente por WhatsApp (vía Chatwoot): consulta el catálogo, cotiza envíos,
manda fotos y califica el interés de compra. Solo puede tocar el mundo real a través de las 7
herramientas tipadas que se le exponen; nunca hace cálculos de dinero ni accede a la base
directamente. Este dominio cubre esas dos garantías y el manejo de mensajes que no son texto.

## Requirements

### Requirement: R1 — El LLM solo accede a datos por las herramientas definidas

El sistema MUST restringir el acceso a datos del LLM exclusivamente a las 7 herramientas definidas
(`buscar_producto`, `obtener_ficha`, `cotizar_envio`, `enviar_fotos`, `marcar_lead_caliente`,
`guardar_datos_contacto`, `consultar_caso`). El LLM MUST NOT ejecutar consultas libres contra la
base de datos ni ningún otro origen de datos. Cuando el cliente pregunte por una condición del negocio
(contra entrega, devoluciones, garantía…), el bot MUST apoyarse en el texto que devuelve
`consultar_caso` o en `politica_contraentrega_texto` de `cotizar_envio`, y MUST NOT inventar una
condición que ningún caso contenga.

(Previously: 6 herramientas, sin `consultar_politica`; desde la Fase 12 la herramienta es `consultar_caso`, CAS8.)

Fase que lo implementa: 07

#### Scenario: El LLM necesita datos de un producto

- Dado que el LLM necesita datos de un producto para responder,
- Cuando genera su respuesta,
- Entonces solo puede obtenerlos llamando a una de las 7 herramientas definidas.

#### Scenario: Todo dato citado se rastrea a una llamada de herramienta

- Dado que una respuesta del bot menciona un precio, un costo de envío o una condición del negocio,
- Cuando se audita el turno,
- Entonces ese dato debe poder rastrearse a una llamada a herramienta en el mismo turno.
- Y si no hubo llamada, se considera que no hay dato real en la respuesta.

#### Scenario: El cliente pregunta por una política del negocio

- Dado que el cliente pregunta, por ejemplo, si puede devolver un producto,
- Cuando el bot responde,
- Entonces llama a `consultar_caso` con el título del caso correspondiente y cita el texto que devuelve,
  sin reescribir su contenido.

#### Scenario: Un caso que no existe no se inventa

- Dado que el cliente pregunta por una condición para la que `consultar_caso` informa que el caso no existe,
- Cuando el bot responde,
- Entonces no afirma ninguna condición y ofrece derivar la consulta a un asesor.

### Requirement: R2 — El LLM nunca calcula dinero

El sistema MUST devolver precios y costos de envío ya formateados y listos para citar desde el
backend; el LLM SHALL únicamente copiarlos, nunca calcularlos. El costo de envío MUST citarse siempre
como un rango aproximado (el precio real lo confirma la transportadora al despachar). El recargo
contra entrega MUST decirse al cliente solo como algo que se suma al total de su compra, sin
mencionar ningún porcentaje ni monto: el porcentaje es un dato interno del negocio y, si el cliente
lo pregunta, lo responde un asesor tras el traspaso. Hay cobertura de envío salvo en la lista de
zonas excluidas (`MODELO_DATOS.md` §4).

(Previously: el recargo contra entrega MUST citarse como un porcentaje que paga el cliente.)

Fase que lo implementa: 02, 07

#### Scenario: El cliente pregunta el precio de un producto

- Dado que el cliente pregunta el precio de un producto,
- Cuando el bot responde,
- Entonces cita el precio ya formateado que devolvió `obtener_ficha`, sin realizar ningún cálculo
  propio.

#### Scenario: Cotización de envío con cobertura

- Dado que el cliente pide cotización de envío a un destino con cobertura,
- Cuando el bot responde,
- Entonces cita un rango aproximado (nunca un valor exacto), indicando que el valor real lo
  confirma la transportadora al despachar.

#### Scenario: El recargo contra entrega se dice sin porcentaje

- Dado que el cliente pregunta por el pago contra entrega o el bot cotiza un envío con contra entrega,
- Cuando el bot responde,
- Entonces indica que el recargo se suma al total de la compra, citando la política de contra entrega,
  sin mencionar ningún porcentaje ni monto del recargo.

#### Scenario: Destino sin cobertura

- Dado que el destino del cliente está en la lista de zonas sin cobertura,
- Cuando se cotiza el envío,
- Entonces `cotizar_envio` devuelve `cobertura: false` y el bot no ofrece ningún rango de precio.

### Requirement: R12 — Mensajes entrantes no textuales

El sistema MUST manejar los mensajes entrantes que no son texto según su tipo, decidido por el turno
completo (después del debounce): si la ráfaga trae al menos un mensaje de texto, el turno sigue el
flujo normal con el texto (P28); si no trae texto, decide el tipo del último mensaje. Un audio SHALL
pedir texto al cliente; un segundo audio consecutivo en la misma sesión de la conversación MUST
derivar la conversación a humano (un mensaje de texto reinicia la cuenta); una imagen SHALL pedir que
el cliente la describa en texto o mencione el SKU, sin procesarla; una ubicación MUST entrar al flujo
normal como una ubicación compartida, sin geocodificarla, para que el bot pida la ciudad y el
departamento y cotice (P27); cualquier otro tipo (sticker, tarjeta de contacto, documento, etc.) MUST
ignorarse sin responder, sin consumir turno ni tokens.

(Previously: el segundo audio se contaba "del mismo contacto" en el requisito y "en la misma
conversación" en el escenario; la ubicación "poblaba ciudad/departamento del contacto", algo que el
prototipo nunca implementó y que exige geocodificación inversa; no se definía qué pasa con una
ráfaga mixta.)

Fase que lo implementa: 07a (audio, imagen, ignorar, ráfaga mixta); 07b (ubicación en el flujo del
LLM)

#### Scenario: Primer audio del cliente

- Dado que el cliente envía un mensaje de audio,
- Cuando llega el mensaje,
- Entonces el bot pide texto con una excusa amable, sin llamar al LLM.

#### Scenario: Segundo audio consecutivo

- Dado que el cliente ya envió un audio antes en la misma sesión de la conversación y envía un
  segundo audio,
- Cuando llega el segundo audio,
- Entonces la conversación deriva a humano.

#### Scenario: Un texto entre dos audios reinicia la cuenta

- Dado que el cliente envió un audio, luego un texto, y luego otro audio,
- Cuando llega el segundo audio,
- Entonces el bot vuelve a pedir texto y la conversación no deriva.

#### Scenario: Imagen entrante

- Dado que el cliente envía una imagen,
- Cuando llega el mensaje,
- Entonces el bot pide que la describa en texto o mencione el SKU, sin procesar la imagen.

#### Scenario: Ubicación entrante

- Dado que el cliente envía su ubicación,
- Cuando llega el mensaje,
- Entonces el turno sigue el flujo normal con una ubicación compartida y el bot pide la ciudad y el
  departamento para cotizar el envío.

#### Scenario: Tipo no manejado

- Dado que el cliente envía un sticker u otro tipo no manejado,
- Cuando llega el mensaje,
- Entonces se ignora silenciosamente, sin consumir turno ni tokens.

#### Scenario: Ráfaga con texto y audio sigue el flujo del texto

- Dado que el cliente envía un texto y un audio dentro de la misma ráfaga,
- Cuando se procesa el turno,
- Entonces el turno sigue el flujo normal con el texto y no se pide texto por el audio.

### Requirement: AGT1 — Pipeline de políticas del turno en orden explícito

El agente MUST decidir cada turno recorriendo una lista ordenada de políticas, cada una una pieza
separada que puede responder y cortar el turno o dejar pasar al siguiente: (1) mensajes no textuales
(R12), (2) tope de turnos (R13), (3) generación de contenido (eco provisional en 07a, LLM en 07b). El
aviso de datos (AGT2) se aplica sobre la respuesta que produzca cualquier política. Un turno que
ninguna política responde MUST terminar sin pasos. Agregar una política MUST NOT exigir cambiar las
demás (A5).

Fase que lo implementa: 07a

#### Scenario: Una política que responde corta el resto del pipeline

- Dado un turno con un solo mensaje de audio,
- Cuando el pipeline lo procesa,
- Entonces responde la política de no textuales y ni el tope de turnos ni la generación de contenido
  se consultan.

#### Scenario: Un turno de texto llega hasta la generación de contenido

- Dado un turno de texto en una sesión que no alcanzó el tope,
- Cuando el pipeline lo procesa,
- Entonces la respuesta la produce la generación de contenido.

### Requirement: AGT2 — Aviso de asistente automatizado en el primer turno de la conversación

La primera respuesta del bot en una conversación (sesión inicial, sin turnos previos) MUST empezar
con el texto del caso del sistema `aviso_datos`, dentro del **mismo** primer mensaje de texto de esa
respuesta (sin agregar un mensaje saliente, R13). Las respuestas siguientes, y las de sesiones
posteriores de la misma conversación, MUST NOT repetirlo. Implementa el escenario «Aviso de asistente
automatizado» de **R14** de forma determinista, sin depender de que el modelo lo recuerde.

Fase que lo implementa: 07a

#### Scenario: La primera respuesta de la conversación lleva el aviso en el mismo mensaje

- Dado una conversación nueva y un turno de texto,
- Cuando el bot responde con un mensaje de texto,
- Entonces ese único mensaje empieza con el texto de `aviso_datos` seguido de la respuesta.

#### Scenario: La segunda respuesta no repite el aviso

- Dado una conversación cuyo primer turno ya se respondió,
- Cuando el bot responde el segundo turno,
- Entonces la respuesta no contiene el texto de `aviso_datos`.

#### Scenario: Una respuesta vacía no genera un mensaje solo para el aviso

- Dado una conversación nueva cuyo primer turno es un sticker,
- Cuando el turno se ignora,
- Entonces no se envía ningún mensaje y el aviso queda para la primera respuesta real.

### Requirement: AGT3 — Los textos fijos del agente son casos del sistema

Los textos que el agente envía sin pasar por el LLM MUST leerse del puerto de textos del asistente (CAS7, R15; antes, de `parametro`):
`mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada`, `aviso_datos`, `mensaje_handoff` (dentro
del horario de atención) y `mensaje_handoff_fuera_horario` (fuera de él, según el puerto `HORARIO`).
Si el caso no existe o está vacío, MUST usarse su texto de respaldo, definido en un solo lugar del código de `asistente`
(`dominio/sistema.ts`), nunca repetido en varios archivos.

Fase que lo implementa: 07a

#### Scenario: Un texto configurado por el negocio reemplaza al de respaldo

- Dado el caso `mensaje_pedir_texto_audio` con un texto configurado,
- Cuando el cliente envía un audio,
- Entonces el bot responde exactamente ese texto.

#### Scenario: Sin el parámetro se usa el texto de respaldo

- Dado que no existe el caso `mensaje_imagen_no_procesada`,
- Cuando el cliente envía una imagen,
- Entonces el bot responde el texto de respaldo del agente.

#### Scenario: Fuera de horario el handoff usa su propio texto

- Dado que el sistema está fuera del horario de atención y la conversación alcanza el tope de turnos,
- Cuando el bot deriva,
- Entonces el mensaje que envía es el de `mensaje_handoff_fuera_horario`, no el de `mensaje_handoff`.

### Requirement: AGT4 — Bucle de herramientas genérico con efectos tipados

El agente MUST resolver el contenido del turno con un bucle que llama a `LLM_PORT` (perfil
`conversacion`) con las definiciones de las 7 herramientas registradas, ejecuta las llamadas que
devuelve el modelo y le devuelve los resultados, hasta obtener un texto final. El bucle MUST NOT
conocer el nombre de ninguna herramienta (A4): cada herramienta devuelve `{ paraElModelo, efectos }` y
los efectos (`enviar-imagen`, `sin-cobertura`, `datos-contacto-guardados`, `lead-propuesto`) se
aplican al final del turno. Una llamada a una herramienta desconocida o con argumentos inválidos MUST
devolverse al modelo como error de herramienta; la segunda llamada inválida del mismo turno MUST
terminar el turno en handoff con motivo `argumentos-invalidos` y el texto `mensaje_error_llm`.

Fase que lo implementa: 07b

#### Scenario: El modelo encadena herramientas y termina con texto

- Dado un modelo que primero pide `buscar_producto`, luego `obtener_ficha` y luego responde texto,
- Cuando se procesa el turno,
- Entonces las dos herramientas se ejecutan en orden, sus resultados vuelven al modelo, y la respuesta
  del turno es un solo paso de texto con el texto final.

#### Scenario: Los efectos de imagen se agregan después del texto

- Dado un modelo que pide `enviar_fotos` (sin ángulo) y luego responde texto,
- Cuando se procesa el turno,
- Entonces la respuesta tiene primero el paso de texto y después un paso de imagen con la clave de la
  portada, y el modelo solo recibió `enviadas: 1`.

#### Scenario: Una herramienta desconocida vuelve al modelo como error

- Dado un modelo que pide una herramienta que no está registrada,
- Cuando el bucle la procesa,
- Entonces el modelo recibe un resultado de error que nombra la herramienta y el turno continúa.

#### Scenario: Dos llamadas inválidas en el mismo turno derivan a humano

- Dado un modelo que devuelve dos veces seguidas argumentos inválidos para `cotizar_envio`,
- Cuando el bucle procesa la segunda,
- Entonces el turno termina con el texto `mensaje_error_llm` y un handoff con motivo
  `argumentos-invalidos`.

### Requirement: AGT5 — El turno respeta un plazo compartido y un tope de vueltas (ADR-0018)

El bucle MUST terminar dentro de un plazo de turno de `LOCK_TURNO_TTL_S − 5` segundos, medido con el
`Clock` desde el inicio del turno, y MUST hacer como máximo `AGENTE_MAX_VUELTAS` llamadas al LLM. Cada
llamada MUST pasar el tiempo restante como `plazoMs` (LLM14). Si el plazo o las vueltas se agotan sin
texto final, el turno MUST terminar en handoff con motivo `plazo-agotado` y el texto
`mensaje_error_llm`.

Fase que lo implementa: 07b

#### Scenario: Cada llamada recibe solo el tiempo que le queda al turno

- Dado un turno cuya primera llamada al LLM tarda 10 segundos,
- Cuando el bucle hace la segunda llamada,
- Entonces esa llamada lleva un `plazoMs` de 15 000 como máximo con la configuración por defecto.

#### Scenario: Agotar las vueltas sin texto final deriva a humano

- Dado un modelo que en cada vuelta vuelve a pedir una herramienta,
- Cuando el bucle llega a `AGENTE_MAX_VUELTAS` llamadas,
- Entonces no hace una llamada más y el turno termina en handoff con motivo `plazo-agotado`.

### Requirement: AGT6 — Un fallo de la pasarela deriva a humano con texto de cortesía

Si `LLM_PORT` devuelve `ErrorPasarelaLlm`, el turno MUST terminar en handoff (nunca en silencio ni
con una excepción hacia `conversaciones`): con código `techo-alcanzado`, motivo `techo-gasto` y el
texto de `mensaje_techo_gasto` (caso de uso exportado por `llm`, **LLM9**); con cualquier otro código,
motivo `fallo-llm` y el texto `mensaje_error_llm` (parámetro del agente, **R15**).

Fase que lo implementa: 07b

#### Scenario: El techo de gasto deriva con su propio texto

- Dado que el LLM responde con el error tipado `techo-alcanzado`,
- Cuando se procesa el turno,
- Entonces la respuesta es un paso con el texto de `mensaje_techo_gasto` y un handoff con motivo
  `techo-gasto`.

#### Scenario: La caída del proveedor deriva con el texto de error

- Dado que el LLM responde con el error tipado `proveedor-caido`,
- Cuando se procesa el turno,
- Entonces la respuesta es un paso con el texto de `mensaje_error_llm` y un handoff con motivo
  `fallo-llm`.

### Requirement: AGT7 — Historial corto por sesión, solo con textos finales

El agente MUST enviar al LLM, antes del mensaje del turno, como máximo los últimos
`AGENTE_HISTORIAL_TURNOS` turnos de la **misma sesión** (ADR-0017), cada uno como el texto del cliente
y el texto final del bot. MUST NOT guardar resultados de herramientas en el historial. Solo un turno
que terminó con texto final del LLM se agrega al historial.

Fase que lo implementa: 07b

#### Scenario: El LLM recibe solo los últimos turnos de la sesión

- Dado una sesión con 8 turnos respondidos y `AGENTE_HISTORIAL_TURNOS = 6`,
- Cuando se procesa el noveno turno,
- Entonces el LLM recibe los 6 turnos más recientes seguidos del mensaje actual.

#### Scenario: El historial no guarda resultados de herramientas

- Dado un turno en el que el modelo usó `obtener_ficha`,
- Cuando se lee el historial en el turno siguiente,
- Entonces contiene el texto del cliente y el texto final del bot, y ningún resultado de herramienta.

#### Scenario: Una sesión nueva arranca sin historial

- Dado una conversación que tuvo turnos, pasó a humano y volvió a `bot`,
- Cuando se procesa el primer turno de la sesión nueva,
- Entonces el LLM no recibe ningún turno anterior.

### Requirement: AGT8 — Herramientas de consulta devuelven datos listos para citar

`buscar_producto`, `obtener_ficha`, `cotizar_envio` y `consultar_caso` MUST envolver los casos de
uso de `catalogo` sin recalcular nada (R2): `buscar_producto` devuelve hasta 5 resultados `{id, sku,
nombre, descripcion_corta}` sin dinero; `obtener_ficha` devuelve `precio_texto` y `tiene_fotos`, y un
error explícito si el producto no existe o está inactivo; `cotizar_envio` recibe `id_producto`,
`departamento` y `ciudad` opcional y devuelve `rango_texto`, `dias_texto`, `contraentrega_disponible`
y, con contra entrega, `politica_contraentrega_texto`, o `cobertura: false` con el mensaje de fuera de
cobertura y el efecto `sin-cobertura`; `consultar_caso` devuelve el texto y el modo del caso o la lista de casos
disponibles si el título no existe (CAS8).

Fase que lo implementa: 07b

#### Scenario: obtener_ficha devuelve el precio ya formateado

- Dado un producto activo con `precio_cop = 389000`,
- Cuando el modelo llama `obtener_ficha` con su SKU,
- Entonces el resultado para el modelo trae `precio_texto` igual a `formatearCop(389000)` y ningún otro
  valor de dinero.

#### Scenario: obtener_ficha de un producto inactivo devuelve un error explícito

- Dado un producto inactivo,
- Cuando el modelo llama `obtener_ficha` con su id,
- Entonces el resultado es un error que le indica usar `buscar_producto`, sin ningún dato del
  producto.

#### Scenario: cotizar_envio sin cobertura deja el efecto sin-cobertura

- Dado un destino excluido de la cobertura,
- Cuando el modelo llama `cotizar_envio`,
- Entonces el resultado trae `cobertura: false` con el mensaje de fuera de cobertura, ningún rango, y
  el turno registra el efecto `sin-cobertura`.

#### Scenario: consultar_caso devuelve el texto literal

- Dado el caso de intención «Devoluciones» configurado,
- Cuando el modelo llama `consultar_caso` con ese título,
- Entonces el resultado trae el texto y el modo del caso sin ninguna modificación.

### Requirement: AGT9 — enviar_fotos manda la portada por defecto y otro ángulo bajo demanda

`enviar_fotos` MUST recibir `id_producto` (id o SKU) y, opcionalmente, `angulo` (`frente`,
`lateral_izquierdo`, `lateral_derecho`, `detalle` o `uso`). Sin `angulo` MUST producir **un** efecto
`enviar-imagen` con la portada del producto. Con `angulo` MUST producir un efecto con **solo** la foto de
ese ángulo. Cada efecto MUST llevar su pie de foto (AGT17). Las fotos enviadas por sesión MUST respetar
`AGENTE_FOTOS_INDIVIDUALES_MAX`. Si el producto no existe, no tiene fotos, no tiene el ángulo pedido o el
tope ya se alcanzó, MUST devolver `enviadas: 0` con un error explícito para que el modelo no afirme haber
enviado nada. Al modelo MUST devolverle solo `enviadas` (y `error`), nunca claves ni URLs. La herramienta
MUST NOT enviar todas las fotos de un producto en una sola llamada.

(Previously: modo `collage` por defecto e `individuales` con todas las fotos.)

Fase que lo implementa: 07b; 08b (portada y ángulo)

#### Scenario: Sin ángulo se envía solo la portada

- Dado un producto activo con tres fotos, una de ellas portada,
- Cuando el modelo llama `enviar_fotos` sin `angulo`,
- Entonces el turno tiene un único efecto de imagen con la portada y el modelo recibe `enviadas: 1`.

#### Scenario: Con ángulo se envía solo esa foto

- Dado un producto activo con fotos de ángulo `frente` y `lateral_izquierdo`,
- Cuando el modelo llama `enviar_fotos` con `angulo: lateral_izquierdo`,
- Entonces el turno tiene un único efecto de imagen con la foto lateral izquierda.

#### Scenario: Un ángulo que el producto no tiene no envía nada y lo dice

- Dado un producto activo que solo tiene foto de ángulo `frente`,
- Cuando el modelo llama `enviar_fotos` con `angulo: detalle`,
- Entonces no hay efecto de imagen y el modelo recibe `enviadas: 0` con un error explícito.

#### Scenario: Las fotos enviadas respetan el tope de la sesión

- Dado una sesión en la que ya se enviaron tantas fotos como el tope,
- Cuando el modelo pide otra foto,
- Entonces no hay efecto de imagen y el modelo recibe `enviadas: 0` con un error explícito.

#### Scenario: Un producto sin fotos no envía nada y lo dice

- Dado un producto activo sin fotos,
- Cuando el modelo llama `enviar_fotos`,
- Entonces no hay efecto de imagen y el modelo recibe `enviadas: 0` con un error explícito.

### Requirement: AGT10 — guardar_datos_contacto guarda solo lo que el cliente dio

`guardar_datos_contacto` MUST recibir `nombre_completo`, `telefono_contacto`, `direccion` y
`localidad`, y MUST guardarlos en el `contacto` de la conversación (por su id, **P1**). Si
`telefono_contacto` no tiene al menos 7 dígitos ("este mismo número"), MUST NOT guardar un teléfono
alterno. Ninguno de esos valores MUST aparecer en logs (**R14**).

Fase que lo implementa: 07b

#### Scenario: Los datos quedan guardados en el contacto de la conversación

- Dado una conversación de un contacto sin datos capturados,
- Cuando el modelo llama `guardar_datos_contacto` con los cuatro campos,
- Entonces el contacto queda con ese nombre, dirección, localidad y teléfono alterno, y el turno
  registra el efecto `datos-contacto-guardados`.

#### Scenario: Este mismo número no se guarda como teléfono alterno

- Dado que el cliente responde "este mismo" como teléfono,
- Cuando el modelo llama `guardar_datos_contacto`,
- Entonces el contacto no guarda ningún teléfono alterno.

#### Scenario: Los datos del contacto no aparecen en los logs

- Dado una llamada a `guardar_datos_contacto` con nombre, teléfono y dirección,
- Cuando se inspeccionan los logs del turno,
- Entonces ninguno contiene esos valores.

### Requirement: AGT11 — marcar_lead_caliente registra la propuesta; la decisión es de la escala

`marcar_lead_caliente` MUST recibir `temperatura` (`tibio`/`caliente`), `senales` (del vocabulario
cerrado de LDS1), `resumen` e `id_producto` (o `null`), y MUST pasar la propuesta al puerto
`EVALUADOR_LEAD`, que decide si se deriva (**R9**: el LLM propone, la escala confirma). La
implementación de la Fase 08 MUST guardar el lead (LDS2) y MUST responder `derivado: true` solo si la
escala lo confirmó; un `derivado: true` MUST convertirse en un handoff con motivo `lead-caliente` (dentro
de horario) o en la captura de datos (fuera de horario, LDS4). Un turno con el efecto `sin-cobertura` MUST
responder `derivado: false` sin consultar la escala ni crear el lead.

Fase que lo implementa: 07b (herramienta y puerto); 08 (escala, `lead`, derivación)

#### Scenario: La propuesta confirmada por la escala deriva

- Dado un turno con `senales = ["pide_pagar"]` dentro del horario de atención,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces el modelo recibe `derivado: true` y el turno termina en handoff con motivo `lead-caliente`.

#### Scenario: La propuesta que la escala no confirma no deriva

- Dado un turno con `senales = ["pregunta_precio"]`,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces el modelo recibe `derivado: false` con un motivo y el turno no tiene handoff.

#### Scenario: Sin cobertura no se evalúa el lead

- Dado un turno en el que `cotizar_envio` dejó el efecto `sin-cobertura`,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces el modelo recibe `derivado: false` y el evaluador no se consulta.

### Requirement: AGT12 — Contexto inicial del turno: producto de entrada y cliente conocido

En el primer turno de la conversación, si el texto contiene un SKU (`/SKU-[A-Z0-9-]+/i`) de un producto
activo, el agente MUST indicar al modelo ese producto como contexto de entrada; si el SKU no existe o
está inactivo, MUST tratar el turno como una consulta genérica. Si el contacto tiene nombre guardado,
MUST indicar al modelo que lo salude por su nombre y MUST indicarle que no asuma que quiere lo mismo
que la vez anterior (SPEC del prototipo §3.3, §3.7).

Fase que lo implementa: 07b

#### Scenario: Un SKU prellenado válido arranca con ese producto en contexto

- Dado el primer mensaje "Hola, me interesa el SKU-123" y un producto activo `SKU-123`,
- Cuando se arma la solicitud al LLM,
- Entonces las instrucciones del turno incluyen el id de ese producto como contexto de entrada.

#### Scenario: Un SKU inexistente cae al caso genérico

- Dado el primer mensaje "me interesa el SKU-999" y ningún producto con ese SKU,
- Cuando se arma la solicitud al LLM,
- Entonces las instrucciones del turno no incluyen ningún producto de entrada.

#### Scenario: Un cliente conocido se saluda por su nombre sin asumir su interés

- Dado un contacto con nombre guardado,
- Cuando se arma la solicitud al LLM,
- Entonces las instrucciones del turno incluyen su nombre y la indicación de no asumir que quiere lo
  mismo que la última vez.

### Requirement: AGT13 — Prompt de sistema versionado con prefijo estable

El prompt de sistema MUST armarse en este orden: reglas no negociables (incluida la regla de cuándo citar una
política), estilo, catálogo compacto sin precios, y al final las instrucciones variables del turno (contexto
inicial, horario). `reglas` y la plantilla del turno MUST venir de archivos versionados en `agente/prompts/`;
el `estilo` MUST venir de `parametro` (AGT18) con el archivo versionado como respaldo. `reglas` MUST contener
solo lo que no se negocia (R1, R2, R14, uso de herramientas, envíos y pagos); `estilo` MUST contener la identidad,
el tono, la longitud, el formato y los emojis, de modo que pueda cambiarse sin tocar las reglas. El prefijo
(reglas + estilo + catálogo) MUST ser idéntico entre turnos de conversaciones distintas mientras no cambien el
estilo publicado ni el catálogo, para aprovechar la caché de prompts (ADR-0002). La versión del prompt y la del
estilo MUST quedar en un log estructurado del turno (sin contenido).

(Previously: el estilo venía de un archivo versionado.)

Fase que lo implementa: 07b; 08b (separación de `estilo`); 08c (estilo desde la base)

#### Scenario: Dos conversaciones distintas comparten el mismo prefijo

- Dado dos turnos de conversaciones distintas con el mismo catálogo y el mismo estilo publicado,
- Cuando se arma el prompt de cada uno,
- Entonces ambos empiezan con exactamente el mismo texto hasta el final del catálogo compacto.

#### Scenario: El prompt no contiene precios

- Dado un catálogo con productos que tienen precio,
- Cuando se arma el prompt de sistema,
- Entonces el texto no contiene ningún valor en pesos.

#### Scenario: El estilo va entre las reglas y el catálogo

- Dado el archivo `reglas` y un estilo,
- Cuando se arma el prompt de sistema,
- Entonces el texto contiene primero las reglas, luego el estilo y después el catálogo.

#### Scenario: Cambiar el estilo no cambia las reglas

- Dado dos estilos distintos con el mismo archivo `reglas`,
- Cuando se arma el prompt con cada uno,
- Entonces la parte de reglas es idéntica en ambos textos.

#### Scenario: La versión del estilo queda en el log sin su contenido

- Dado un estilo publicado en la versión 3,
- Cuando se procesa un turno,
- Entonces el log estructurado lleva la versión del prompt y la del estilo, y no el texto del estilo.

### Requirement: EVL1 — Evals del agente con un LLM guionado, repetibles y en CI

El proyecto MUST tener un conjunto de evals (`npm run evals`) que ejecuta conversaciones de referencia
contra el agente completo (pipeline, bucle, herramientas reales, base y Redis de prueba). En su modo
por defecto, las respuestas del modelo MUST venir de un guion por caso (un doble de `LLM_PORT`), sin red
ni costo, y el resultado MUST ser idéntico en cada corrida. `npm run ci` MUST ejecutar este modo.

Fase que lo implementa: 07c

#### Scenario: El modo guionado no llama a ningún proveedor

- Dado el conjunto de evals en su modo por defecto,
- Cuando se ejecuta `npm run evals`,
- Entonces ningún caso hace una llamada HTTP a OpenRouter y no se escribe ninguna fila de costo real.

#### Scenario: Dos corridas guionadas dan el mismo resultado

- Dado el mismo conjunto de casos,
- Cuando se ejecuta `npm run evals` dos veces,
- Entonces ambos resúmenes son idénticos.

### Requirement: EVL2 — Aserciones deterministas sobre cada turno

Cada caso MUST poder declarar aserciones sobre el turno: herramientas que se esperan llamadas (y
prohibidas), que todo monto en pesos del texto final aparezca en un resultado de herramienta del mismo
turno (R1, R2), que ningún texto contenga un porcentaje de recargo (R2), que haya o no handoff, y que
un texto de política aparezca literal cuando se espera. Cada aserción MUST tener al menos un caso
negativo en el que un turno que la viola la hace fallar.

Fase que lo implementa: 07c

#### Scenario: Un monto sin rastro en herramientas hace fallar la aserción

- Dado un turno guionado cuyo texto final dice "$350.000" sin que ninguna herramienta lo haya
  devuelto,
- Cuando se evalúa la aserción de dinero con rastro,
- Entonces la aserción falla y nombra el caso.

#### Scenario: Un porcentaje de recargo hace fallar la aserción

- Dado un turno guionado cuyo texto final dice "5 % adicional por contra entrega",
- Cuando se evalúa la aserción de recargo sin porcentaje,
- Entonces la aserción falla.

#### Scenario: Un handoff no esperado hace fallar la aserción

- Dado un caso que declara "sin handoff" y un turno que termina en handoff,
- Cuando se evalúa,
- Entonces la aserción falla.

### Requirement: EVL3 — Umbral explícito de aprobación por modo

El resultado de las evals MUST compararse con un umbral escrito en el código y en esta spec: en modo
guionado, el 100 % de las aserciones MUST pasar; en modo real, cada caso corre 3 veces y las
aserciones críticas (dinero con rastro, recargo sin porcentaje, herramienta prohibida, handoff no
esperado) MUST pasar en el 100 % de las corridas y el resto en al menos el 90 %. No alcanzar el umbral
MUST terminar el comando con código de salida distinto de cero. Ningún cambio de modelo o de prompt
MUST fusionarse sin una corrida real que alcance el umbral.

Fase que lo implementa: 07c

#### Scenario: Una aserción crítica fallida en modo real reprueba la corrida

- Dado una corrida real en la que una de tres repeticiones de un caso tiene dinero sin rastro,
- Cuando se calcula el resultado,
- Entonces la corrida se reprueba aunque el resto de aserciones pase.

#### Scenario: El resto de aserciones tolera hasta un 10 % de fallos en modo real

- Dado una corrida real donde el 92 % de las aserciones no críticas pasan y todas las críticas pasan,
- Cuando se calcula el resultado,
- Entonces la corrida se aprueba.

### Requirement: EVL4 — Modo real bajo demanda con perfil evals y costo visible

Las evals MUST poder correr contra el LLM real solo cuando se pide explícitamente (variable de modo) y
hay una clave de OpenRouter configurada, usando el perfil `evals` (LLM12). Sin clave, el modo real MUST
negarse con un mensaje claro, sin intentar llamar. Al terminar, MUST imprimir el costo estimado de la
corrida sumado desde `uso_llm` y el modelo que respondió cada caso. Nunca corre en CI.

Fase que lo implementa: 07c

#### Scenario: El modo real sin clave se niega sin llamar

- Dado el modo real pedido y ninguna clave de OpenRouter configurada,
- Cuando se ejecuta `npm run evals`,
- Entonces el comando termina con un error que explica que falta la clave y no hace ninguna llamada.

#### Scenario: La corrida real imprime su costo

- Dado una corrida real terminada,
- Cuando se imprime el resumen,
- Entonces incluye el costo estimado en USD sumado desde `uso_llm` y el modelo de cada caso.

### Requirement: EVL5 — El set dorado nunca contiene datos personales

Toda conversación real usada como caso MUST pasar por un anonimizador que reemplaza teléfonos,
correos, cédulas, direcciones y nombres propios por marcadores estables (`<TELEFONO_1>`,
`<NOMBRE_1>`…), y que MUST fallar si después de anonimizar queda algún patrón de teléfono, correo o
cédula. Solo se commitean casos anonimizados y revisados por una persona (**R14**).

Fase que lo implementa: 07c

#### Scenario: Teléfonos, correos y cédulas se reemplazan por marcadores estables

- Dado un texto con un teléfono, un correo y una cédula, el teléfono repetido dos veces,
- Cuando se anonimiza,
- Entonces cada dato queda como un marcador y las dos apariciones del teléfono usan el mismo marcador.

#### Scenario: Un dato personal que sobrevive hace fallar el anonimizador

- Dado un texto con un teléfono escrito con un formato que el reemplazo no reconoce pero la
  verificación final sí,
- Cuando se anonimiza,
- Entonces el anonimizador falla y no produce ningún archivo.

### Requirement: AGT14 — Política de petición de persona en el pipeline

El pipeline del turno MUST incluir, antes del contenido del LLM y después de las políticas de mensajes no
textuales y de tope de turnos, una política que aplica LDS3: si el texto pide una persona, responde con
el texto de handoff del horario y el motivo `pide-persona`; si no, deja pasar.

Fase que lo implementa: 08

#### Scenario: La política corta el pipeline antes del LLM

- Dado el mensaje "pásame con un humano",
- Cuando el motor recorre las políticas,
- Entonces responde con el texto de handoff y el motivo `pide-persona` sin llegar a `ContenidoLlm`.

#### Scenario: Un mensaje normal pasa al LLM

- Dado el mensaje "hola, busco un collar",
- Cuando el motor recorre las políticas,
- Entonces la política deja pasar y responde `ContenidoLlm`.

### Requirement: AGT15 — Las respuestas del bot no llevan emojis

El estilo del prompt MUST ordenar no usar emojis, y los evals MUST incluir una aserción que falle si una
respuesta del bot contiene un emoji. La regla es de estilo (editable), no de seguridad: ningún pipeline
la hace cumplir en tiempo de ejecución.

Fase que lo implementa: 08b

#### Scenario: Una respuesta con emoji falla la aserción

- Dado un caso de evals cuya respuesta guionada contiene un emoji,
- Cuando se evalúa el caso,
- Entonces la aserción «sin emojis» falla.

#### Scenario: Una respuesta sin emojis pasa la aserción

- Dado un caso de evals cuya respuesta guionada no contiene emojis,
- Cuando se evalúa el caso,
- Entonces la aserción «sin emojis» pasa.

### Requirement: AGT16 — El SKU es una referencia interna que el cliente no ve

El catálogo compacto del prompt y los resultados de `buscar_producto` y `obtener_ficha` MUST NOT incluir
el SKU; la clave que maneja el modelo MUST ser el `id` del producto. Las herramientas MUST seguir aceptando
un SKU como entrada de `id_producto` (el contexto inicial por enlace `wa.me`, AGT12). Los evals MUST
incluir una aserción que falle si una respuesta contiene un SKU del catálogo.

Fase que lo implementa: 08b

#### Scenario: El catálogo compacto no contiene SKU

- Dado un catálogo con productos que tienen SKU,
- Cuando se arma el prompt de sistema,
- Entonces el texto no contiene ningún SKU.

#### Scenario: Los resultados de las herramientas no contienen SKU

- Dado un producto activo con SKU,
- Cuando el modelo llama `buscar_producto` y `obtener_ficha`,
- Entonces ningún resultado contiene el SKU.

#### Scenario: Un SKU como entrada sigue funcionando

- Dado un producto activo con SKU,
- Cuando el modelo llama `obtener_ficha` con ese SKU como `id_producto`,
- Entonces recibe la ficha del producto.

#### Scenario: Una respuesta con SKU falla la aserción

- Dado un caso de evals cuya respuesta guionada contiene el SKU de un producto,
- Cuando se evalúa el caso,
- Entonces la aserción «sin SKU» falla.

### Requirement: AGT17 — Cada foto lleva un pie de foto armado por el backend

El pie de foto (`leyenda`) de cada imagen enviada por `enviar_fotos` MUST armarse en el backend con el
nombre del producto, su descripción corta y el precio ya formateado (`precio_texto`, R2), nunca con texto
del modelo. MUST NOT incluir el SKU.

Fase que lo implementa: 08b

#### Scenario: El pie de foto lleva nombre, descripción y precio del backend

- Dado un producto activo con precio formateado,
- Cuando el modelo llama `enviar_fotos`,
- Entonces el efecto de imagen lleva un pie con el nombre, la descripción corta y `precio_texto`.

#### Scenario: El pie de foto no lleva el SKU

- Dado un producto activo con SKU,
- Cuando el modelo llama `enviar_fotos`,
- Entonces el pie de foto no contiene el SKU.

### Requirement: AGT18 — El estilo se lee de la base con el archivo como respaldo

El estilo del agente MUST leerse de la clave `prompt_estilo` de `parametro`. Si la clave no existe, está en blanco
o su valor no es texto, MUST regir el archivo `estilo` versionado, y nunca lanzar ni dejar al bot sin estilo
(R15). `reglas` y la plantilla del turno MUST NOT leerse de la base.

Fase que lo implementa: 08c

#### Scenario: Un estilo publicado reemplaza al del archivo

- Dado un estilo publicado en `parametro` distinto del archivo,
- Cuando se arma el prompt del siguiente turno,
- Entonces el prompt usa el estilo publicado y no el del archivo.

#### Scenario: Sin estilo publicado rige el archivo

- Dado que `prompt_estilo` no existe en `parametro`,
- Cuando se arma el prompt,
- Entonces el prompt usa el estilo del archivo versionado.

#### Scenario: Un valor en blanco o que no es texto cae al respaldo

- Dado que `prompt_estilo` es una cadena en blanco o un número,
- Cuando se arma el prompt,
- Entonces el prompt usa el estilo del archivo versionado y no falla.

### Requirement: AGT19 — Copia en memoria del estilo, invalidada por versión

El sistema MUST mantener una copia en memoria del estilo y MUST comparar en cada turno una versión compartida en
Redis (`agente:prompt:version`); mientras la versión no cambie MUST NOT consultar la base. Publicar o restaurar un
estilo MUST incrementar esa versión, de modo que el siguiente turno de cualquier proceso lea el estilo nuevo. La
copia MUST tener un tiempo de vida de respaldo de 5 minutos por si la clave de versión se pierde. Si Redis falla,
el turno MUST leer el estilo de la base y continuar.

Fase que lo implementa: 08c

#### Scenario: Una lectura repetida no consulta la base mientras la versión no cambia

- Dado un estilo ya leído una vez con la versión actual,
- Cuando se arma el prompt de dos turnos seguidos,
- Entonces la base se consulta una sola vez.

#### Scenario: Publicar un estilo hace que el siguiente turno lo use

- Dado un estilo ya leído una vez,
- Cuando se publica un estilo nuevo y llega otro mensaje,
- Entonces el prompt de ese turno usa el estilo nuevo sin reiniciar el proceso.

#### Scenario: Si Redis falla el turno sigue con el estilo de la base

- Dado que Redis no responde,
- Cuando se arma el prompt de un turno,
- Entonces el prompt usa el estilo leído de la base y el turno no falla.

### Requirement: AGT20 — El estilo se valida antes de publicarse

Un estilo MUST rechazarse, con el motivo, si está vacío o en blanco, si supera 4.000 caracteres, si contiene un
valor en pesos (R1, R2), un SKU con la forma `SKU-XXXX` (AGT16) o un marcador de plantilla `{{...}}`. Un estilo
válido MUST aceptarse sin modificarlo.

Fase que lo implementa: 08c

#### Scenario: Un estilo vacío o demasiado largo se rechaza

- Dado un estilo en blanco y otro de 4.001 caracteres,
- Cuando se validan,
- Entonces ambos se rechazan con su motivo.

#### Scenario: Un estilo con precios, SKU o marcadores de plantilla se rechaza

- Dado un estilo que contiene `$389.000`, otro con `SKU-GL001` y otro con `{{horario}}`,
- Cuando se validan,
- Entonces los tres se rechazan con su motivo.

#### Scenario: Un estilo válido se acepta

- Dado un estilo de texto corriente con viñetas y sin pesos ni SKU,
- Cuando se valida,
- Entonces se acepta tal cual.

### Requirement: AGT21 — Historial de estilos y vuelta atrás

Al publicar un estilo válido, el sistema MUST guardar el texto anterior en el historial (`prompt_estilo_historial`,
con versión, texto y fecha) y MUST conservar solo las 10 versiones más recientes. Restaurar una versión del historial
MUST publicar su texto como una versión nueva, sin reescribir el pasado, y MUST validarlo como cualquier estilo.

Fase que lo implementa: 08c

#### Scenario: Publicar guarda el estilo anterior en el historial

- Dado un estilo vigente en la versión 2,
- Cuando se publica un estilo nuevo,
- Entonces el historial contiene el texto de la versión 2 y el vigente pasa a la versión 3.

#### Scenario: Restaurar una versión la publica como versión nueva

- Dado un historial con las versiones 1 y 2 y el vigente en la 3,
- Cuando se restaura la versión 1,
- Entonces el vigente es el texto de la versión 1 con la versión 4 y el historial conserva las anteriores.

#### Scenario: El historial no guarda más de 10 versiones

- Dado un historial con 10 versiones,
- Cuando se publica un estilo nuevo,
- Entonces el historial sigue teniendo 10 versiones y la más antigua se descarta.

### Requirement: AGT22 — Comando para editar el estilo

El sistema MUST ofrecer el comando `npm run prompt:estilo` con las acciones `ver` (versión, origen `base` o `archivo`
y texto), `historial`, `publicar --archivo <ruta>` y `restaurar --version <n>`. `publicar` y `restaurar` MUST usar los
casos de uso de AGT20 y AGT21 y MUST recordar que un estilo nuevo exige una corrida real de evals (EVL3) antes de
llegar a clientes. El comando MUST NOT escribir el texto del estilo en los logs (R14).

Fase que lo implementa: 08c

#### Scenario: Publicar desde un archivo deja el estilo vigente

- Dado un archivo con un estilo válido,
- Cuando se ejecuta `publicar --archivo` sobre él,
- Entonces `ver` muestra ese texto con origen `base` y la versión incrementada.

#### Scenario: Un estilo inválido no se publica

- Dado un archivo con un estilo que contiene un precio,
- Cuando se ejecuta `publicar --archivo` sobre él,
- Entonces el comando termina con error que nombra el motivo y el estilo vigente no cambia.

#### Scenario: El comando no escribe el texto del estilo en los logs

- Dado un estilo publicado con el comando,
- Cuando se revisan los logs del proceso,
- Entonces no aparece el texto del estilo, solo la versión.

### Requirement: AGT23 — El estilo se administra por la API, solo por un admin

El sistema MUST exponer, solo al rol `admin` (API7, USR6), tres operaciones sobre el estilo que reutilizan los casos
de uso de AGT20 y AGT21 sin duplicar sus reglas:

- `GET /api/v1/agente/estilo` (`obtenerEstilo`): versión vigente, origen (`base` o `archivo`) y texto (AGT18).
- `GET /api/v1/agente/estilo/historial` (`listarHistorialEstilo`): las versiones guardadas, la más reciente primero,
  con versión, fecha y texto.
- `PUT /api/v1/agente/estilo` (`publicarEstilo`): publica un texto; responde `200` con la versión nueva, o `422` con
  el código `estilo-invalido` y el motivo de AGT20 en el detalle.
- `POST /api/v1/agente/estilo/restauraciones` (`restaurarEstilo`): restaura una versión del historial como versión
  nueva; responde `200` con la versión nueva, `404` con el código `version-estilo-inexistente` si no está en el
  historial, o `422` con `estilo-invalido`.

Publicar o restaurar por la API MUST invalidar la copia en memoria igual que el comando (AGT19). Ni las operaciones ni
sus logs MUST escribir el texto del estilo en los logs: solo la versión y el id del usuario (R14).

Fase que lo implementa: 11b

#### Scenario: Un admin consulta el estilo vigente

- Dado un estilo publicado en la versión 3,
- Cuando un admin llama a `GET /api/v1/agente/estilo`,
- Entonces la respuesta es `200` con la versión 3, origen `base` y su texto.

#### Scenario: Sin estilo publicado la API muestra el del archivo

- Dado que nunca se publicó un estilo,
- Cuando un admin llama a `GET /api/v1/agente/estilo`,
- Entonces la respuesta tiene origen `archivo` y el texto de `estilo.v3.md`.

#### Scenario: Publicar por la API cambia la respuesta del siguiente turno

- Dado un estilo vigente en la versión 2,
- Cuando un admin publica un estilo válido por `PUT /api/v1/agente/estilo`,
- Entonces la respuesta es `200` con la versión 3 y el prompt del siguiente turno usa el texto nuevo, sin reiniciar.

#### Scenario: Un estilo inválido se rechaza con su motivo

- Dado un texto con un valor en pesos,
- Cuando un admin lo publica por la API,
- Entonces la respuesta es `422` con el código `estilo-invalido`, el motivo en el detalle, y la versión vigente no cambia.

#### Scenario: Restaurar por la API publica una versión nueva

- Dado un historial con la versión 1 y el vigente en la versión 3,
- Cuando un admin restaura la versión 1,
- Entonces la respuesta es `200` con la versión 4 y su texto es el de la versión 1.

#### Scenario: Restaurar una versión que no existe se rechaza

- Dado un historial sin la versión 9,
- Cuando un admin pide restaurarla,
- Entonces la respuesta es `404` con el código `version-estilo-inexistente`.

#### Scenario: Un asesor no administra el estilo

- Dado un asesor con sesión,
- Cuando llama a cualquiera de las cuatro operaciones del estilo,
- Entonces la respuesta es `403` con el código `rol-insuficiente` y nada cambia.

#### Scenario: Publicar por la API no escribe el texto en los logs

- Dado un estilo publicado por la API,
- Cuando se revisan los logs del proceso,
- Entonces aparecen la versión y el id del usuario, y no el texto del estilo.

### Requirement: EST-D1 — Cada versión del estilo es una fila de `version_estilo`, con una sola vigente

El estilo MUST guardarse en una tabla propia `version_estilo` con una fila por versión (número, texto, si es la
vigente, fecha de publicación y quién la publicó). Exactamente una fila MUST ser la vigente, garantizado por la base
(índice único parcial). Publicar MUST ser una transacción con un candado que serialice a quienes publican a la vez y
que deje la fila nueva como vigente con el número siguiente; dos publicaciones simultáneas MUST NOT repetir un número.

Fase que lo implementa: 12

#### Scenario: Publicar crea una fila vigente nueva

- Dado un estilo vigente en la versión 2,
- Cuando un admin publica un texto válido,
- Entonces existe una fila de versión 3 vigente y la 2 deja de serlo, sin borrarse.

#### Scenario: Dos publicaciones a la vez no repiten la versión

- Dado un estilo vigente en la versión 2,
- Cuando dos admins publican al mismo tiempo,
- Entonces quedan las versiones 3 y 4, la 4 vigente, sin números repetidos.

#### Scenario: La base no admite dos versiones vigentes

- Dado una fila vigente,
- Cuando se intenta marcar otra fila como vigente sin desmarcar la primera,
- Entonces la base lo rechaza (comprobación `[manual]` del índice único parcial, además del test de integración).

### Requirement: EST-D2 — El comportamiento externo del estilo no cambia

El puerto `RepositorioEstilo` MUST conservar su forma y los casos de uso `PublicarEstilo`, `RestaurarEstilo`,
`ListarHistorialEstilo` y `ProveedorEstilo` MUST pasar sus tests sin cambiar los escenarios de AGT18-AGT22. La API
(AGT23) y el comando `npm run prompt:estilo` MUST responder igual que antes, salvo el campo nuevo de EST-D3. Un estilo
publicado MUST regir en el siguiente mensaje, con la copia en memoria y la versión compartida en Redis de AGT19.

Fase que lo implementa: 12

#### Scenario: Los tests de AGT18-AGT23 pasan sin editar sus escenarios

- Dado el adaptador nuevo detrás del mismo puerto,
- Cuando corren los tests de estilo del servicio,
- Entonces pasan sin cambiar el texto de ningún escenario existente.

#### Scenario: Un estilo publicado rige en el siguiente mensaje

- Dado un estilo publicado desde la pantalla,
- Cuando el cliente escribe,
- Entonces el prompt del turno usa el texto nuevo, sin reiniciar.

#### Scenario: El comando de estilo funciona igual

- Dado `npm run prompt:estilo -- ver`, `historial`, `publicar` y `restaurar`,
- Cuando se corren contra la base nueva,
- Entonces producen los mismos resultados que antes del cambio.

#### Scenario: Sin estilo guardado rige el archivo

- Dado una base sin ninguna fila en `version_estilo`,
- Cuando el agente pide el estilo,
- Entonces rige `estilo.v3.md` con origen `archivo` (AGT18).

### Requirement: EST-D3 — Cada versión guarda quién la publicó y la API lo muestra

Cada versión MUST guardar el usuario que la publicó (o, cuando la publicó el comando `npm run prompt:estilo`, un valor
que lo indique). Restaurar una versión MUST registrar a quien restauró como autor de la versión nueva. `obtenerEstilo` y
`listarHistorialEstilo` MUST devolver `publicadoPor` con el nombre y el identificador del usuario, o `null` si fue el
comando; ningún log MUST escribir el texto del estilo (R14), solo la versión y el identificador.

Fase que lo implementa: 12

#### Scenario: Publicar por la API guarda al usuario

- Dado un admin con sesión,
- Cuando publica un estilo válido,
- Entonces la versión nueva guarda su identificador y `obtenerEstilo` devuelve su nombre en `publicadoPor`.

#### Scenario: Publicar por el comando no tiene usuario

- Dado un estilo publicado con `npm run prompt:estilo -- publicar`,
- Cuando un admin consulta el historial,
- Entonces esa versión trae `publicadoPor` nulo.

#### Scenario: Restaurar registra a quien restauró

- Dado una versión 1 en el historial,
- Cuando un admin la restaura,
- Entonces la versión nueva trae a ese admin en `publicadoPor` y el texto de la 1.

#### Scenario: El historial muestra el autor de cada versión

- Dado un historial con versiones publicadas por dos admins,
- Cuando un admin llama a `listarHistorialEstilo`,
- Entonces cada versión trae su `publicadoPor`.

### Requirement: EST-D4 — La migración copia el estilo de `parametro` sin perder versiones

La migración de esquema MUST copiar a `version_estilo` el estilo vigente y su historial de `parametro`
(`prompt_estilo`, `prompt_estilo_version`, `prompt_estilo_historial`) conservando sus números de versión, y MUST dejar
la copia vigente como la de `prompt_estilo`. Sin estilo guardado MUST no crear filas. Las tres claves viejas MUST
seguir en `parametro` hasta T11 (limpieza) y MUST borrarse allí.

Fase que lo implementa: 12

#### Scenario: La migración conserva el vigente y el historial

- Dado una base con el estilo en la versión 5 y cuatro versiones en el historial,
- Cuando se aplica la migración,
- Entonces `version_estilo` tiene la versión 5 vigente y las cuatro anteriores con sus números y textos.

#### Scenario: Sin estilo guardado la migración no crea filas

- Dado una base sin `prompt_estilo`,
- Cuando se aplica la migración,
- Entonces `version_estilo` queda vacía y el agente usa el archivo.

#### Scenario: Después de la limpieza las claves viejas desaparecen

- Dado el cierre de T11,
- Cuando se consulta `parametro`,
- Entonces no existe ninguna clave `prompt_estilo*`.

### Requirement: EST-D5 — El historial conserva las diez versiones anteriores a la vigente

Publicar MUST podar las versiones más antiguas para que queden la vigente y como máximo diez anteriores (el límite de
AGT21 no cambia). La versión vigente MUST NOT podarse nunca.

Fase que lo implementa: 12

#### Scenario: La undécima versión anterior se poda

- Dado una vigente y diez anteriores,
- Cuando un admin publica una versión nueva,
- Entonces queda la nueva vigente y diez anteriores, y la más antigua desaparece.

#### Scenario: La vigente nunca se poda

- Dado cualquier número de publicaciones,
- Cuando se revisa `version_estilo`,
- Entonces siempre hay exactamente una fila vigente.

### Requirement: EST-D6 — Una base sin estilo recibe el estilo inicial del segmento, una sola vez

`npm run casos:sembrar` MUST publicar el texto de `servicio/prisma/datos/estilo-inicial.md` como versión 1 de
`version_estilo` solo cuando la tabla no tiene ninguna fila, ni vigente ni retirada. Si existe cualquier versión, la
semilla MUST NOT agregar, cambiar ni restaurar nada. La publicación MUST pasar por `PublicarEstilo` (validación AGT20,
versión compartida en Redis), con la versión sin autor, y el comando MUST informar `estilo: sembrado v1` o
`estilo: ya existía` sin escribir el texto en pantalla ni en logs (R14). El archivo de respaldo `estilo.v3.md` no cambia
(AGT18): rige solo mientras la tabla esté vacía.

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-y-casos-semilla.md`)

#### Scenario: Una base nueva queda con el estilo inicial

- Dado una base sin ninguna fila en `version_estilo`,
- Cuando se corre `npm run casos:sembrar`,
- Entonces existe la versión 1 vigente con el texto de `estilo-inicial.md`, sin autor, y el comando informa `estilo: sembrado v1`.

#### Scenario: Una segunda corrida no agrega nada

- Dado una base ya sembrada,
- Cuando se vuelve a correr `npm run casos:sembrar`,
- Entonces `version_estilo` no cambia y el comando informa `estilo: ya existía`.

#### Scenario: Un estilo del usuario nunca se pisa

- Dado una base con un estilo publicado por el usuario o con versiones retiradas,
- Cuando se corre `npm run casos:sembrar`,
- Entonces no se agrega ninguna versión.
