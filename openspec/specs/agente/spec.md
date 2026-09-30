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
`guardar_datos_contacto`, `consultar_politica`). El LLM MUST NOT ejecutar consultas libres contra la
base de datos ni ningún otro origen de datos. Cuando el cliente pregunte por una condición del negocio
(contra entrega, devoluciones, garantía…), el bot MUST apoyarse en el texto que devuelve
`consultar_politica` o en `politica_contraentrega_texto` de `cotizar_envio`, y MUST NOT inventar una
condición que ninguna política contenga.

(Previously: 6 herramientas, sin `consultar_politica`.)

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
- Entonces llama a `consultar_politica` con el tema correspondiente y cita el texto que devuelve,
  sin reescribir su contenido.

#### Scenario: Una política que no existe no se inventa

- Dado que el cliente pregunta por una condición para la que `consultar_politica` devuelve
  `encontrada: false`,
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
con el texto del parámetro `aviso_datos`, dentro del **mismo** primer mensaje de texto de esa
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

### Requirement: AGT3 — Los textos fijos del agente son parámetros del negocio

Los textos que el agente envía sin pasar por el LLM MUST leerse de `parametro` (R15):
`mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada`, `aviso_datos`, `mensaje_handoff` (dentro
del horario de atención) y `mensaje_handoff_fuera_horario` (fuera de él, según el puerto `HORARIO`).
Si una clave no existe o está vacía, MUST usarse un texto de respaldo definido en un solo lugar del
código del agente (patrón de las Fases 05 y 06), nunca repetido en varios archivos.

Fase que lo implementa: 07a

#### Scenario: Un texto configurado por el negocio reemplaza al de respaldo

- Dado el parámetro `mensaje_pedir_texto_audio` con un texto configurado,
- Cuando el cliente envía un audio,
- Entonces el bot responde exactamente ese texto.

#### Scenario: Sin el parámetro se usa el texto de respaldo

- Dado que no existe el parámetro `mensaje_imagen_no_procesada`,
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

- Dado un modelo que pide `enviar_fotos` en modo collage y luego responde texto,
- Cuando se procesa el turno,
- Entonces la respuesta tiene primero el paso de texto y después un paso de imagen con la clave del
  collage, y el modelo solo recibió `enviadas: 1`.

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

`buscar_producto`, `obtener_ficha`, `cotizar_envio` y `consultar_politica` MUST envolver los casos de
uso de `catalogo` sin recalcular nada (R2): `buscar_producto` devuelve hasta 5 resultados `{id, sku,
nombre, descripcion_corta}` sin dinero; `obtener_ficha` devuelve `precio_texto` y `tiene_fotos`, y un
error explícito si el producto no existe o está inactivo; `cotizar_envio` recibe `id_producto`,
`departamento` y `ciudad` opcional y devuelve `rango_texto`, `dias_texto`, `contraentrega_disponible`
y, con contra entrega, `politica_contraentrega_texto`, o `cobertura: false` con el mensaje de fuera de
cobertura y el efecto `sin-cobertura`; `consultar_politica` devuelve el texto literal o
`encontrada: false` con los temas disponibles.

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

#### Scenario: consultar_politica devuelve el texto literal

- Dado el parámetro `politica_devoluciones` configurado,
- Cuando el modelo llama `consultar_politica` con el tema `devoluciones`,
- Entonces el resultado trae `encontrada: true` y el texto sin ninguna modificación.

### Requirement: AGT9 — enviar_fotos manda collage por defecto e individuales con tope por sesión

`enviar_fotos` MUST recibir `id_producto` (id o SKU) y `modo` (`collage` o `individuales`). En modo
`collage` MUST producir un efecto `enviar-imagen` con la clave del collage del producto. En modo
`individuales` MUST producir un efecto por foto, en orden (portada primero), sin superar
`AGENTE_FOTOS_INDIVIDUALES_MAX` fotos individuales por sesión. Si el producto no existe o no tiene
fotos, o el tope ya se alcanzó, MUST devolver `enviadas: 0` con un error explícito para que el modelo
no afirme haber enviado nada. Al modelo MUST devolverle solo `enviadas` (y `error`), nunca claves ni
URLs.

Fase que lo implementa: 07b

#### Scenario: El modo collage produce una sola imagen

- Dado un producto activo con collage,
- Cuando el modelo llama `enviar_fotos` en modo `collage`,
- Entonces el turno tiene un efecto de imagen con la clave del collage y el modelo recibe
  `enviadas: 1`.

#### Scenario: Las fotos individuales respetan el tope de la sesión

- Dado una sesión en la que ya se enviaron 3 fotos individuales y un tope de 4,
- Cuando el modelo pide 3 fotos individuales de otro producto,
- Entonces solo se agrega una imagen y el modelo recibe `enviadas: 1`.

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

`marcar_lead_caliente` MUST recibir `temperatura` (`tibio`/`caliente`), `senales`, `resumen` e
`id_producto` (o `null`), y MUST pasar la propuesta al puerto `EVALUADOR_LEAD`, que decide si se deriva
(**R9**: el LLM propone, la escala confirma). Mientras la Fase 08 no provea la escala, la
implementación de la 07 MUST responder `derivado: false` con un motivo para el modelo y MUST NOT
escribir en `lead` ni derivar. Un turno con el efecto `sin-cobertura` MUST responder `derivado: false`
sin consultar la escala.

Fase que lo implementa: 07b (herramienta y puerto); 08 (escala, `lead`, derivación)

#### Scenario: Sin escala la propuesta no deriva

- Dado la implementación del evaluador de la Fase 07,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces el modelo recibe `derivado: false` con un motivo, el turno no tiene handoff y no se escribe
  ninguna fila en `lead`.

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

El prompt de sistema MUST armarse desde archivos versionados en `agente/prompts/` en este orden:
reglas (incluida la regla de cuándo citar una política), catálogo compacto sin precios, y al final las
instrucciones variables del turno (contexto inicial, horario). El prefijo (reglas + catálogo) MUST ser
idéntico entre turnos de conversaciones distintas mientras no cambie el catálogo, para aprovechar la
caché de prompts (ADR-0002). La versión del prompt MUST quedar en un log estructurado del turno (sin
contenido).

Fase que lo implementa: 07b

#### Scenario: Dos conversaciones distintas comparten el mismo prefijo

- Dado dos turnos de conversaciones distintas con el mismo catálogo,
- Cuando se arma el prompt de cada uno,
- Entonces ambos empiezan con exactamente el mismo texto hasta el final del catálogo compacto.

#### Scenario: El prompt no contiene precios

- Dado un catálogo con productos que tienen precio,
- Cuando se arma el prompt de sistema,
- Entonces el texto no contiene ningún valor en pesos.
