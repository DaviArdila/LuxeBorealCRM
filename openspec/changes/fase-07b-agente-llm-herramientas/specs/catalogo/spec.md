# Delta for Catálogo

## ADDED Requirements

### Requirement: CAT13 — Búsqueda de productos activos por palabras clave, sin precio

El sistema MUST exponer un caso de uso de búsqueda que, dado un texto, devuelva como máximo 5
productos activos cuyo nombre o descripción corta contengan alguna de sus palabras clave, ordenados
por número de palabras que coinciden (más coincidencias primero), sin distinguir tildes ni mayúsculas
(`normalizarTexto`, `palabrasClave` de `compartido/texto`). El resultado MUST NOT incluir precio ni
ningún valor en pesos (CAT1) y MUST reutilizar el listado cacheado de activos (CAT4), sin consultar la
base por cada búsqueda.

Fase que lo implementa: 07b (herramienta `buscar_producto`)

#### Scenario: Una coincidencia exacta devuelve un solo resultado

- Dado un catálogo con una sola lámpara activa,
- Cuando se busca "lámpara",
- Entonces el resultado tiene un solo producto, sin precio.

#### Scenario: La búsqueda ignora tildes y mayúsculas

- Dado un producto activo llamado "Lámpara de mesa",
- Cuando se busca "LAMPARA",
- Entonces el producto aparece en el resultado.

#### Scenario: Los productos con más palabras en común van primero

- Dado un producto "Lámpara de mesa roble" y otro "Mesa de centro",
- Cuando se busca "lámpara mesa",
- Entonces "Lámpara de mesa roble" aparece antes que "Mesa de centro".

#### Scenario: La búsqueda devuelve como máximo cinco productos y nunca inactivos

- Dado siete productos activos y uno inactivo que coinciden con el texto,
- Cuando se busca,
- Entonces el resultado tiene exactamente cinco productos y ninguno es el inactivo.

#### Scenario: Una búsqueda sin coincidencias devuelve una lista vacía

- Dado un catálogo sin productos que coincidan,
- Cuando se busca "zapatos",
- Entonces el resultado es una lista vacía.

### Requirement: CAT14 — Fotos de un producto listas para enviar

El sistema MUST exponer un caso de uso que, dado el id o SKU de un producto activo, devuelva la clave
de objeto de su collage (si existe) y las claves de sus fotos individuales en orden (portada primero,
luego por `orden`), hasta un máximo pedido por quien llama. Si el producto no existe o está inactivo,
MUST rechazarse como en CAT3. Solo devuelve claves de objeto (MED1), nunca rutas ni URLs.

Fase que lo implementa: 07b (herramienta `enviar_fotos`)

#### Scenario: Un producto con fotos devuelve su collage y las fotos en orden

- Dado un producto activo con collage y tres fotos, una de ellas portada,
- Cuando se piden sus fotos con un máximo de 4,
- Entonces el resultado trae la clave del collage y las tres claves, con la portada primero.

#### Scenario: El máximo pedido limita las fotos individuales

- Dado un producto activo con cinco fotos,
- Cuando se piden sus fotos con un máximo de 2,
- Entonces el resultado trae exactamente dos claves de fotos individuales.

#### Scenario: Las fotos de un producto inactivo se rechazan

- Dado un producto inactivo con fotos,
- Cuando se piden sus fotos,
- Entonces el sistema devuelve un rechazo y ninguna clave.
