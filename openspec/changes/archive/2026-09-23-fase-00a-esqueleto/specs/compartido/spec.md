# Compartido — Specification

## Purpose

Funciones puras, sin dependencias de infraestructura ni de NestJS, reutilizables desde cualquier
módulo: formato de dinero, normalización/enmascarado de números de teléfono y normalización de
texto y de nombres de lugar. Son la base de reglas invariantes posteriores (`R2` — el LLM nunca
calcula dinero, `R14` — redacción de teléfonos en logs) y se portan del prototipo (`src/lib/dinero.ts`,
`src/lib/numero.ts`, `src/lib/texto.ts`) conservando su comportamiento, con tests reescritos como
unitarios de `compartido/` (`openspec/config.yaml` §proposal, tabla "Qué se migra del prototipo").

## Requirements

### Requirement: CMP1 — Formato de dinero en pesos colombianos

El sistema MUST exponer funciones puras que formateen valores de dinero en pesos colombianos (COP)
como texto listo para mostrar al cliente, a partir de valores enteros de entrada; estas funciones
MUST NOT aceptar ni producir valores de dinero en punto flotante. Formatear un valor entero de COP
MUST producir un texto con símbolo de moneda y separador de miles, sin parte decimal (por ejemplo,
`389000` → `$389.000`). Formatear un rango de dos valores de COP MUST producir un texto que una
ambos extremos formateados con la forma "entre {mínimo} y {máximo}". Formatear un porcentaje de
recargo contraentrega MUST producir un texto que incluya el porcentaje y la frase explicativa del
recargo. Formatear un rango de días de entrega MUST producir un solo valor singular o plural cuando
el mínimo y el máximo coinciden, y un texto con la forma "entre {mínimo} y {máximo} días" cuando
difieren.

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

#### Scenario: Formatear un recargo contraentrega incluye el porcentaje y su explicación

- Dado un porcentaje de recargo, por ejemplo `3`,
- Cuando se formatea como texto de recargo contraentrega,
- Entonces el resultado incluye ese porcentaje seguido de la frase que explica que aplica al pago
  contra entrega.

#### Scenario: Formatear días de entrega con el mismo mínimo y máximo produce un solo valor

- Dado un rango de días de entrega donde el mínimo y el máximo son iguales, por ejemplo `1` y `1`,
- Cuando se formatea como texto de días,
- Entonces el resultado es un solo valor en singular (`1 día`), sin la forma "entre… y…".

#### Scenario: Formatear días de entrega con mínimo y máximo distintos produce un rango

- Dado un rango de días de entrega donde el mínimo y el máximo son distintos, por ejemplo `1` y `2`,
- Cuando se formatea como texto de días,
- Entonces el resultado es "entre {mínimo} y {máximo} días".

### Requirement: CMP2 — Normalización y enmascarado de números de teléfono

El sistema MUST exponer una función pura que normalice un número de teléfono eliminando cualquier
carácter que no sea un dígito (espacios, `+`, guiones, paréntesis), y una función pura que
enmascare un número de teléfono para uso en logs, dejando visibles únicamente sus últimos 4 dígitos
y ocultando el resto con un prefijo fijo. Enmascarar MUST NOT requerir que quien lo llama
normalice el número primero: la función de enmascarado MUST normalizar internamente antes de
recortar. Un número con 4 dígitos o menos MUST devolverse íntegro (con el mismo prefijo de
enmascarado), sin perder dígitos por el recorte.

Fase que lo implementa: 00a

#### Scenario: Normalizar un número deja solo dígitos

- Dado un número de teléfono con símbolos, por ejemplo `+57 300 111 2233`,
- Cuando se normaliza,
- Entonces el resultado contiene únicamente los dígitos, en el mismo orden, sin `+`, espacios ni
  otros símbolos.

#### Scenario: Enmascarar un número muestra solo los últimos 4 dígitos

- Dado un número de teléfono normalizado o con símbolos, por ejemplo `573001112233`,
- Cuando se enmascara,
- Entonces el resultado muestra únicamente los últimos 4 dígitos (`2233`) precedidos por el prefijo
  de enmascarado, sin el resto del número visible.

#### Scenario: Enmascarar un número corto conserva todos sus dígitos

- Dado un número de teléfono normalizado con 4 dígitos o menos, por ejemplo `1234`,
- Cuando se enmascara,
- Entonces el resultado conserva esos dígitos completos, precedidos por el mismo prefijo de
  enmascarado, sin perder ninguno.

### Requirement: CMP3 — Normalización de texto y de nombres de lugar

El sistema MUST exponer una función pura que normalice texto libre para comparación: pasarlo a
minúsculas, quitarle tildes/diacríticos y colapsar espacios repetidos en uno solo, recortando los
espacios al inicio y al final. MUST exponer además una función pura que, a partir de esa
normalización, elimine también cualquier carácter que no sea letra, número o espacio — pensada para
comparar nombres de lugar (ciudad, departamento) sin depender de la collation del motor de base de
datos. MUST exponer una función pura que extraiga, de un texto libre ya normalizado, las palabras
con al menos un número mínimo de letras (3 por defecto), descartando las más cortas.

Fase que lo implementa: 00a

#### Scenario: Normalizar texto quita tildes, mayúsculas y espacios repetidos

- Dado un texto con mayúsculas, tildes y espacios repetidos, por ejemplo `"  Lámpara   DE  Mesa "`,
- Cuando se normaliza,
- Entonces el resultado está en minúsculas, sin tildes y con los espacios colapsados y recortados
  (`"lampara de mesa"`).

#### Scenario: Normalizar un lugar además deja solo letras, números y espacios

- Dado un nombre de lugar con puntuación, por ejemplo `"Bogotá D.C."`,
- Cuando se normaliza como lugar,
- Entonces el resultado conserva solo letras, números y espacios, ya sin tildes ni mayúsculas
  (`"bogota dc"`), y produce el mismo resultado sin importar la puntuación o mayúsculas de entrada
  (`"BOGOTA, D.C"` normaliza igual que `"Bogotá D.C."`).

#### Scenario: Extraer palabras clave descarta las más cortas que el mínimo

- Dado un texto libre, por ejemplo `"Lámpara de mesa"`,
- Cuando se extraen sus palabras clave con el mínimo por defecto,
- Entonces el resultado son las palabras normalizadas de al menos 3 letras (`["lampara", "mesa"]`),
  y un texto compuesto solo de palabras más cortas que el mínimo (por ejemplo `"la de"`) produce una
  lista vacía.
