# Agente — Specification

## Purpose

El agente LLM atiende al cliente por WhatsApp (vía Chatwoot): consulta el catálogo, cotiza envíos,
manda fotos y califica el interés de compra. Solo puede tocar el mundo real a través de las
herramientas tipadas que se le exponen; nunca hace cálculos de dinero ni accede a la base
directamente. Este dominio cubre esas dos garantías y el manejo de mensajes que no son texto.

## Requirements

### Requirement: R1 — El LLM solo accede a datos por las herramientas definidas

El sistema MUST restringir el acceso a datos del LLM exclusivamente a las 9 herramientas definidas
(`buscar_producto`, `obtener_ficha`, `cotizar_envio`, `enviar_fotos`, `marcar_lead_caliente`,
`guardar_datos_contacto`, `consultar_caso`, `derivar_a_asesor`, `registrar_consentimiento`). El LLM MUST NOT ejecutar consultas libres contra la
base de datos ni ningún otro origen de datos. Cuando el cliente pregunte por una condición del negocio
(contra entrega, devoluciones, garantía…), el bot MUST apoyarse en el texto que devuelve
`consultar_caso`, y MUST NOT inventar una
condición que ningún caso contenga.

(Previously: 6 herramientas, sin `consultar_politica`; desde la Fase 12 la herramienta es `consultar_caso`, CAS8; la Fase 12d suma `derivar_a_asesor` y `registrar_consentimiento` y `cotizar_envio` ya no adjunta textos de política, CAS12.)

Fase que lo implementa: 07; 12d (nueve herramientas)

#### Scenario: El LLM necesita datos de un producto

- Dado que el LLM necesita datos de un producto para responder,
- Cuando genera su respuesta,
- Entonces solo puede obtenerlos llamando a una de las 9 herramientas definidas.

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
avisar al asesor con el motivo `audio-repetido` y volver a pedir texto con el mismo caso del sistema, sin
cambiar el estado de la conversación (un mensaje de texto reinicia la cuenta); una imagen SHALL pedir que
el cliente la describa en texto o mencione el SKU, sin procesarla; una ubicación MUST entrar al flujo
normal como una ubicación compartida, sin geocodificarla y sin coordenadas (P27): el modelo solo sabe que no puede leerlas
(regla 6 de `seguridad.v1.md`, AGT13), y qué le responde al cliente lo define un caso de uso del dueño (ejemplo «Ubicación
compartida» de la guía, no sembrado); cualquier otro tipo (sticker, tarjeta de contacto, documento, etc.) MUST
ignorarse sin responder, sin consumir turno ni tokens.

(Previously: el segundo audio consecutivo derivaba la conversación a humano con un handoff `audio-repetido` y el texto de
traspaso; las reglas del prompt ordenaban pedir la ciudad y el departamento ante una ubicación.)

Fase que lo implementa: 07a (audio, imagen, ignorar, ráfaga mixta); 07b (ubicación en el flujo del
LLM); 12d (el audio repetido avisa y no traspasa)

#### Scenario: Primer audio del cliente

- Dado que el cliente envía un mensaje de audio,
- Cuando llega el mensaje,
- Entonces el bot pide texto con una excusa amable, sin llamar al LLM.

#### Scenario: Segundo audio consecutivo avisa al asesor y sigue pidiendo texto

- Dado que el cliente ya envió un audio antes en la misma sesión de la conversación y envía un
  segundo audio,
- Cuando llega el segundo audio,
- Entonces el bot vuelve a pedir texto con el texto del caso del sistema de audio, la respuesta lleva un aviso `audio-repetido` y no lleva handoff.

#### Scenario: Un texto entre dos audios reinicia la cuenta

- Dado que el cliente envió un audio, luego un texto, y luego otro audio,
- Cuando llega el segundo audio,
- Entonces el bot vuelve a pedir texto y la respuesta no lleva aviso.

#### Scenario: Imagen entrante

- Dado que el cliente envía una imagen,
- Cuando llega el mensaje,
- Entonces el bot pide que la describa en texto o mencione el SKU, sin procesar la imagen.

#### Scenario: Ubicación entrante

- Dado que el cliente envía su ubicación,
- Cuando llega el mensaje,
- Entonces el turno llega al LLM con el marcador de ubicación compartida, sin coordenadas ni geocodificación, y sin
  ninguna instrucción fija sobre qué responder.

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
(R12), (2) tope de turnos (R13), (3) petición de persona (AGT14), (4) generación de contenido (LLM). Una política que deja pasar MAY
pedir un aviso al asesor; el motor MUST agregarlo a la respuesta final del turno. Un turno que ninguna política responde MUST
terminar sin pasos. Agregar una política MUST NOT exigir cambiar las demás (A5). El motor MUST NOT anteponer ningún texto a la respuesta de una política.

(Previously: el aviso de datos (AGT2) se aplicaba sobre la respuesta de cualquier política.)

Fase que lo implementa: 07a; 12d (se retira el aviso de datos; una política puede pedir un aviso)

#### Scenario: Una política que responde corta el resto del pipeline

- Dado un turno con un solo mensaje de audio,
- Cuando el pipeline lo procesa,
- Entonces responde la política de no textuales y ni el tope de turnos ni la generación de contenido
  se consultan.

#### Scenario: Un turno de texto llega hasta la generación de contenido

- Dado un turno de texto en una sesión que no alcanzó el tope,
- Cuando el pipeline lo procesa,
- Entonces la respuesta la produce la generación de contenido.

#### Scenario: Una política que deja pasar con aviso lo suma a la respuesta final

- Dado un turno cuya política de petición de persona deja pasar pidiendo un aviso `pide-persona`,
- Cuando la generación de contenido responde con un paso de texto,
- Entonces la respuesta final trae ese paso y el aviso `pide-persona`.

#### Scenario: El motor no antepone texto a la primera respuesta

- Dado una conversación nueva y un turno de texto,
- Cuando el bot responde,
- Entonces el primer paso de texto es exactamente el que produjo la generación de contenido.

### Requirement: AGT3 — Los textos fijos del agente son casos del sistema

Los textos que el agente envía sin pasar por el LLM MUST leerse del puerto de textos del asistente (CAS7, R15):
`mensaje_pedir_texto_audio`, `mensaje_imagen_no_procesada` y `mensaje_espera_handoff` (la respuesta del tope de turnos, que
deja la conversación en espera). Si el caso no existe o está vacío, MUST usarse su texto de respaldo, definido en un solo lugar
del código de `asistente` (`dominio/sistema.ts`), nunca repetido en varios archivos. El agente MUST NOT leer ningún texto de
traspaso: ya no existen.

(Previously: también leía `aviso_datos`, `mensaje_handoff` y `mensaje_handoff_fuera_horario`, este último según el horario.)

Fase que lo implementa: 07a; 12d (se retiran los textos de aviso de datos y de traspaso)

#### Scenario: Un texto configurado por el negocio reemplaza al de respaldo

- Dado el caso `mensaje_pedir_texto_audio` con un texto configurado,
- Cuando el cliente envía un audio,
- Entonces el bot responde exactamente ese texto.

#### Scenario: Sin el parámetro se usa el texto de respaldo

- Dado que no existe el caso `mensaje_imagen_no_procesada`,
- Cuando el cliente envía una imagen,
- Entonces el bot responde el texto de respaldo del agente.

#### Scenario: El tope de turnos responde con el texto de espera, dentro y fuera de horario

- Dado que la conversación alcanza el tope de turnos, dentro o fuera del horario de atención,
- Cuando el bot lo detecta,
- Entonces el mensaje que envía es el del caso `mensaje_espera_handoff`, el mismo en ambos casos.

### Requirement: AGT4 — Bucle de herramientas genérico con efectos tipados

El agente MUST resolver el contenido del turno con un bucle que llama a `LLM_PORT` (perfil
`conversacion`) con las definiciones de las herramientas registradas, ejecuta las llamadas que
devuelve el modelo y le devuelve los resultados, hasta obtener un texto final. El bucle MUST NOT
conocer el nombre de ninguna herramienta (A4): cada herramienta devuelve `{ paraElModelo, efectos }` y
los efectos (`enviar-imagen`, `sin-cobertura`, `datos-contacto-guardados`, `lead-propuesto`, `avisar-asesor`) se
aplican al final del turno; `avisar-asesor` MUST convertirse en el `aviso` de la respuesta del turno, una sola vez aunque
varias herramientas lo emitan. Una llamada a una herramienta desconocida o con argumentos inválidos MUST
devolverse al modelo como error de herramienta; la segunda llamada inválida del mismo turno MUST
terminar el turno en handoff con motivo `argumentos-invalidos` y el texto `mensaje_error_llm`.

(Previously: los efectos no incluían `avisar-asesor` y el bucle citaba siete herramientas.)

Fase que lo implementa: 07b; 12d (efecto `avisar-asesor`)

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

#### Scenario: El efecto avisar-asesor se vuelve el aviso de la respuesta

- Dado un modelo que llama `derivar_a_asesor` y luego responde texto,
- Cuando se procesa el turno,
- Entonces la respuesta trae el paso de texto del modelo y un aviso `pide-asesor`, sin handoff.

#### Scenario: Dos efectos avisar-asesor en un turno dan un solo aviso

- Dado un modelo que llama `derivar_a_asesor` y `marcar_lead_caliente` confirmado en el mismo turno,
- Cuando se procesa el turno,
- Entonces la respuesta trae un único aviso.

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
`departamento` y `ciudad` opcional y devuelve `rango_texto`, `dias_texto` y `contraentrega_disponible`, o
`cobertura: false` con el efecto `sin-cobertura`; no devuelve ningún texto de política ni de falta de cobertura: el agente consulta el caso que corresponda con `consultar_caso` (CAS8, CAS12); `consultar_caso` devuelve el texto y el modo del caso o la lista de casos
disponibles si el título no existe (CAS8).

(Previously: `cotizar_envio` devolvía además `politica_contraentrega_texto` y el mensaje de fuera de cobertura.)

Fase que lo implementa: 07b; 12d (`cotizar_envio` ya no adjunta textos)

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

#### Scenario: cotizar_envio sin cobertura deja el efecto sin-cobertura y ningún texto

- Dado un destino excluido de la cobertura,
- Cuando el modelo llama `cotizar_envio`,
- Entonces el resultado trae `cobertura: false`, ningún rango ni mensaje, y el turno registra el efecto `sin-cobertura`.

#### Scenario: cotizar_envio con contra entrega no adjunta la política

- Dado una tarifa con contra entrega disponible,
- Cuando el modelo llama `cotizar_envio`,
- Entonces el resultado trae `contraentrega_disponible: true` y no trae ningún texto de política.

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
`localidad`, y MUST guardarlos en el `contacto` de la conversación (por su id, **P1**) **solo** si el contacto aceptó el
tratamiento de datos (AGT26). Si `telefono_contacto` no tiene al menos 7 dígitos ("este mismo número"), MUST NOT guardar un
teléfono alterno. Ninguno de esos valores MUST aparecer en logs (**R14**).

(Previously: guardaba sin comprobar ningún consentimiento.)

Fase que lo implementa: 07b; 12d (puerta de consentimiento)

#### Scenario: Los datos quedan guardados en el contacto de la conversación

- Dado una conversación de un contacto que aceptó el tratamiento de datos y no tiene datos capturados,
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
`EVALUADOR_LEAD`, que decide si se deriva (**R9**: el LLM propone, la escala confirma). MUST registrar la propuesta solo si el
contacto aceptó el tratamiento de datos (AGT26). La implementación MUST guardar el lead (LDS2) y MUST responder
`derivado: true` solo si la escala lo confirmó; un `derivado: true` dentro de horario MUST convertirse en un aviso con motivo
`lead-caliente` que **no sustituye el texto del modelo** ni traspasa la conversación, y fuera de horario en la captura de datos (LDS4). Un
turno con el efecto `sin-cobertura` MUST responder `derivado: false` sin consultar la escala ni crear el lead.

(Previously: un `derivado: true` dentro de horario terminaba el turno en un handoff `lead-caliente` con el texto de traspaso del negocio, en lugar del texto del modelo.)

Fase que lo implementa: 07b (herramienta y puerto); 08 (escala, `lead`, derivación); 12d (aviso en lugar de handoff y puerta de consentimiento)

#### Scenario: La propuesta confirmada por la escala avisa y el bot sigue

- Dado un turno con `senales = ["pide_pagar"]` dentro del horario de atención y un contacto que aceptó el tratamiento de datos,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces el modelo recibe `derivado: true` y el turno termina con el texto del modelo, un aviso `lead-caliente` y ningún handoff.

#### Scenario: La propuesta que la escala no confirma no avisa

- Dado un turno con `senales = ["pregunta_precio"]` y un contacto que aceptó,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces el modelo recibe `derivado: false` con un motivo y el turno no tiene aviso ni handoff.

#### Scenario: Sin cobertura no se evalúa el lead

- Dado un turno en el que `cotizar_envio` dejó el efecto `sin-cobertura`,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces el modelo recibe `derivado: false` y el evaluador no se consulta.

#### Scenario: Sin consentimiento el lead no se registra

- Dado un contacto que no aceptó el tratamiento de datos,
- Cuando el modelo llama `marcar_lead_caliente`,
- Entonces el modelo recibe `requiereConsentimiento: true`, no se crea ningún lead y el evaluador no se consulta.

### Requirement: AGT12 — Contexto inicial del turno: producto de entrada y cliente conocido

En el primer turno de la conversación, si el texto contiene un SKU (`/SKU-[A-Z0-9-]+/i`) de un producto
activo, el contexto del turno MUST informar al modelo, como un hecho, que el cliente llegó desde ese producto (su nombre y su
id); si el SKU no existe o está inactivo, MUST tratar el turno como una consulta genérica. Si el contacto tiene nombre
guardado, el contexto MUST informar el hecho «el cliente se llama X». El contexto MUST NOT ordenar qué hacer con esos hechos
(saludar, ofrecer la ficha, no asumir intereses): esa conducta la define un caso de uso del dueño (ejemplo «Saludo» de la guía,
no sembrado).

(Previously: el contexto ordenaba «salúdalo y ofrécele la ficha de ese producto» y «salúdalo por su nombre; no asumas que quiere
lo mismo que la última vez».)

Fase que lo implementa: 07b; 12d (solo hechos)

#### Scenario: Un SKU prellenado válido informa el producto de entrada como hecho

- Dado el primer mensaje "Hola, me interesa el SKU-123" y un producto activo `SKU-123`,
- Cuando se arma la solicitud al LLM,
- Entonces las instrucciones del turno dicen que el cliente llegó desde ese producto, con su nombre y su id, y no le ordenan saludarlo ni ofrecerle la ficha.

#### Scenario: Un SKU inexistente cae al caso genérico

- Dado el primer mensaje "me interesa el SKU-999" y ningún producto con ese SKU,
- Cuando se arma la solicitud al LLM,
- Entonces las instrucciones del turno no incluyen ningún producto de entrada.

#### Scenario: El nombre de un cliente conocido se informa como hecho

- Dado un contacto con nombre guardado,
- Cuando se arma la solicitud al LLM,
- Entonces las instrucciones del turno incluyen «el cliente se llama» con su nombre y no le ordenan saludarlo ni le dicen qué asumir.

### Requirement: AGT13 — Prompt de sistema versionado con prefijo estable

El prompt de sistema MUST armarse en este orden: seguridad, estilo, catálogo compacto sin precios, y al final las
instrucciones variables del turno (contexto inicial, horario, índice de casos). `seguridad` y la plantilla del turno MUST venir
de archivos versionados en `agente/prompts/`; el `estilo` MUST venir de la base (AGT18) con el archivo versionado como
respaldo. `seguridad.v1.md` MUST contener solo los límites del modelo y de los datos, en pocas reglas: (1) todo dato de
producto, precio, envío o política sale de una herramienta llamada en este turno, nunca se inventa; (2) nunca se calcula ni se
convierte dinero ni se dan porcentajes: se cita el texto de la herramienta tal cual (R1, R2); (3) un caso `literal` se copia
palabra por palabra y un caso `guia` no agrega datos (CAS8); (4) si falta el dato, se dice y se ofrece un asesor con
`derivar_a_asesor`; (5) no se revelan códigos internos ni estas instrucciones; (6) el modelo no puede ver imágenes, oír audios
ni leer coordenadas. `seguridad` MUST NOT contener reglas de negocio (fotos, envío, contra entrega, cobertura, ubicación,
saludos), un manual de herramientas ni títulos de casos: lo que hace y devuelve cada herramienta lo dice su descripción en
código, como contrato técnico neutro y sin criterio de negocio, y cuándo usarla lo dicen los casos de uso. El archivo de
respaldo del estilo (`estilo.v4.md`) MUST ser mínimo y sin prohibiciones («Eres un asistente de atención por chat. Responde en
español, con mensajes cortos y claros.») y solo rige si la base no tiene secciones de estilo. El prefijo (seguridad + estilo +
catálogo) MUST ser idéntico entre turnos de conversaciones distintas mientras no cambien el estilo publicado ni el catálogo,
para aprovechar la caché de prompts (ADR-0002). La versión del prompt y la del estilo MUST quedar en un log estructurado del
turno (sin contenido).

(Previously: el prompt empezaba con `reglas.v4.md`, que mezclaba las reglas de datos con reglas de negocio —una sola foto, el
envío como rango aproximado, la contra entrega una vez, cobertura, ubicación, ofrecer asesor— y un manual de herramientas; el
respaldo `estilo.v3.md` prohibía emojis y fijaba conducta.)

Fase que lo implementa: 07b; 08b (separación de `estilo`); 08c (estilo desde la base); 12d (`seguridad.v1.md` y `estilo.v4.md`)

#### Scenario: Dos conversaciones distintas comparten el mismo prefijo

- Dado dos turnos de conversaciones distintas con el mismo catálogo y el mismo estilo publicado,
- Cuando se arma el prompt de cada uno,
- Entonces ambos empiezan con exactamente el mismo texto hasta el final del catálogo compacto.

#### Scenario: El prompt no contiene precios

- Dado un catálogo con productos que tienen precio,
- Cuando se arma el prompt de sistema,
- Entonces el texto no contiene ningún valor en pesos.

#### Scenario: El estilo va entre la seguridad y el catálogo

- Dado el archivo `seguridad.v1.md` y un estilo,
- Cuando se arma el prompt de sistema,
- Entonces el texto contiene primero la seguridad, luego el estilo y después el catálogo.

#### Scenario: Cambiar el estilo no cambia la seguridad

- Dado dos estilos distintos con el mismo archivo `seguridad.v1.md`,
- Cuando se arma el prompt con cada uno,
- Entonces la parte de seguridad es idéntica en ambos textos.

#### Scenario: La versión del estilo queda en el log sin su contenido

- Dado un estilo publicado en la versión 3,
- Cuando se procesa un turno,
- Entonces el log estructurado lleva la versión del prompt y la del estilo, y no el texto del estilo.

#### Scenario: La seguridad no trae reglas de negocio ni títulos de casos

- Dado el archivo `seguridad.v1.md`,
- Cuando se lee,
- Entonces no contiene «foto», «aproximado», «contra entrega», «cobertura», «ubicación», «salud», ni el título de ningún caso, ni una sección de manual de herramientas.

#### Scenario: Sin secciones de estilo rige el respaldo mínimo

- Dado una base sin secciones de estilo,
- Cuando se arma el prompt,
- Entonces la parte de estilo es exactamente el texto de `estilo.v4.md` y no contiene ninguna prohibición.

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
textuales y de tope de turnos, una política que aplica LDS3: si el texto pide una persona, MUST pedir un aviso con el motivo
`pide-persona` y dejar pasar el turno al contenido del LLM, con una instrucción en el contexto de que el cliente pidió una
persona y el asesor fue avisado; si no, deja pasar sin aviso. La política MUST NOT responder con un texto propio ni traspasar la conversación.

(Previously: respondía con el texto de handoff del horario y el motivo `pide-persona`, sin llegar al LLM.)

Fase que lo implementa: 08; 12d (avisa y deja seguir al LLM)

#### Scenario: La política avisa y el turno llega al LLM

- Dado el mensaje "pásame con un humano",
- Cuando el motor recorre las políticas,
- Entonces la política pide el aviso `pide-persona`, no responde por su cuenta y el turno llega a `ContenidoLlm` con la instrucción de que el asesor fue avisado.

#### Scenario: Un mensaje normal pasa al LLM sin aviso

- Dado el mensaje "hola, busco un collar",
- Cuando el motor recorre las políticas,
- Entonces la política deja pasar sin pedir ningún aviso y responde `ContenidoLlm`.

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

Un estilo MUST rechazarse, con el motivo, si está vacío o en blanco, si supera 10.000 caracteres, si contiene un
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
- Entonces la respuesta tiene origen `archivo` y el texto de `estilo.v4.md`.

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
- Entonces rige `estilo.v4.md` con origen `archivo` (AGT18).

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
`estilo: ya existía` sin escribir el texto en pantalla ni en logs (R14). El archivo de respaldo `estilo.v4.md` no cambia
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

### Requirement: EST-S1 — El estilo se compone de secciones, sin categorías

El estilo del bot MUST componerse de las filas de `seccion_estilo` (`MODELO_DATOS.md`): cada sección tiene título único
(sin distinguir mayúsculas ni acentos), texto, `orden` y `activo`. El bot MUST recibir **un solo bloque**: las secciones
activas por `orden`, cada una como `# título`, una línea en blanco y su texto (`componerEstilo`). El estilo MUST ser
contexto siempre activo del prompt y MUST NOT ser una herramienta que el modelo decide invocar. No hay categorías ni
borrado de secciones: apagar (`activo = false`) es la única forma de retirarla. `ProveedorEstilo` MUST seguir cacheando
un solo texto (el compuesto) en memoria, con la versión compartida en Redis y el vencimiento de 5 minutos de AGT18, sin
consultas extra por turno.

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-en-secciones.md`)

#### Scenario: El bot recibe las secciones activas en su orden

- Dado tres secciones, la segunda apagada,
- Cuando se arma el prompt del turno,
- Entonces el estilo es la primera y la tercera como `# título`, línea en blanco y texto, en su orden.

#### Scenario: Un título repetido no se acepta

- Dado una sección «Tono»,
- Cuando se crea otra llamada «tono»,
- Entonces se rechaza como duplicada y no cambia nada.

### Requirement: EST-S2 — Cada sección y el compuesto se validan antes de guardarse

Cada sección MUST cumplir las reglas de AGT20 (sin valores en pesos, SKU ni marcadores `{{...}}`), tener un título de una
línea de hasta 100 caracteres y un texto sin líneas que empiecen por `# ` (partirían la sección). El estilo compuesto
resultante MUST tener entre 1 y 10.000 caracteres. Un cambio que no cumple MUST revertirse completo: la versión vigente y
las secciones no cambian, y el motivo nombra la regla sin copiar el texto (R14).

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-en-secciones.md`)

#### Scenario: El tope se aplica a la suma

- Dado un estilo compuesto de 3.900 caracteres,
- Cuando se crea una sección que lo llevaría a 4.100,
- Entonces se rechaza con `estilo-invalido` y no se crea.

#### Scenario: Un texto con encabezado propio se rechaza

- Dado un texto de sección con una línea que empieza por `# `,
- Cuando se guarda,
- Entonces se rechaza con `estilo-invalido`.

### Requirement: EST-S3 — La migración parte el estilo vigente en secciones

La migración `estilo_secciones` MUST dividir el texto de la versión vigente de `version_estilo` por sus encabezados `# `:
lo anterior al primero queda como la sección «General», las secciones sin texto se descartan, los títulos repetidos se
numeran y los saltos de línea de Windows no cambian el resultado. Sin versión vigente MUST NOT insertar nada. Recompuestas,
las secciones MUST dar el mismo texto del estilo vigente.

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-en-secciones.md`)

#### Scenario: Un estilo sin encabezados es una sola sección

- Dado un estilo vigente sin ningún `# `,
- Cuando corre la migración,
- Entonces existe una sección «General» con ese texto.

### Requirement: EST-S4 — Publicar y restaurar reemplazan las secciones

Publicar un estilo completo (`PUT /api/v1/agente/estilo`, `prompt:estilo -- publicar`) y restaurar una versión del
historial MUST reemplazar todas las secciones por la división del texto por encabezados `# ` (`dividirEstilo`) y guardar la
versión nueva en `version_estilo`, todo en una transacción. Las reglas de AGT20 a AGT22 no cambian.

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-en-secciones.md`)

#### Scenario: Restaurar devuelve las secciones de esa versión

- Dado un historial con la versión 1 de dos secciones y un estilo vigente de cuatro,
- Cuando un admin restaura la versión 1,
- Entonces quedan las dos secciones de esa versión y existe una versión nueva con su texto.

### Requirement: EST-S5 — Cada cambio que altera el compuesto guarda su foto

Crear, editar, apagar, encender o reordenar una sección MUST guardar en `version_estilo`, dentro de la misma transacción, la
foto del estilo compuesto resultante (la versión nueva es la vigente; el historial conserva las diez anteriores, EST-D5) y
subir la versión compartida en Redis para que el cambio llegue al siguiente mensaje (AGT19). Un cambio que deja el
compuesto igual MUST NOT crear versión. Cada versión conserva quién la publicó (EST-D3).

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-en-secciones.md`)

#### Scenario: Crear una sección crea una versión

- Dado un estilo vigente en la versión 2,
- Cuando un admin crea una sección válida,
- Entonces la versión 3 es la vigente y contiene el compuesto con la sección al final.

#### Scenario: Un cambio que no altera el compuesto no crea versión

- Dado una sección apagada,
- Cuando se apaga otra vez,
- Entonces la versión vigente no cambia.

### Requirement: EST-API — Las secciones se administran por la API, solo por un admin

El sistema MUST exponer, solo al rol `admin` (API7, USR6), estas operaciones, con sus reglas en EST-S2 y EST-S5:

- `GET /api/v1/agente/estilo/secciones` (`listarSeccionesEstilo`): las secciones por orden, activas o no, el largo del
  compuesto y su máximo.
- `POST /api/v1/agente/estilo/secciones` (`crearSeccionEstilo`): crea al final; `201`, `409` `seccion-duplicada` o `422`
  `estilo-invalido`.
- `PATCH /api/v1/agente/estilo/secciones/:id` (`editarSeccionEstilo`): edita título, texto o `activo` con la marca
  `actualizado` que se leyó (bloqueo optimista); `404` `seccion-inexistente`, `409` `seccion-modificada` si otro admin la
  cambió, `409` `seccion-duplicada` o `422` `estilo-invalido`.
- `PUT /api/v1/agente/estilo/secciones/orden` (`ordenarSeccionesEstilo`): recibe la lista completa de ids; `422`
  `orden-secciones-invalido` si no coincide con las secciones existentes.

No MUST existir una operación de borrado. Ni las respuestas de error ni los logs MUST llevar el texto de una sección: solo
ids, la versión y el id del usuario (R14).

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-en-secciones.md`)

#### Scenario: Editar con una marca vieja se rechaza

- Dado una sección que otro admin editó después de leerla,
- Cuando el primero la edita con la marca que leyó,
- Entonces la respuesta es `409` con `seccion-modificada` y nada cambia.

#### Scenario: Reordenar con una lista incompleta se rechaza

- Dado tres secciones,
- Cuando un admin envía el orden con solo dos ids,
- Entonces la respuesta es `422` con `orden-secciones-invalido` y el orden no cambia.

#### Scenario: Un asesor no administra las secciones

- Dado un asesor con sesión,
- Cuando llama a cualquiera de las operaciones de secciones,
- Entonces la respuesta es `403` con `rol-insuficiente`.

### Requirement: EST-CLI — El comando lista las secciones sin mostrar sus textos

`npm run prompt:estilo -- secciones` MUST ser de solo lectura y listar cada sección con su orden, si está activa o apagada,
su título y su largo. MUST NOT imprimir el texto de ninguna sección (R14). Crear, editar y ordenar secciones se hace
desde la pantalla del back office.

Fase que lo implementa: ninguna (trabajo fuera de fase, `odd/tasks/estilo-en-secciones.md`)

#### Scenario: El listado no muestra textos

- Dado un estilo de varias secciones,
- Cuando se corre `npm run prompt:estilo -- secciones`,
- Entonces aparecen orden, estado, título y largo de cada una, y ningún texto.

### Requirement: AGT24 — derivar_a_asesor avisa al asesor sin traspasar la conversación

El agente MUST exponer la herramienta `derivar_a_asesor({ motivo })`, con `motivo` un texto breve de hasta 200 caracteres que
el modelo escribe para justificar el aviso. Al llamarla, dentro o fuera del horario de atención, MUST emitir el efecto
`avisar-asesor` con el motivo `pide-asesor` y responder al modelo `{ derivado: true }`; el bot MUST seguir respondiendo en el
mismo turno. El texto de `motivo` MUST NOT guardarse, registrarse en logs ni copiarse al aviso (R14). La descripción de la
herramienta MUST decir solo qué hace (avisa a un asesor humano sin traspasar la conversación) y qué devuelve, sin criterio de
negocio. La parte fija del prompt MUST nombrarla solo en la regla 4 de seguridad (falta un dato, AGT13); cuándo más se usa lo
indican los casos de uso del dueño. La petición explícita de una persona ya la cubre la política determinista (LDS3).

Fase que lo implementa: 12d

#### Scenario: El cliente pide un asesor y el modelo avisa

- Dado un turno en el que el cliente pide hablar con un asesor y la política determinista no lo detectó,
- Cuando el modelo llama `derivar_a_asesor` con un motivo breve,
- Entonces el modelo recibe `{ derivado: true }`, el turno termina con su texto final y un aviso `pide-asesor`, y la conversación sigue en `bot`.

#### Scenario: Fuera de horario también avisa

- Dado un turno fuera del horario de atención,
- Cuando el modelo llama `derivar_a_asesor`,
- Entonces la respuesta del turno trae el aviso `pide-asesor` igual que dentro de horario.

#### Scenario: Un caso de uso puede pedir el aviso

- Dado un caso de uso «Compras al por mayor» cuyo texto indica avisar al asesor,
- Cuando el cliente pregunta por comprar al por mayor y el modelo sigue ese caso,
- Entonces el modelo llama `derivar_a_asesor` y el turno trae el aviso.

#### Scenario: El motivo escrito por el modelo no queda en ningún lado

- Dado una llamada a `derivar_a_asesor` con un motivo que menciona un nombre,
- Cuando se inspeccionan los logs, el aviso encolado y la base,
- Entonces ninguno contiene ese motivo.

#### Scenario: Un motivo de más de 200 caracteres es un argumento inválido

- Dado una llamada a `derivar_a_asesor` con un motivo de 201 caracteres,
- Cuando el bucle valida los argumentos,
- Entonces el modelo recibe un error de herramienta y no se emite ningún efecto.

#### Scenario: La parte fija del prompt nombra la herramienta solo ante un dato que falta

- Dado el prompt de sistema del turno sin casos de uso,
- Cuando se arma,
- Entonces la seguridad nombra `derivar_a_asesor` solo en la regla del dato que falta, la descripción de la herramienta solo dice qué hace y qué devuelve, y nada ordena un traspaso a humano.

### Requirement: AGT25 — registrar_consentimiento guarda la respuesta del cliente al tratamiento de datos

El agente MUST exponer la herramienta `registrar_consentimiento({ acepta })`, con `acepta` un booleano. MUST registrar la
aceptación o el rechazo en el contacto de la conversación (PRV1), con la fecha del `Clock` y el contacto tomado del contexto
del turno, nunca de los argumentos; un argumento adicional MUST rechazarse. Repetir la misma respuesta MUST NOT cambiar la
fecha original. MUST responder al modelo `{ registrado: true, acepta }`. Ningún dato del cliente MUST aparecer en logs (R14).
La descripción de la herramienta, como contrato técnico, MUST decir que registra la respuesta explícita del cliente a la
pregunta de aceptación (AGT27), no una inferencia.

Fase que lo implementa: 12d

#### Scenario: El cliente acepta y queda registrado

- Dado un contacto sin respuesta y un cliente que dice «sí, acepto»,
- Cuando el modelo llama `registrar_consentimiento` con `acepta = true`,
- Entonces el contacto queda con la aceptación fechada por el `Clock` y el modelo recibe `{ registrado: true, acepta: true }`.

#### Scenario: El cliente rechaza y queda registrado

- Dado un contacto sin respuesta y un cliente que dice «no, gracias»,
- Cuando el modelo llama `registrar_consentimiento` con `acepta = false`,
- Entonces el contacto queda con el rechazo fechado y el modelo recibe `{ registrado: true, acepta: false }`.

#### Scenario: El contacto sale del contexto y no de los argumentos

- Dado una llamada que incluye un identificador de contacto distinto en los argumentos,
- Cuando el bucle valida los argumentos,
- Entonces el modelo recibe un error de herramienta y ningún contacto cambia.

#### Scenario: Repetir la aceptación conserva la fecha original

- Dado un contacto que aceptó a las 10:00,
- Cuando el modelo vuelve a llamar con `acepta = true` a las 11:00,
- Entonces la aceptación sigue fechada a las 10:00.

#### Scenario: Un fallo al guardar el consentimiento no se da por registrado

- Dado que la escritura en la base falla,
- Cuando el modelo llama `registrar_consentimiento`,
- Entonces el modelo recibe un error de herramienta y el contacto sigue sin respuesta.

### Requirement: AGT26 — Sin consentimiento, las herramientas que guardan datos no guardan nada

`guardar_datos_contacto` y `marcar_lead_caliente` MUST comprobar el consentimiento del contacto en código, antes de hacer
cualquier escritura y sin depender de lo que diga el modelo. Si el contacto no aceptó (sin respuesta o con rechazo), MUST
responder al modelo `{ requiereConsentimiento: true }`, MUST NOT guardar ni crear nada y MUST NOT emitir efectos. Las demás
herramientas (`buscar_producto`, `obtener_ficha`, `cotizar_envio`, `consultar_caso`, `enviar_fotos`, `derivar_a_asesor`) MUST
funcionar sin consentimiento: el bot sigue dando información general. Si la consulta del consentimiento falla, la herramienta
MUST tratarlo como «no aceptó».

Fase que lo implementa: 12d

#### Scenario: Sin respuesta, guardar datos no guarda

- Dado un contacto sin respuesta de consentimiento,
- Cuando el modelo llama `guardar_datos_contacto` con los cuatro campos,
- Entonces el contacto no cambia, el modelo recibe `{ requiereConsentimiento: true }` y no hay efecto `datos-contacto-guardados`.

#### Scenario: Con rechazo, el lead tampoco se registra

- Dado un contacto que rechazó el tratamiento de datos,
- Cuando el modelo llama `marcar_lead_caliente` con temperatura `caliente`,
- Entonces no se crea ningún lead, no hay efecto y el modelo recibe `{ requiereConsentimiento: true }`.

#### Scenario: Con aceptación la herramienta guarda

- Dado un contacto que aceptó,
- Cuando el modelo llama `guardar_datos_contacto`,
- Entonces los datos se guardan y no se pide consentimiento.

#### Scenario: Las herramientas de información funcionan sin consentimiento

- Dado un contacto que rechazó,
- Cuando el modelo llama `obtener_ficha` y `cotizar_envio`,
- Entonces ambas responden con normalidad.

#### Scenario: Si falla la consulta del consentimiento no se guarda

- Dado que leer el consentimiento del contacto falla,
- Cuando el modelo llama `guardar_datos_contacto`,
- Entonces no se guarda nada y el modelo recibe `{ requiereConsentimiento: true }`.

### Requirement: AGT27 — El bot pide la aceptación con el caso «Tratamiento de datos» antes de tomar datos

El contexto del turno MUST informar al modelo, como un hecho, el estado del consentimiento del contacto (aceptó, rechazó o sin
respuesta). La conducta de pedir la aceptación MUST venir del caso de uso «Tratamiento de datos» (el único caso de negocio que
se siembra, CAS13): su «cuándo aplica» nombra la señal (vas a tomar datos de despacho o a registrar el interés de compra y el
contacto no aceptó) y su texto presenta al bot como asistente automatizado y pide la aceptación (P71). La parte fija del
prompt MUST NOT nombrar ese caso (AGT13). Con el caso en el índice, el bot pide la aceptación con ese texto como base; si el
cliente acepta, llama `registrar_consentimiento` y sigue; si rechaza, lo registra, sigue respondiendo dudas y no vuelve a
pedirla en ese mismo turno; con el consentimiento ya aceptado no vuelve a pedirlo. Si el dueño borra el caso, la puerta de
AGT26 sigue impidiendo guardar datos y el modelo recibe `requiereConsentimiento`: R14 nunca depende del caso.

Fase que lo implementa: 12d

#### Scenario: El contexto informa que el contacto no ha respondido

- Dado un contacto sin respuesta de consentimiento,
- Cuando se arma el contexto del turno,
- Entonces incluye que el consentimiento está pendiente.

#### Scenario: El contexto informa que el contacto ya aceptó

- Dado un contacto que aceptó,
- Cuando se arma el contexto del turno,
- Entonces incluye el hecho de que ya aceptó, sin ninguna orden sobre qué decir.

#### Scenario: Antes de tomar datos el bot consulta el caso y pide la aceptación

- Dado un cliente sin respuesta de consentimiento que quiere comprar y la eval guionada del flujo,
- Cuando el modelo llega a la captura de datos,
- Entonces consulta el caso «Tratamiento de datos», pide la aceptación y no llama `guardar_datos_contacto` todavía.

#### Scenario: Con la aceptación sigue el flujo normal

- Dado un cliente que responde «sí acepto» a la pregunta,
- Cuando la eval guionada continúa el flujo,
- Entonces el modelo llama `registrar_consentimiento` con `acepta = true` y después `guardar_datos_contacto`, que guarda.

#### Scenario: Con el rechazo el bot sigue informando y no guarda

- Dado un cliente que responde «no acepto»,
- Cuando la eval guionada continúa el flujo,
- Entonces el modelo registra el rechazo, responde que sin aceptar no puede tomar el pedido, sigue contestando dudas y no llama `guardar_datos_contacto`.

### Requirement: AGT28 — Con el asesor ya avisado, el bot no confirma pagos, apartados ni descuentos

Cuando `conversaciones` informa que el asesor ya fue avisado por cualquier motivo (CNV15), el contexto del turno MUST indicar
al modelo que
puede seguir informando (productos, precios, envíos y políticas) pero que MUST NOT confirmar pagos, apartados ni descuentos:
debe decir que el asesor lo confirma. Sin el aviso, esa instrucción MUST NOT aparecer. Esta regla es de conducta del
modelo, no una puerta de código: se comprueba con evals guionadas y con la corrida real (EVL3).

Fase que lo implementa: 12d

#### Scenario: El contexto agrega la instrucción cuando el asesor ya fue avisado

- Dado una conversación con la marca «asesor avisado»,
- Cuando se arma el contexto del turno,
- Entonces incluye que no debe confirmar pagos, apartados ni descuentos y que el asesor lo confirma.

#### Scenario: Sin aviso el contexto no incluye la instrucción

- Dado una conversación sin la marca «asesor avisado»,
- Cuando se arma el contexto del turno,
- Entonces no incluye esa instrucción.

#### Scenario: Un fallo al consultar la marca no rompe el contexto

- Dado que el puerto de CNV15 falla,
- Cuando se arma el contexto del turno,
- Entonces el contexto se arma sin la instrucción y el turno continúa.

#### Scenario: El cliente pide cerrar la compra y el bot dice que el asesor lo confirma

- Dado una conversación con el asesor avisado y un cliente que pide apartar el producto, en la eval guionada,
- Cuando el modelo responde,
- Entonces informa el producto y dice que el asesor confirma el apartado, sin afirmar que quedó apartado.
