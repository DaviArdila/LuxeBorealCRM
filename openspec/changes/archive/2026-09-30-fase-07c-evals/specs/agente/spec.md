# Delta for Agente

Cubre además, con casos de evals de título exacto, los escenarios que dependen de lo que dice el
modelo: R1 «Todo dato citado se rastrea a una llamada de herramienta», «El cliente pregunta por una
política del negocio», «Una política que no existe no se inventa»; R2 «El cliente pregunta el precio de
un producto», «Cotización de envío con cobertura», «El recargo contra entrega se dice sin porcentaje»,
«Destino sin cobertura»; R12 «Ubicación entrante»; y R13 «Fotos agrupadas en collage por defecto»
(`conversaciones`).

## ADDED Requirements

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
