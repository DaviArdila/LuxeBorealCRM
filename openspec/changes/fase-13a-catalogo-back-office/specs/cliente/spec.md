# Delta for cliente

## Purpose

El cliente gana el área **Catálogo** (P80): «Productos», «Categorías» y «Carga masiva». La ven `admin` y `asesor`; solo
el `admin` ve los controles que escriben. Usa la ventana emergente de SHL8 para editar y el cliente HTTP generado
(ADR-0022): ninguna llamada se escribe a mano.

## Nota de implementación

El prefijo `SHL#` continúa desde SHL12. Los tests de componentes se nombran `"<id> — <título del escenario>"`.

## ADDED Requirements

### Requirement: SHL13 — Pantalla «Productos»

El área `catalogo` MUST tener la pantalla «Productos» con la lista paginada de CAT26 (nombre, SKU, categoría, precio
formateado en pesos, fotos y estado), un buscador y filtros por categoría y estado. Para `admin` MUST ofrecer «Nuevo
producto» y «Editar», que abren la ventana de SHL8 con los campos de CAT15 (el SKU solo editable al crear), y
«Activar»/«Desactivar». Un `422` MUST mostrar el motivo junto a cada campo y conservar lo escrito; un
`409 producto-modificado` MUST avisar que otra persona lo cambió y ofrecer recargar; un `409 producto-sin-fotos` MUST
explicar que primero hay que subir una foto. Un `asesor` MUST ver la lista sin ningún control de escritura.

Fase que lo implementa: 13a

#### Scenario: SHL13 — El admin crea un producto

- Dado la pantalla «Productos» de un admin,
- Cuando abre «Nuevo producto», llena los campos y guarda,
- Entonces el cliente llama a `crearProducto` y la lista muestra el producto inactivo.

#### Scenario: SHL13 — Un campo inválido muestra su motivo

- Dado un `422 producto-invalido` con un error en `precioCop`,
- Cuando el admin guarda,
- Entonces la ventana muestra el motivo junto al precio y conserva lo escrito.

#### Scenario: SHL13 — Una edición ajena avisa y ofrece recargar

- Dado un `409 producto-modificado`,
- Cuando el admin guarda,
- Entonces la ventana avisa que otra persona lo cambió y ofrece recargar el producto.

#### Scenario: SHL13 — El SKU no se edita en un producto existente

- Dado la ventana de edición de un producto existente,
- Cuando se abre,
- Entonces el SKU se muestra sin poder cambiarse.

#### Scenario: SHL13 — Buscar filtra la lista

- Dado la lista de productos,
- Cuando se escribe en el buscador,
- Entonces el cliente pide la lista con `buscar` y muestra el resultado.

#### Scenario: SHL13 — Un asesor ve la lista sin controles de escritura

- Dado un usuario `asesor`,
- Cuando abre «Productos»,
- Entonces ve la lista y no aparecen «Nuevo producto», «Editar», «Activar» ni «Desactivar».

### Requirement: SHL14 — Fotos del producto

La ventana de un producto MUST mostrar sus fotos en orden con su portada y su ángulo y, para `admin`, permitir subir una
o varias a la vez (arrastrando o eligiendo archivos), cambiar el orden, marcar la portada, elegir el ángulo y borrar con
confirmación. Cada subida MUST mostrar su progreso y su error (`foto-invalida`, `limite-fotos`) sin detener las demás.

Fase que lo implementa: 13a

#### Scenario: SHL14 — Subir varias fotos a la vez

- Dado un producto sin fotos,
- Cuando el admin suelta tres imágenes,
- Entonces el cliente las sube una por una y la galería muestra las tres con la primera como portada.

#### Scenario: SHL14 — Una foto rechazada no detiene las demás

- Dado tres archivos, uno de ellos no es imagen,
- Cuando el admin los sube,
- Entonces dos quedan en la galería y el tercero muestra su error.

#### Scenario: SHL14 — Cambiar la portada y el orden

- Dado un producto con tres fotos,
- Cuando el admin marca otra portada y mueve una foto,
- Entonces el cliente llama a las rutas de CAT21 y la galería refleja el cambio.

#### Scenario: SHL14 — Borrar pide confirmación

- Dado una foto,
- Cuando el admin la borra,
- Entonces aparece una confirmación y solo al aceptar se llama a la ruta de borrado.

### Requirement: SHL15 — Pantalla «Categorías»

La pantalla «Categorías» MUST listar las categorías en su orden con su cantidad de productos y, para `admin`, permitir
crear, renombrar en la ventana de SHL8, reordenar, desactivar y borrar con confirmación. Un `409 categoria-con-productos`
MUST explicar que primero hay que mover sus productos.

Fase que lo implementa: 13a

#### Scenario: SHL15 — Crear y reordenar categorías

- Dado la pantalla «Categorías» de un admin,
- Cuando crea una categoría y la sube al primer lugar,
- Entonces el cliente llama a crear y a ordenar y la lista la muestra primero.

#### Scenario: SHL15 — Una categoría con productos no se borra

- Dado un `409 categoria-con-productos`,
- Cuando el admin la borra,
- Entonces la pantalla explica que primero hay que mover sus productos.

### Requirement: SHL16 — Pantalla «Carga masiva»

La pantalla «Carga masiva», solo para `admin`, MUST permitir descargar la plantilla (CAT22), elegir un archivo, ver la
vista previa (CAT23) con cuántos productos se crearían y una tabla de errores con fila, columna y motivo, y «Aplicar»
solo cuando la vista previa no tiene errores. Tras aplicar MUST mostrar cuántos se crearon, recordar que quedan
inactivos hasta tener fotos y enlazar a «Productos» filtrado por inactivos.

Fase que lo implementa: 13a

#### Scenario: SHL16 — Una vista previa con errores no deja aplicar

- Dado una plantilla con un error en la fila 12,
- Cuando el admin pide la vista previa,
- Entonces ve el error de la fila 12 y «Aplicar» está desactivado.

#### Scenario: SHL16 — Aplicar una plantilla limpia

- Dado una vista previa con 20 a crear y ningún error,
- Cuando el admin aplica,
- Entonces ve «20 productos creados», el aviso de que quedan inactivos y el enlace a los inactivos.

#### Scenario: SHL16 — Un asesor no ve la carga masiva

- Dado un usuario `asesor`,
- Cuando el shell arma el menú,
- Entonces el grupo «Catálogo» no muestra «Carga masiva» y navegar a su ruta lo lleva a `/`.
