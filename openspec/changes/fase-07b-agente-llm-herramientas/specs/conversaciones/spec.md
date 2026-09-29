# Delta for Conversaciones

## ADDED Requirements

### Requirement: CNV10 — Los pasos de imagen salen por el punto único de salida

Un paso de respuesta de tipo imagen (clave de objeto y leyenda opcional) MUST salir por el mismo
punto único de salida que el texto (R5), en el orden en que el generador lo devolvió, con el mismo
estado requerido `bot` y la misma relectura por paso (CNV9). Si el canal del turno no admite imagen
(capacidades, CNV7), el paso de imagen MUST omitirse sin enviar nada en su lugar.

Fase que lo implementa: 07b

#### Scenario: Un texto seguido de un collage sale como dos mensajes en orden

- Dado una respuesta con un paso de texto y un paso de imagen,
- Cuando se envía por el punto único de salida,
- Entonces se encola primero el mensaje de texto y después el de imagen, ambos con estado requerido
  `bot`.

#### Scenario: Un canal que no admite imagen omite el paso de imagen

- Dado un turno cuyo canal no admite imagen y una respuesta con texto e imagen,
- Cuando se envía,
- Entonces solo se encola el mensaje de texto.
