# Delta for Agente

## MODIFIED Requirements

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

### Requirement: AGT13 — Prompt de sistema versionado con prefijo estable

El prompt de sistema MUST armarse desde archivos versionados en `agente/prompts/` en este orden: reglas
no negociables (incluida la regla de cuándo citar una política), estilo, catálogo compacto sin precios, y al
final las instrucciones variables del turno (contexto inicial, horario). `reglas` MUST contener solo lo
que no se negocia (R1, R2, R14, uso de herramientas, envíos y pagos); `estilo` MUST contener la identidad,
el tono, la longitud, el formato y los emojis, de modo que pueda cambiarse sin tocar las reglas. El
prefijo (reglas + estilo + catálogo) MUST ser idéntico entre turnos de conversaciones distintas mientras
no cambie el catálogo, para aprovechar la caché de prompts (ADR-0002). La versión del prompt MUST quedar
en un log estructurado del turno (sin contenido).

(Previously: un único archivo de reglas con el estilo mezclado.)

Fase que lo implementa: 07b; 08b (separación de `estilo`)

#### Scenario: Dos conversaciones distintas comparten el mismo prefijo

- Dado dos turnos de conversaciones distintas con el mismo catálogo,
- Cuando se arma el prompt de cada uno,
- Entonces ambos empiezan con exactamente el mismo texto hasta el final del catálogo compacto.

#### Scenario: El prompt no contiene precios

- Dado un catálogo con productos que tienen precio,
- Cuando se arma el prompt de sistema,
- Entonces el texto no contiene ningún valor en pesos.

#### Scenario: El estilo va entre las reglas y el catálogo

- Dado los archivos `reglas` y `estilo` del prompt,
- Cuando se arma el prompt de sistema,
- Entonces el texto contiene primero las reglas, luego el estilo y después el catálogo.

#### Scenario: Cambiar el estilo no cambia las reglas

- Dado dos versiones del archivo `estilo` con el mismo archivo `reglas`,
- Cuando se arma el prompt con cada una,
- Entonces la parte de reglas es idéntica en ambos textos.

## ADDED Requirements

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
