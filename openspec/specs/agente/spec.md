# Agente — Specification

## Purpose

El agente LLM atiende al cliente por WhatsApp (vía Chatwoot): consulta el catálogo, cotiza envíos,
manda fotos y califica el interés de compra. Solo puede tocar el mundo real a través de las 6
herramientas tipadas que se le exponen; nunca hace cálculos de dinero ni accede a la base
directamente. Este dominio cubre esas dos garantías y el manejo de mensajes que no son texto.

## Requirements

### Requirement: R1 — El LLM solo accede a datos por las herramientas definidas

El sistema MUST restringir el acceso a datos del LLM exclusivamente a las 6 herramientas definidas
(`buscar_producto`, `obtener_ficha`, `cotizar_envio`, `enviar_fotos`, `marcar_lead_caliente`,
`guardar_datos_contacto`). El LLM MUST NOT ejecutar consultas libres contra la base de datos ni
ningún otro origen de datos.

Fase que lo implementa: 07

#### Scenario: El LLM necesita datos de un producto

- Dado que el LLM necesita datos de un producto para responder,
- Cuando genera su respuesta,
- Entonces solo puede obtenerlos llamando a una de las 6 herramientas definidas.

#### Scenario: Todo dato citado se rastrea a una llamada de herramienta

- Dado que una respuesta del bot menciona un precio, un costo de envío o un recargo,
- Cuando se audita el turno,
- Entonces ese dato debe poder rastrearse a una llamada a herramienta en el mismo turno.
- Y si no hubo llamada, se considera que no hay dato real en la respuesta.

### Requirement: R2 — El LLM nunca calcula dinero

El sistema MUST devolver precios, costos de envío y recargos ya formateados y listos para citar
desde el backend; el LLM SHALL únicamente copiarlos, nunca calcularlos. El costo de envío MUST
citarse siempre como un rango aproximado (el precio real lo confirma la transportadora al
despachar) y el recargo contraentrega MUST citarse como un porcentaje que paga el cliente. Hay
cobertura de envío salvo en la lista de zonas excluidas (`MODELO_DATOS.md` §4).

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

#### Scenario: Destino sin cobertura

- Dado que el destino del cliente está en la lista de zonas sin cobertura,
- Cuando se cotiza el envío,
- Entonces `cotizar_envio` devuelve `cobertura: false` y el bot no ofrece ningún rango de precio.

### Requirement: R12 — Mensajes entrantes no textuales

El sistema MUST manejar los mensajes entrantes que no son texto según su tipo: un audio SHALL pedir
texto al cliente; un segundo audio consecutivo del mismo contacto MUST derivar la conversación a
humano; una imagen SHALL pedir que el cliente la describa en texto, sin procesarla; una ubicación
MUST alimentar la cotización de envío entrando al flujo normal; cualquier otro tipo (sticker,
tarjeta de contacto, etc.) MUST ignorarse sin consumir turno ni tokens.

Fase que lo implementa: 07

#### Scenario: Primer audio del cliente

- Dado que el cliente envía un mensaje de audio,
- Cuando llega el mensaje,
- Entonces el bot pide texto con una excusa amable, sin llamar al LLM.

#### Scenario: Segundo audio consecutivo

- Dado que el cliente ya envió un audio antes en la misma conversación y envía un segundo audio,
- Cuando llega el segundo audio,
- Entonces la conversación deriva a humano.

#### Scenario: Imagen entrante

- Dado que el cliente envía una imagen,
- Cuando llega el mensaje,
- Entonces el bot pide que la describa en texto o mencione el SKU, sin procesar la imagen.

#### Scenario: Ubicación entrante

- Dado que el cliente envía su ubicación,
- Cuando llega el mensaje,
- Entonces se usa para poblar ciudad/departamento del contacto y entra al flujo normal de
  cotización de envío.

#### Scenario: Tipo no manejado

- Dado que el cliente envía un sticker u otro tipo no manejado,
- Cuando llega el mensaje,
- Entonces se ignora silenciosamente, sin consumir turno ni tokens.
