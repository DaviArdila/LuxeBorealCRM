# Delta for agente

## Purpose

Actualiza el texto de R1 y R2 para reflejar dos decisiones del negocio del 2026-09-29: las políticas
del negocio se consultan por una séptima herramienta (`consultar_politica`) y el recargo contra entrega
se le dice al cliente sin porcentaje. **La implementación sigue siendo de la Fase 07**; este delta solo
deja la spec al día antes de que esa fase empiece.

## MODIFIED Requirements

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
