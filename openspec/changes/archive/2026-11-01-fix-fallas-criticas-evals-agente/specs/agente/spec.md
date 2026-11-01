# Delta for Agente

## Purpose

Dejar por escrito las guardas que hacen cumplir R1 y R2 en código y no solo en el prompt, el parser de
montos que las sostiene, y la excepción de EVL2 que esas guardas hacen necesaria.

## ADDED Requirements

### Requirement: AGT23 — Un monto sin rastro no llega al cliente: un reintento y luego traspaso

Cuando el texto final del modelo contiene un monto en pesos que no aparece en ningún resultado de
herramienta del mismo turno, el bucle MUST NOT entregarlo al cliente (**R1**, **R2**). MUST hacer un solo
reintento: añade el texto rechazado y un mensaje correctivo del sistema y vuelve a llamar al modelo, dentro
del mismo plazo del turno y del mismo techo de gasto. Si el texto del reintento también trae un monto sin
rastro, el turno MUST terminar en traspaso a una persona con el motivo interno `dinero-sin-rastro`, que
ante `conversaciones` y el aviso al asesor es un fallo del bot (`fallo-llm`) y sale con el texto de cortesía
`mensaje_error_llm`. Una cifra que el propio cliente escribió en los mensajes del turno en curso (con
moneda, según AGT24) MUST contar como rastro: el bot puede repetirla. El historial y lo que dijo el bot
MUST NOT contar como rastro. Cada bloqueo MUST registrar el evento `agente.dinero-sin-rastro` con la
cantidad de montos y si fue el reintento, y MUST NOT incluir el texto ni las cifras (**R14**).

Fase que lo implementa: `fix-fallas-criticas-evals-agente`

#### Scenario: Un monto sin rastro se reintenta y llega el texto corregido

- Dado un turno donde el modelo responde "El anillo cuesta $350.000." sin haber llamado ninguna herramienta,
- Y el reintento responde "Ese precio te lo confirma un asesor.",
- Cuando se genera la respuesta,
- Entonces el cliente recibe el texto del reintento, no hay traspaso y el log lleva `agente.dinero-sin-rastro`
  con `montos: 1` y sin el texto.

#### Scenario: Si el monto persiste tras el reintento, se traspasa

- Dado un modelo que responde "$350.000" y, tras el aviso correctivo, "Mejor dicho, $400.000.",
- Cuando se genera la respuesta,
- Entonces el turno termina en traspaso con el texto `mensaje_error_llm`, el motivo interno es
  `dinero-sin-rastro`, el motivo ante `conversaciones` es `fallo-llm` y el monto no llega al cliente.

#### Scenario: El reintento puede ganar rastro llamando una herramienta

- Dado un primer texto con un monto sin rastro,
- Cuando el reintento llama la herramienta que devuelve ese precio y cita su texto,
- Entonces el monto tiene rastro y la respuesta sale sin traspaso.

#### Scenario: La cifra que dijo el cliente cuenta como rastro

- Dado el mensaje del cliente "tengo $200.000 pesos" y una respuesta del bot que repite "$200.000",
- Cuando se audita el turno,
- Entonces no hay reintento ni traspaso.

### Requirement: AGT24 — El parser de montos exige moneda y compara el valor completo

La auditoría de dinero MUST reconocer como monto una cifra que lleve moneda: `$15.000`, `$15 mil`,
`COP 15000`, `15.000 pesos`, `15 mil pesos`, `1,5 millones de pesos`, `15.000 COP`. MUST normalizar cada
monto a su valor en pesos («mil» ×1.000, «millones» ×1.000.000; puntos o comas como separador de miles o
decimal) y compararlo por **valor completo**, no por dígitos sueltos, de modo que `$389.000`, `389000` y
`15 mil pesos` frente a `$15.000` coincidan sin depender del formato. Un número sin moneda (un año, un
teléfono, «2 días», «15 mil seguidores») MUST NOT considerarse dinero. Consecuencia conocida: una cifra del
cliente sin moneda («tengo 200 mil») no respalda un `$200.000` que diga el bot, y ese caso se reintenta.
La auditoría MUST devolver una cantidad, nunca el texto (**R14**).

Fase que lo implementa: `fix-fallas-criticas-evals-agente`

#### Scenario: Formatos distintos del mismo valor coinciden

- Dado un resultado de herramienta con `389000` y un texto del bot con "$389.000" o "389 mil pesos",
- Cuando se cuentan los montos sin rastro,
- Entonces el resultado es 0.

#### Scenario: Monedas distintas de `$` se auditan

- Dado un texto del bot con "COP 350000" o "350.000 pesos" y ninguna herramienta que lo respalde,
- Cuando se cuentan los montos sin rastro,
- Entonces el resultado es 1.

#### Scenario: Un número sin moneda no es dinero

- Dado un texto del bot con "llega en 2 días" o "tenemos 15 mil seguidores",
- Cuando se cuentan los montos sin rastro,
- Entonces el resultado es 0.

#### Scenario: Una cifra del cliente sin moneda no respalda un monto del bot

- Dado el mensaje del cliente "tengo 200 mil" y un texto del bot con "$200.000",
- Cuando se cuentan los montos sin rastro,
- Entonces el resultado es 1.

### Requirement: AGT25 — El mensaje de «sin cobertura» sale literal desde el backend

Cuando `cotizar_envio` devuelve que no hay cobertura, el texto final del turno MUST contener el
`mensaje_sin_cobertura` del negocio tal cual (**R2**, **R15**). Si el texto del modelo no lo contiene
(comparando sin diferencias de espacios), `ContenidoLlm` MUST añadirlo al final, separado por una línea en
blanco. Si ya lo contiene, MUST NOT duplicarlo.

Fase que lo implementa: `fix-fallas-criticas-evals-agente`

#### Scenario: El modelo parafrasea el mensaje y el backend lo añade

- Dado un destino sin cobertura y un texto del modelo que resume el mensaje con otras palabras,
- Cuando se arma la respuesta,
- Entonces el texto termina con el `mensaje_sin_cobertura` literal del negocio.

#### Scenario: El modelo ya lo citó literal

- Dado un texto del modelo que contiene el `mensaje_sin_cobertura` exacto,
- Cuando se arma la respuesta,
- Entonces el texto no cambia.

### Requirement: AGT26 — Regla no negociable de cita literal en el prompt

El archivo de `reglas` (versión `v3` del prompt) MUST indicar que los textos que devuelven las herramientas
(`precio_texto`, `rango_texto`, `dias_texto`, `mensaje_sin_cobertura`, `politica_contraentrega_texto` y el
`texto` de una política) se citan palabra por palabra, sin resumir ni cambiar cifras, palabras o signos, y que
el modelo puede añadir una frase propia antes o después de la cita, nunca dentro de ella. La regla es una
ayuda al modelo: AGT23 y AGT25 son quienes hacen cumplir R1 y R2 en código.

Fase que lo implementa: `fix-fallas-criticas-evals-agente`

#### Scenario: Las reglas llevan la instrucción de cita literal

- Dado el archivo `reglas` vigente,
- Cuando se arma el prompt de sistema,
- Entonces la parte de reglas contiene la instrucción de copiar palabra por palabra los textos de las
  herramientas y la versión del prompt es `v3`.

## MODIFIED Requirements

### Requirement: EVL2 — Aserciones deterministas sobre cada turno

Cada caso MUST poder declarar aserciones sobre el turno: herramientas que se esperan llamadas (y
prohibidas), que todo monto en pesos del texto final aparezca en un resultado de herramienta del mismo
turno (R1, R2), que ningún texto contenga un porcentaje de recargo (R2), que haya o no handoff, y que
un texto de política aparezca literal cuando se espera. Cada aserción MUST tener al menos un caso
negativo en el que un turno que la viola la hace fallar, **con una excepción**: la aserción de dinero con
rastro (`dineroConRastro`) no tiene caso negativo de evals, porque la guarda de AGT23 impide que un turno
con un monto sin rastro llegue al cliente y el agente completo no puede producir esa violación. Su
detección MUST quedar cubierta por pruebas unitarias de la aserción (`test/evals/soporte/aserciones.spec.ts`),
y el comportamiento del agente ante esa violación por los casos guionados `r1-monto-sin-rastro-corregido`
y `r1-monto-sin-rastro-persiste`.

(Previously: toda aserción exigía un caso negativo de evals, incluida la de dinero con rastro.)

Fase que lo implementa: 07c; `fix-fallas-criticas-evals-agente` (excepción de dinero)

#### Scenario: Un monto sin rastro en herramientas hace fallar la aserción

- Dado un turno guionado cuyo texto final dice "$350.000" sin que ninguna herramienta lo haya
  devuelto,
- Cuando se evalúa la aserción de dinero con rastro,
- Entonces la aserción falla y nombra el caso.

#### Scenario: La detección de dinero se prueba sin pasar por el agente

- Dado una grabación sintética con un monto sin rastro,
- Cuando `aserciones.spec.ts` evalúa `dineroConRastro`,
- Entonces la aserción falla con severidad crítica, aunque el agente completo no pueda producir ese turno.

#### Scenario: Un porcentaje de recargo hace fallar la aserción

- Dado un turno guionado cuyo texto final dice "5 % adicional por contra entrega",
- Cuando se evalúa la aserción de recargo sin porcentaje,
- Entonces la aserción falla.

#### Scenario: Un handoff no esperado hace fallar la aserción

- Dado un caso que declara "sin handoff" y un turno que termina en handoff,
- Cuando se evalúa,
- Entonces la aserción falla.

### Requirement: EVL4 — Modo real bajo demanda con perfil evals y costo visible

Las evals MUST poder correr contra el LLM real solo cuando se pide explícitamente (variable de modo) y
hay una clave de OpenRouter configurada, usando el perfil `evals` (LLM12). Sin clave, el modo real MUST
negarse con un mensaje claro, sin intentar llamar. Al terminar, MUST imprimir el costo estimado de la
corrida sumado desde `uso_llm` y el modelo que respondió cada caso. Un caso MAY declarar `soloGuionado: true`
(solo en casos sintéticos) cuando su premisa es un guion que un LLM real no puede reproducir; el modo real
MUST omitirlo, sin cambiar el umbral ni las aserciones, y el resumen MUST decir cuántos casos omitió y por
qué. Nunca corre en CI.

(Previously: el modo real ejecutaba todos los casos.)

Fase que lo implementa: 07c; `fix-fallas-criticas-evals-agente` (`soloGuionado`)

#### Scenario: El modo real sin clave se niega sin llamar

- Dado el modo real pedido y ninguna clave de OpenRouter configurada,
- Cuando se ejecuta `npm run evals`,
- Entonces el comando termina con un error que explica que falta la clave y no hace ninguna llamada.

#### Scenario: La corrida real imprime su costo

- Dado una corrida real terminada,
- Cuando se imprime el resumen,
- Entonces incluye el costo estimado en USD sumado desde `uso_llm` y el modelo de cada caso.

#### Scenario: Un caso soloGuionado se omite en la corrida real y el resumen lo dice

- Dado un conjunto con un caso `soloGuionado: true`,
- Cuando se ejecuta la corrida real,
- Entonces el caso no llama al modelo y el resumen incluye "Casos omitidos: N (solo guionado: …)" con su `id`.

#### Scenario: `soloGuionado` en un caso real-anonimizado se rechaza

- Dado un caso `real-anonimizado` con `soloGuionado: true`,
- Cuando se carga,
- Entonces el cargador falla nombrando el archivo y el campo.
