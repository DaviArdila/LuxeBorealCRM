# Delta for catalogo

## Purpose

El catálogo se administra desde el back office (Fase 13a, P79, P80, ADR-0015 enmendada): productos, categorías y fotos se
crean y editan por la API de admin, y la carga masiva es una alta única desde una plantilla `.xlsx` que solo crea. El
importador desde Google Sheets o CSV se retira. La lectura para el bot (CAT1-CAT14) no cambia: sigue leyendo de la base,
con la caché invalidada en cada escritura (CAT5). **R1/R2** siguen intactas: el precio vive en la base y el LLM nunca lo
calcula. **R14**: los logs de estas operaciones nombran ids y conteos, nunca textos de producto.

## Nota de implementación

Cada test MUST nombrarse `"<id> — <título del escenario>"` con el título exacto de abajo. El prefijo `CAT#` continúa
desde CAT14. Las rutas son relativas a `/api/v1`. Los errores siguen RFC 9457 (ADR-0011) con el `type` indicado.

## ADDED Requirements

### Requirement: CAT15 — Validación de un producto, compartida por la interfaz y la carga masiva

El dominio de `catalogo` MUST validar un producto con una sola función, usada por la creación, la edición y la carga
masiva: SKU con la forma `SKU-` seguida de letras, números o guiones (se guarda en mayúsculas); nombre de 1 a 24
caracteres; descripción corta de 1 a 72; descripción larga no vacía; precio entero en pesos mayor que 0; peso y medidas
opcionales, enteros mayores o iguales a 0; categoría opcional, que debe existir y estar activa. Cada error MUST nombrar el
campo y el motivo, sin repetir el valor de los textos.

Fase que lo implementa: 13a

#### Scenario: CAT15 — Un producto válido no produce errores

- Dado un producto con SKU `SKU-0101`, nombre, descripciones, precio 45000 y sin medidas,
- Cuando se valida,
- Entonces el resultado es válido y el SKU queda en mayúsculas.

#### Scenario: CAT15 — Cada campo inválido se informa con su motivo

- Dado un producto con SKU `abc`, nombre de 30 caracteres, precio 0 y peso `-5`,
- Cuando se valida,
- Entonces el resultado trae un error por `sku`, `nombre`, `precioCop` y `pesoGramos`, cada uno con su motivo.

#### Scenario: CAT15 — Una categoría inexistente o inactiva es un error

- Dado un producto cuya categoría no existe o está inactiva,
- Cuando se valida,
- Entonces el resultado trae un error en `categoriaId`.

### Requirement: CAT16 — Crear un producto

`POST /catalogo/productos` MUST crear un producto válido (CAT15) y responder `201` con el producto y su `actualizado`. Un
producto nuevo MUST quedar **inactivo**, porque todavía no tiene fotos (CAT20). Un SKU que ya existe, activo o no, MUST
responder `409 sku-duplicado` sin escribir. Un producto inválido MUST responder `422 producto-invalido` con los errores
por campo.

Fase que lo implementa: 13a

#### Scenario: CAT16 — Un producto válido se crea inactivo

- Dado un admin con sesión y un producto válido,
- Cuando lo crea,
- Entonces la respuesta es `201`, el producto existe con `activo = false` y sin fotos.

#### Scenario: CAT16 — Un SKU repetido no se crea

- Dado un producto ya creado con `SKU-0101`,
- Cuando se crea otro con `sku-0101`,
- Entonces la respuesta es `409 sku-duplicado` y la base no cambia.

#### Scenario: CAT16 — Un producto inválido responde 422 con los errores por campo

- Dado un producto sin nombre y con precio negativo,
- Cuando se crea,
- Entonces la respuesta es `422 producto-invalido` con un error en `nombre` y otro en `precioCop`.

### Requirement: CAT17 — Editar un producto con bloqueo optimista

`PATCH /catalogo/productos/{id}` MUST aplicar los campos enviados, validar el resultado completo (CAT15) y exigir el
`actualizado` que el cliente leyó. Si el producto cambió desde entonces MUST responder `409 producto-modificado` sin
escribir. El SKU MUST NOT editarse: un cuerpo con `sku` MUST responder `400`. Activar un producto sin fotos MUST
responder `409 producto-sin-fotos`. Desactivar MUST estar permitido siempre. Un producto MUST NOT borrarse: no existe
ruta de borrado.

Fase que lo implementa: 13a

#### Scenario: CAT17 — Editar el precio con la versión vigente guarda el cambio

- Dado un producto con su `actualizado` vigente,
- Cuando el admin cambia su precio enviando ese `actualizado`,
- Entonces la respuesta trae el precio nuevo y un `actualizado` posterior.

#### Scenario: CAT17 — Una versión vieja se rechaza sin pisar

- Dado que otro admin guardó el producto después de que el primero lo leyera,
- Cuando el primero guarda con su `actualizado` viejo,
- Entonces la respuesta es `409 producto-modificado` y el producto conserva lo que guardó el otro.

#### Scenario: CAT17 — El SKU no se edita

- Dado un producto existente,
- Cuando se envía un `PATCH` con `sku`,
- Entonces la respuesta es `400` y el SKU no cambia.

#### Scenario: CAT17 — Un producto sin fotos no se activa

- Dado un producto inactivo sin fotos,
- Cuando se pide `activo = true`,
- Entonces la respuesta es `409 producto-sin-fotos` y sigue inactivo.

#### Scenario: CAT17 — Un producto con fotos se activa y se desactiva

- Dado un producto inactivo con una foto,
- Cuando se activa y luego se desactiva,
- Entonces cada respuesta refleja el `activo` pedido.

### Requirement: CAT18 — Toda escritura del catálogo invalida la caché del bot

Cada operación que escribe productos, categorías o fotos MUST invalidar la caché del catálogo compacto (CAT5) después de
confirmar la escritura, de modo que el siguiente turno del bot lea el estado nuevo. Si la invalidación falla, la
escritura MUST quedar confirmada y el fallo MUST registrarse como `warn` sin contenido; el TTL de respaldo (CAT4) acota
el retraso.

Fase que lo implementa: 13a

#### Scenario: CAT18 — Un producto activado aparece en el catálogo compacto del siguiente turno

- Dado un catálogo compacto ya en caché sin el producto,
- Cuando el admin activa el producto,
- Entonces la siguiente lectura del catálogo compacto lo incluye.

#### Scenario: CAT18 — Un precio editado sale en la siguiente ficha

- Dado un producto activo cuya ficha ya se leyó,
- Cuando el admin cambia su precio,
- Entonces la siguiente ficha trae el precio nuevo ya formateado (CAT2).

#### Scenario: CAT18 — Si Redis falla al invalidar, la escritura queda guardada

- Dado que Redis no responde al invalidar,
- Cuando el admin guarda un producto,
- Entonces la respuesta es de éxito, el cambio está en la base y queda un `warn` sin textos del producto.

### Requirement: CAT19 — Categorías de producto

`/catalogo/categorias` MUST permitir listar (con su cantidad de productos), crear y renombrar (nombre de 1 a 40
caracteres, único sin distinguir mayúsculas: `409 categoria-duplicada`), ordenar (`PUT /catalogo/categorias/orden`),
desactivar y borrar. Borrar una categoría con productos MUST responder `409 categoria-con-productos`. Desactivar una
categoría MUST NOT desactivar sus productos.

Fase que lo implementa: 13a

#### Scenario: CAT19 — Crear y renombrar una categoría

- Dado un admin con sesión,
- Cuando crea «Gorras» y la renombra a «Gorras y sombreros»,
- Entonces la lista muestra el nombre nuevo.

#### Scenario: CAT19 — Un nombre repetido se rechaza

- Dado la categoría «Gorras»,
- Cuando se crea «gorras»,
- Entonces la respuesta es `409 categoria-duplicada`.

#### Scenario: CAT19 — Una categoría con productos no se borra

- Dado una categoría con un producto,
- Cuando se pide borrarla,
- Entonces la respuesta es `409 categoria-con-productos` y sigue existiendo.

#### Scenario: CAT19 — El orden nuevo se conserva

- Dado tres categorías,
- Cuando el admin envía el orden inverso,
- Entonces la lista vuelve en ese orden.

### Requirement: CAT20 — Subir una foto a un producto

`POST /catalogo/productos/{id}/fotos` (multipart, campo `archivo`, `angulo` opcional) MUST aceptar JPEG, PNG o WebP de
hasta 10 MB, comprobado por el contenido y no solo por la extensión; MUST redimensionarla y guardarla según MED6 y crear
su fila con el siguiente `orden`. La primera foto de un producto MUST quedar como portada. Un producto con 6 fotos MUST
responder `409 limite-fotos`; un archivo que no es una imagen admitida MUST responder `422 foto-invalida`. Si la fila no
se puede guardar, el objeto subido MUST borrarse.

Fase que lo implementa: 13a

#### Scenario: CAT20 — La primera foto queda como portada y redimensionada

- Dado un producto sin fotos y una imagen de 3000×2000,
- Cuando el admin la sube,
- Entonces la respuesta es `201`, la foto es portada y el archivo guardado mide 1600 px en su lado más largo.

#### Scenario: CAT20 — Un archivo que no es imagen se rechaza

- Dado un archivo de texto con extensión `.jpg`,
- Cuando se sube,
- Entonces la respuesta es `422 foto-invalida` y no se guarda nada.

#### Scenario: CAT20 — La séptima foto se rechaza

- Dado un producto con 6 fotos,
- Cuando se sube otra,
- Entonces la respuesta es `409 limite-fotos`.

#### Scenario: CAT20 — Un ángulo desconocido se rechaza

- Dado una subida con `angulo = trasero`,
- Cuando se procesa,
- Entonces la respuesta es `422 foto-invalida` y nombra los ángulos admitidos.

### Requirement: CAT21 — Ordenar, marcar y borrar fotos

`PATCH /catalogo/productos/{id}/fotos/{fotoId}` MUST cambiar el ángulo o marcar la portada (una sola portada por
producto); `PUT /catalogo/productos/{id}/fotos/orden` MUST guardar el orden enviado, que debe contener exactamente las
fotos del producto; `DELETE /catalogo/productos/{id}/fotos/{fotoId}` MUST borrar la fila y, después de confirmar, el
objeto del almacenamiento. Borrar la última foto de un producto activo MUST responder `409 producto-sin-fotos`. Si se
borra la portada, la siguiente en orden MUST pasar a ser portada.

Fase que lo implementa: 13a

#### Scenario: CAT21 — Marcar otra portada deja una sola

- Dado un producto con dos fotos y la primera como portada,
- Cuando se marca la segunda,
- Entonces solo la segunda es portada.

#### Scenario: CAT21 — Un orden que no coincide con las fotos se rechaza

- Dado un producto con tres fotos,
- Cuando se envía un orden con dos ids,
- Entonces la respuesta es `422` y el orden no cambia.

#### Scenario: CAT21 — Borrar la portada pasa la portada a la siguiente

- Dado un producto con tres fotos y la primera como portada,
- Cuando se borra la primera,
- Entonces la segunda es portada y el objeto borrado ya no está en el almacenamiento.

#### Scenario: CAT21 — La última foto de un producto activo no se borra

- Dado un producto activo con una sola foto,
- Cuando se pide borrarla,
- Entonces la respuesta es `409 producto-sin-fotos` y la foto sigue.

### Requirement: CAT22 — Plantilla de carga masiva

`GET /catalogo/carga-masiva/plantilla` MUST devolver un `.xlsx` con una hoja `productos` cuyas columnas son `sku`,
`nombre`, `descripcion_corta`, `descripcion_larga`, `precio_cop`, `categoria`, `peso_gramos`, `largo_mm`, `ancho_mm` y
`alto_mm`, una fila de ejemplo y una hoja `instrucciones` que explica cada columna. La plantilla MUST NOT traer
productos de la base.

Fase que lo implementa: 13a

#### Scenario: CAT22 — La plantilla trae las columnas y las instrucciones

- Dado un admin con sesión,
- Cuando descarga la plantilla,
- Entonces recibe un `.xlsx` con la hoja `productos` con esas columnas en ese orden y la hoja `instrucciones`.

### Requirement: CAT23 — Vista previa de la carga masiva

`POST /catalogo/carga-masiva/vista-previa` (multipart, campo `archivo`) MUST leer la hoja `productos`, validar cada fila
con CAT15 y responder cuántos productos se crearían y la lista de errores con fila, columna y motivo, **sin escribir
nada**. MUST ser error de su fila: un SKU que ya existe en la base, un SKU repetido dentro del archivo y una categoría
que no existe (por nombre, sin distinguir mayúsculas). Un archivo que no es `.xlsx`, sin la hoja `productos`, de más de
2 MB o de más de 500 filas MUST responder `422 plantilla-invalida`. Las filas totalmente vacías MUST ignorarse.

Fase que lo implementa: 13a

#### Scenario: CAT23 — Una plantilla válida informa cuántos se crearían sin escribir

- Dado una plantilla con 20 filas válidas,
- Cuando el admin pide la vista previa,
- Entonces la respuesta dice 20 a crear, ningún error, y la base no cambia.

#### Scenario: CAT23 — Un SKU que ya existe es error de su fila

- Dado `SKU-0101` en la base y una plantilla que lo trae en la fila 3,
- Cuando se pide la vista previa,
- Entonces la respuesta trae un error en la fila 3, columna `sku`, que dice que ya existe.

#### Scenario: CAT23 — Un SKU repetido en el archivo es error de la segunda aparición

- Dado una plantilla con `SKU-0200` en las filas 2 y 7,
- Cuando se pide la vista previa,
- Entonces el error está en la fila 7 y cita la fila 2.

#### Scenario: CAT23 — Una categoría desconocida es error de su fila

- Dado una fila con la categoría «Zapatos» que no existe,
- Cuando se pide la vista previa,
- Entonces esa fila trae un error en `categoria`.

#### Scenario: CAT23 — Un archivo que no es una plantilla se rechaza entero

- Dado un `.csv`, un `.xlsx` sin la hoja `productos` o uno de 501 filas,
- Cuando se pide la vista previa,
- Entonces la respuesta es `422 plantilla-invalida` con el motivo.

### Requirement: CAT24 — Aplicar la carga masiva: solo crea, todo o nada

`POST /catalogo/carga-masiva` MUST repetir la validación de CAT23 sobre el archivo enviado y, si no hay ningún error,
crear todos los productos en una sola transacción, **inactivos** (no traen fotos), y responder cuántos creó. Si hay
cualquier error MUST responder `422 carga-con-errores` con la misma lista de la vista previa y no crear ninguno. La carga
MUST NOT modificar, desactivar ni borrar ningún producto existente, ni tocar tarifas, cobertura, parámetros ni
horario. Solo una carga MUST correr a la vez: una segunda simultánea MUST responder `409 carga-en-curso`.

Fase que lo implementa: 13a

#### Scenario: CAT24 — Una plantilla sin errores crea todos los productos inactivos

- Dado una plantilla con 20 filas válidas,
- Cuando el admin la aplica,
- Entonces la respuesta dice 20 creados y los 20 existen con `activo = false`.

#### Scenario: CAT24 — Un solo error no crea ninguno

- Dado una plantilla con 19 filas válidas y una con precio vacío,
- Cuando el admin la aplica,
- Entonces la respuesta es `422 carga-con-errores` con el error de esa fila y no se crea ningún producto.

#### Scenario: CAT24 — Los productos existentes no se tocan

- Dado un producto activo que no está en la plantilla,
- Cuando se aplica una plantilla válida,
- Entonces ese producto sigue activo y sin cambios.

#### Scenario: CAT24 — Una segunda carga simultánea se rechaza

- Dado una carga en curso,
- Cuando otro admin aplica otra plantilla,
- Entonces la respuesta es `409 carga-en-curso`.

### Requirement: CAT25 — Permisos del catálogo

Las rutas de lectura (`GET` de productos y categorías) MUST admitir los roles `admin` y `asesor`. Toda ruta que escribe,
sube fotos o hace la carga masiva MUST admitir solo `admin`: un `asesor` MUST recibir `403` y sin sesión `401` (ADR-0021).

Fase que lo implementa: 13a

#### Scenario: CAT25 — Un asesor lee el catálogo

- Dado un usuario `asesor` con sesión,
- Cuando lista los productos,
- Entonces la respuesta es `200`.

#### Scenario: CAT25 — Un asesor no edita

- Dado un usuario `asesor` con sesión,
- Cuando intenta crear un producto, subir una foto o aplicar una carga,
- Entonces cada respuesta es `403` y la base no cambia.

### Requirement: CAT26 — Listado y búsqueda del catálogo para el back office

`GET /catalogo/productos` MUST listar productos activos e inactivos con precio, categoría, cantidad de fotos, portada y
`actualizado`, paginados (`pagina`, `tamano` de 1 a 100, 25 por defecto), ordenados por nombre y desempatados por id,
con filtros opcionales `buscar` (nombre o SKU, sin distinguir mayúsculas ni tildes), `categoriaId` y `activo`.
`GET /catalogo/productos/{id}` MUST devolver el producto con sus fotos en orden y la URL de cada una. Un id inexistente
MUST responder `404 producto-no-encontrado`.

Fase que lo implementa: 13a

#### Scenario: CAT26 — Buscar por parte del nombre sin tildes

- Dado los productos «Gorra Boreal» y «Bolso Aurora»,
- Cuando se busca `boréal`,
- Entonces la lista trae solo «Gorra Boreal».

#### Scenario: CAT26 — Filtrar inactivos

- Dado productos activos e inactivos,
- Cuando se lista con `activo = false`,
- Entonces solo vienen los inactivos.

#### Scenario: CAT26 — La página respeta el tamaño pedido

- Dado 30 productos,
- Cuando se pide la página 2 con tamaño 25,
- Entonces vienen 5 productos y el total es 30.

## REMOVED Requirements

Se retiran al archivar este change (P79): el importador desde Google Sheets o CSV deja de existir.

| Requisito | Motivo | Reemplazado por |
|---|---|---|
| IMP1 — Lectura de las pestañas del catálogo desde Sheets o desde un directorio local | Se retiran Sheets y el comando | CAT23 (lectura de la plantilla) |
| IMP2 — Detección de hoja no compartida o pestaña inexistente | Sin Sheets | CAT23 (`plantilla-invalida`) |
| IMP3 — Validación de los campos obligatorios de un producto | La validación pasa a una función compartida | CAT15 |
| IMP4 — Validación de las fotos de un producto activo | Las fotos se suben en la pantalla | CAT17 (`producto-sin-fotos`), CAT20, CAT21 |
| IMP5 — Peso y medidas del producto son opcionales pero deben ser enteros cuando se informan | Igual que IMP3 | CAT15 |
| IMP6 — Validación de las franjas de peso y del rango de una tarifa | Las tarifas tendrán su pantalla | Fase 15 |
| IMP7 — Serialización de un parámetro a jsonb según su clave, y advertencia para clave desconocida | Los parámetros se editan en Configuración | CFG1-CFG6 |
| IMP8 — Fecha de excepción de horario parseable | El horario se edita en Configuración | CFG2 |
| IMP9 — Resolución de departamento y ciudad a código DANE en cobertura y tarifas | Las tarifas tendrán su pantalla | Fase 15 |
| IMP10 — Cualquier fila inválida o foto no descargable deja la base exactamente como estaba | Sin importador | CAT24 (todo o nada) |
| IMP11 — Escritura todo-o-nada del catálogo dentro de una sola transacción | Sin importador; la carga masiva solo crea | CAT24 |
| IMP12 — Invalidación de CACHE_CATALOGO al finalizar una importación exitosa | Sin importador | CAT18 |
| IMP13 — Comando CLI catalogo:importar con --sheet-id, --dir y --solo-validar | Se retira el comando | CAT22-CAT24 |
| IMP14 — El importador lee el ángulo de cada foto | El ángulo se marca en la pantalla | CAT20, CAT21 |
| IMP15 — El collage del importador es opcional y está apagado por defecto | Se retira el collage | — |
