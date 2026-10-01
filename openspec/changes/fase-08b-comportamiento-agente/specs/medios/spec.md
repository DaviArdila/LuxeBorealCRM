# Delta for Medios

## MODIFIED Requirements

### Requirement: MED8 — Generación de collage en una grilla según la cantidad de fotos

El sistema MUST generar un collage a partir de **2 a 6** fotos de un producto con una grilla que se ajusta a
la cantidad, sin casillas vacías: 2 fotos en 2×1, 3 o 4 fotos en 2×2 (con 3 fotos, la tercera ocupa toda la
fila inferior) y 5 o 6 fotos en 2×3 (con 5 fotos, la quinta ocupa toda la fila inferior), con cada tile
recortado para llenar el espacio (*cover*), y MUST guardar el resultado como JPEG con calidad 85. Con
**una sola foto** MUST NOT generar collage: la foto individual ya es lo que se envía.

(Previously: grilla fija 2×2 para 1 a 4 fotos, que dejaba casillas en blanco con 1, 2 o 3 fotos.)

#### Scenario: Una sola foto no genera collage

- Dado un producto con 1 foto,
- Cuando se pide su collage,
- Entonces no se genera ningún collage.

#### Scenario: Dos fotos generan un collage 2×1 sin casillas vacías

- Dado un producto con 2 fotos,
- Cuando se genera su collage,
- Entonces el collage mide 800×400 píxeles y ambas fotos lo llenan por completo.

#### Scenario: Tres fotos generan un collage sin casilla en blanco

- Dado un producto con 3 fotos,
- Cuando se genera su collage,
- Entonces el collage mide 800×800 píxeles y no queda ninguna zona en blanco.

#### Scenario: Cuatro fotos generan un collage en grilla 2×2

- Dado un producto con 4 fotos,
- Cuando se genera su collage,
- Entonces el collage tiene 2 columnas por 2 filas, con cada tile de 400×400 píxeles.

#### Scenario: Seis fotos generan un collage en grilla 2×3

- Dado un producto con 6 fotos,
- Cuando se genera su collage,
- Entonces el collage tiene 2 columnas por 3 filas, con cada tile de 400×400 píxeles.

#### Scenario: Cinco fotos generan un collage sin casilla en blanco

- Dado un producto con 5 fotos,
- Cuando se genera su collage,
- Entonces el collage mide 800×1200 píxeles y no queda ninguna zona en blanco.
