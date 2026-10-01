# Delta for Catálogo

## MODIFIED Requirements

### Requirement: CAT4 — La caché de catálogo compacto sirve la misma copia mientras la versión no cambia

El sistema MUST mantener una caché del catálogo compacto (texto id + nombre + descripción corta,
sin precios y **sin SKU**, AGT16) detrás de un puerto propio del módulo `catalogo`, implementada como
*provider* inyectable de NestJS — nunca un `let` de módulo abierto al importarse (corrige A1) ni una
dependencia directa del módulo de colas (corrige A3). Mientras la clave de versión no cambie, una
lectura MUST devolver la misma copia sin reflejar escrituras hechas fuera de la operación de
invalidación de esta fase.

(Previously: el texto compacto era «sku + nombre + descripción corta».)

Fase que lo implementa: 02; 08b (id en lugar de SKU)

#### Scenario: Una escritura directa en producto sin pasar por la invalidación no se refleja de inmediato

- Dado un catálogo compacto ya leído una vez (una copia en caché con la versión actual),
- Cuando se guarda un producto nuevo directamente en la base de datos, sin llamar a la operación de
  invalidación,
- Entonces la siguiente lectura del catálogo compacto sigue devolviendo la copia anterior, sin el
  producto nuevo.

#### Scenario: El catálogo compacto no lleva precios y solo lista productos activos ordenados por nombre

- Dado un catálogo con productos activos e inactivos, con nombres en distinto orden alfabético,
- Cuando se obtiene el catálogo compacto,
- Entonces el texto devuelto lista solo los productos activos, ordenados por nombre, y no contiene
  ningún valor de dinero.

#### Scenario: Cada línea del catálogo compacto lleva el id del producto y no su SKU

- Dado un catálogo con productos activos que tienen id y SKU,
- Cuando se obtiene el catálogo compacto,
- Entonces cada línea empieza con el id del producto y ninguna contiene su SKU.

### Requirement: CAT14 — Fotos de un producto listas para enviar

El sistema MUST exponer un caso de uso que, dado el id o SKU de un producto activo y, opcionalmente, un
ángulo, devuelva la clave de objeto de la foto pedida: la **portada** si no se pide ángulo, o la foto de
ese ángulo si existe. El resultado MUST incluir los ángulos disponibles del producto (los de sus fotos
que tienen ángulo) y el pie de foto (AGT17). Si el producto no existe o está inactivo, MUST rechazarse
como en CAT3. Solo devuelve claves de objeto (MED1), nunca rutas ni URLs.

(Previously: devolvía la clave del collage y las claves de todas las fotos hasta un máximo.)

Fase que lo implementa: 07b; 08b (portada, ángulo y ángulos disponibles)

#### Scenario: Sin ángulo devuelve la portada

- Dado un producto activo con tres fotos, una de ellas portada,
- Cuando se piden sus fotos sin ángulo,
- Entonces el resultado trae la clave de la portada y los ángulos disponibles.

#### Scenario: Con ángulo devuelve la foto de ese ángulo

- Dado un producto activo con fotos de ángulo `frente` y `detalle`,
- Cuando se piden sus fotos con ángulo `detalle`,
- Entonces el resultado trae solo la clave de la foto de detalle.

#### Scenario: Un ángulo que no existe devuelve vacío

- Dado un producto activo sin foto de ángulo `uso`,
- Cuando se piden sus fotos con ángulo `uso`,
- Entonces el resultado no trae ninguna clave.

#### Scenario: Las fotos de un producto inactivo se rechazan

- Dado un producto inactivo con fotos,
- Cuando se piden sus fotos,
- Entonces el sistema devuelve un rechazo y ninguna clave.

## ADDED Requirements

### Requirement: IMP14 — El importador lee el ángulo de cada foto

El importador MUST aceptar una columna opcional `fotos_angulos` con los ángulos separados por `;` en el
mismo orden que la columna `fotos`, y MUST guardar cada ángulo en `foto.angulo`. Los valores válidos
son `frente`, `lateral_izquierdo`, `lateral_derecho`, `detalle` y `uso`; un valor vacío deja la foto sin
ángulo. MUST rechazar la fila si hay un valor fuera de la lista o si hay más ángulos que fotos (IMP10:
todo-o-nada). Sin la columna, las fotos quedan sin ángulo y la importación se comporta como antes.

Fase que lo implementa: 08b

#### Scenario: Los ángulos se guardan en el orden de las fotos

- Dado un producto con dos fotos y `fotos_angulos` igual a `frente;lateral_izquierdo`,
- Cuando se importa el catálogo,
- Entonces la primera foto queda con ángulo `frente` y la segunda con `lateral_izquierdo`.

#### Scenario: Sin la columna las fotos quedan sin ángulo

- Dado un producto con dos fotos y sin la columna `fotos_angulos`,
- Cuando se importa el catálogo,
- Entonces ambas fotos quedan sin ángulo y la importación termina bien.

#### Scenario: Un ángulo fuera de la lista rechaza la importación

- Dado un producto con `fotos_angulos` igual a `diagonal`,
- Cuando se valida el catálogo,
- Entonces la validación falla con la fila y la columna, y la base queda como estaba.

#### Scenario: Más ángulos que fotos rechaza la importación

- Dado un producto con una foto y `fotos_angulos` igual a `frente;detalle`,
- Cuando se valida el catálogo,
- Entonces la validación falla con la fila y la columna, y la base queda como estaba.

### Requirement: IMP15 — El collage del importador es opcional y está apagado por defecto

El importador MUST generar el collage de un producto únicamente cuando `CATALOGO_GENERAR_COLLAGE` es
`true`. Con el valor por defecto (`false`), MUST NOT generar collage y MUST dejar `clave_collage` en nulo;
las fotos individuales se procesan igual (MED5, MED6).

Fase que lo implementa: 08b

#### Scenario: Por defecto la importación no genera collage

- Dado `CATALOGO_GENERAR_COLLAGE` sin definir y un producto con tres fotos,
- Cuando se importa el catálogo,
- Entonces el producto queda con sus tres fotos y sin clave de collage.

#### Scenario: Con la variable activa la importación genera el collage

- Dado `CATALOGO_GENERAR_COLLAGE` igual a `true` y un producto con tres fotos,
- Cuando se importa el catálogo,
- Entonces el producto queda con sus tres fotos y con clave de collage.
