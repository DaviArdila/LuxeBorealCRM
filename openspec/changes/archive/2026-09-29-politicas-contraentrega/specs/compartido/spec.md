# Delta for compartido

## Purpose

`compartido/dinero` deja de formatear el recargo contra entrega: el cliente nunca oye el porcentaje
(decisión del negocio del 2026-09-29), así que la función y su escenario se retiran. El resto de CMP1
no cambia.

## MODIFIED Requirements

### Requirement: CMP1 — Formato de dinero en pesos colombianos

El sistema MUST exponer funciones puras que formateen valores de dinero en pesos colombianos (COP)
como texto listo para mostrar al cliente, a partir de valores enteros de entrada; estas funciones
MUST NOT aceptar ni producir valores de dinero en punto flotante. Formatear un valor entero de COP
MUST producir un texto con símbolo de moneda y separador de miles, sin parte decimal (por ejemplo,
`389000` → `$389.000`). Formatear un rango de dos valores de COP MUST producir un texto que una
ambos extremos formateados con la forma "entre {mínimo} y {máximo}". Formatear un rango de días de
entrega MUST producir un solo valor singular o plural cuando el mínimo y el máximo coinciden, y un
texto con la forma "entre {mínimo} y {máximo} días" cuando difieren.

(Previously: también exigía formatear un porcentaje de recargo contra entrega con su frase
explicativa; el recargo ya no se cita como porcentaje al cliente.)

Fase que lo implementa: 00a

#### Scenario: Formatear un valor entero de COP produce texto con símbolo y separador de miles

- Dado un valor entero de pesos colombianos, por ejemplo `389000`,
- Cuando se formatea como texto de dinero,
- Entonces el resultado incluye el símbolo de la moneda y el separador de miles propio de la
  convención colombiana, sin ninguna cifra decimal (`$389.000`).

#### Scenario: Formatear un rango de COP une ambos extremos formateados

- Dado un valor mínimo y un valor máximo de COP, por ejemplo `15000` y `25000`,
- Cuando se formatea como rango,
- Entonces el resultado es el texto "entre {mínimo formateado} y {máximo formateado}", con cada
  extremo en el mismo formato que un valor individual.

#### Scenario: Formatear días de entrega con el mismo mínimo y máximo produce un solo valor

- Dado un rango de días de entrega donde el mínimo y el máximo son iguales, por ejemplo `1` y `1`,
- Cuando se formatea como texto de días,
- Entonces el resultado es un solo valor en singular (`1 día`), sin la forma "entre… y…".

#### Scenario: Formatear días de entrega con mínimo y máximo distintos produce un rango

- Dado un rango de días de entrega donde el mínimo y el máximo son distintos, por ejemplo `1` y `2`,
- Cuando se formatea como texto de días,
- Entonces el resultado es "entre {mínimo} y {máximo} días".
