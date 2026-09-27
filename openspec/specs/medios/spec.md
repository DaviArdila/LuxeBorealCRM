# Medios Specification

## Purpose

Este es un dominio de capacidad nuevo (no existe `openspec/specs/medios/spec.md` previo). Define el
contrato observable del puerto `Almacenamiento` (**ADR-0012**: MinIO self-hosted, API S3-compatible,
guardar/obtenerUrl/eliminar siempre sobre una **clave de objeto**, nunca una ruta de filesystem — corrige
A14 del prototipo, que guardaba las fotos en disco local) y de la generación de collage a partir de las
fotos de un producto. Se separa de `catalogo` porque es una capacidad más genérica — cualquier módulo
futuro con archivos la reutiliza — mismo criterio que separó `horario` de `catalogo` en la Fase 02.

El importador de catálogo (spec `catalogo`, requisitos `IMP#` de esta misma fase) es el primer y único
consumidor de este dominio por ahora: descarga las fotos desde Google Drive, las guarda a través del
puerto `Almacenamiento`, y genera el collage de cada producto antes de que el importador escriba
`producto.clave_collage` y `foto.clave_archivo` en su transacción. Todo el contenido de esta sección se
escribe como `## ADDED Requirements` porque no hay comportamiento previo del dominio `medios`;
`sdd-archive` lo promueve a `openspec/specs/medios/spec.md`.

Fuera de esta spec (ver proposal, Out of Scope): el backend de almacenamiento en producción (Dokploy,
Fase 09 — ADR-0012 decide el backend, no su despliegue), la generación de imágenes placeholder sintéticas
(Q4, pospuesta), y la compensación/outbox si la base de datos falla después de que las fotos ya se
subieron a MinIO (riesgo heredado y aceptado del prototipo, ver Risks de proposal.md).

## Nota de implementación

El título exacto de cada escenario **es** el criterio de aceptación, no un detalle de estilo. Cada test
de esta fase MUST nombrarse `"<id del requisito> — <título del escenario>"`, usando el título exacto de
los encabezados `#### Scenario:` de abajo, sin parafrasear.

## ADDED Requirements

### Requirement: MED1 — El puerto Almacenamiento opera sobre claves de objeto, nunca sobre rutas de filesystem

El sistema MUST exponer un puerto `Almacenamiento` con las operaciones `guardar` (sube un archivo bajo
una clave de objeto), `obtenerUrl` (devuelve la URL para acceder a una clave ya guardada) y `eliminar`
(borra el objeto de una clave). Ninguna de las tres operaciones MUST aceptar ni devolver una ruta de
filesystem: `foto.clave_archivo` y `producto.clave_collage` MUST ser claves de objeto (ADR-0012),
válidas sin importar en qué máquina corrió el importador.

#### Scenario: Guardar un archivo lo asocia a una clave de objeto, no a una ruta de disco

- Dado un archivo de imagen y una clave de objeto,
- Cuando se guarda ese archivo con el puerto `Almacenamiento`,
- Entonces la operación queda asociada a esa clave de objeto, y ningún resultado expone una ruta de
  filesystem de la máquina donde corrió la importación.

#### Scenario: Obtener la URL de una clave guardada devuelve una URL utilizable

- Dado un archivo ya guardado bajo una clave de objeto,
- Cuando se pide su URL con el puerto `Almacenamiento`,
- Entonces el resultado es una URL desde la que se puede obtener ese archivo.

#### Scenario: Eliminar una clave borra el objeto correspondiente

- Dado un archivo guardado bajo una clave de objeto,
- Cuando se elimina esa clave con el puerto `Almacenamiento`,
- Entonces una consulta posterior de su URL ya no encuentra ese objeto.

### Requirement: MED2 — Conversión de enlaces de Google Drive a URL de descarga directa

El sistema MUST convertir un enlace de Google Drive de archivo (formatos `/file/d/ID/`, `open?id=`,
`uc?id=`, o `.../d/ID` de `drive.google.com` o `docs.google.com`) a la URL de descarga directa
`https://drive.google.com/uc?export=download&id=<ID>`. Un enlace que no es de Google Drive MUST
devolverse sin cambios.

#### Scenario: Un enlace de archivo de Drive en cualquiera de sus formatos se convierte a descarga directa

- Dados los enlaces `https://drive.google.com/file/d/ID/view?usp=sharing`,
  `https://drive.google.com/open?id=ID` y `https://drive.google.com/uc?id=ID&export=view`,
- Cuando se convierte cada uno a su URL de descarga,
- Entonces los tres producen `https://drive.google.com/uc?export=download&id=ID`.

#### Scenario: Un enlace que no es de Google Drive se conserva tal cual

- Dado el enlace `https://cdn.tienda.com/fotos/lampara.jpg`,
- Cuando se convierte a su URL de descarga,
- Entonces el resultado es exactamente el mismo enlace, sin ningún cambio.

### Requirement: MED3 — Detección de enlace de carpeta de Google Drive

El sistema MUST detectar cuando un enlace es el de una carpeta de Google Drive (`drive.google.com/drive/
.../folders/...`) y MUST rechazarlo antes de intentar descargarlo, con un error que explique que se
necesita el enlace de cada foto individual, no el de la carpeta.

#### Scenario: Un enlace de carpeta de Drive se rechaza antes de intentar descargar

- Dado el enlace `https://drive.google.com/drive/u/0/folders/abc123`,
- Cuando se intenta descargar ese enlace como una foto,
- Entonces el sistema lo rechaza con un error que indica que es el enlace de una carpeta, sin llegar a
  hacer ninguna petición de descarga.

### Requirement: MED4 — Detección de archivo no compartido por magic bytes, no solo por content-type

El sistema MUST validar que la respuesta de una descarga de foto es realmente una imagen JPEG, PNG o
WEBP inspeccionando los primeros bytes del cuerpo de la respuesta (*magic bytes*), no solo la cabecera
`content-type`. Cuando la respuesta es HTML (Drive devuelve una página de "acceso denegado" o de
confirmación cuando el archivo no está compartido por enlace), o cuando los primeros bytes no
corresponden a ninguno de esos tres formatos aunque el `content-type` diga que es una imagen, el sistema
MUST rechazar la descarga con un error que sugiera revisar que el archivo esté compartido como "cualquiera
con el enlace: lector".

#### Scenario: Una respuesta HTML se rechaza aunque no lo diga el content-type

- Dado un enlace de una foto de Drive que no está compartida por enlace, cuya respuesta es una página
  HTML de "acceso denegado",
- Cuando se descarga esa foto,
- Entonces el sistema rechaza la descarga con un error que sugiere revisar el permiso de compartir del
  archivo.

#### Scenario: Unos bytes que no son de JPEG, PNG ni WEBP se rechazan aunque el content-type diga imagen

- Dada una respuesta cuyo `content-type` es `image/jpeg` pero cuyos primeros bytes no corresponden a la
  firma de JPEG, PNG ni WEBP,
- Cuando se descarga esa foto,
- Entonces el sistema rechaza la descarga, sin confiar únicamente en el `content-type` declarado.

#### Scenario: Una imagen válida se acepta por sus magic bytes aunque el content-type sea genérico

- Dada una respuesta cuyo `content-type` es `application/octet-stream` pero cuyos primeros bytes son la
  firma válida de un JPEG,
- Cuando se descarga esa foto,
- Entonces el sistema la acepta como una imagen válida.

### Requirement: MED5 — Idempotencia de descarga: solo se redescarga si cambió el origen o falta el archivo

Al procesar las fotos de un producto, el sistema MUST redescargar una foto únicamente cuando su
`origen_url` en esta importación es distinto al `origen_url` guardado en la importación anterior para
esa misma posición, o cuando el archivo de esa posición ya no existe en el almacenamiento. Cuando ninguna
de las dos condiciones se cumple, el sistema MUST NOT volver a descargar ni a subir esa foto.

#### Scenario: Una foto cuyo enlace no cambió y cuyo archivo existe no se vuelve a descargar

- Dado un producto cuya foto en la posición 1 tiene el mismo `origen_url` que en la importación anterior,
  y cuyo archivo ya existe en el almacenamiento,
- Cuando se procesan las fotos de ese producto,
- Entonces esa foto no se vuelve a descargar ni a subir al almacenamiento.

#### Scenario: Una foto cuyo enlace cambió respecto a la importación anterior se redescarga

- Dado un producto cuya foto en la posición 1 tiene un `origen_url` distinto al de la importación
  anterior,
- Cuando se procesan las fotos de ese producto,
- Entonces esa foto se descarga de nuevo y se sube al almacenamiento con la nueva versión.

#### Scenario: Una foto cuyo archivo ya no existe se redescarga aunque el enlace no haya cambiado

- Dado un producto cuya foto en la posición 1 tiene el mismo `origen_url` que en la importación anterior,
  pero cuyo archivo ya no existe en el almacenamiento,
- Cuando se procesan las fotos de ese producto,
- Entonces esa foto se descarga de nuevo, sin importar que el enlace de origen no haya cambiado.

### Requirement: MED6 — Redimensionamiento de las fotos originales a un límite de tamaño y formato

El sistema MUST redimensionar cada foto descargada para que su lado más largo no supere 1600 píxeles
(sin agrandar una foto más pequeña), respetando su orientación original, y MUST guardarla como JPEG con
calidad 80, antes de subirla al almacenamiento.

#### Scenario: Una foto más grande que el límite se reduce a 1600 píxeles de lado más largo

- Dada una foto original de 3000×2000 píxeles,
- Cuando se procesa esa foto para importar,
- Entonces la foto guardada en el almacenamiento tiene 1600 píxeles en su lado más largo, en formato
  JPEG, sin haberse agrandado.

#### Scenario: Una foto más pequeña que el límite no se agranda

- Dada una foto original de 800×600 píxeles,
- Cuando se procesa esa foto para importar,
- Entonces la foto guardada en el almacenamiento conserva sus 800×600 píxeles, sin agrandarse.

### Requirement: MED7 — Borrado de fotos sobrantes de importaciones previas

Cuando un producto tiene menos fotos en la importación actual que en una importación anterior, el
sistema MUST eliminar del almacenamiento los archivos de las posiciones que ya no están en la hoja
actual, para ese producto.

#### Scenario: Un producto con menos fotos que antes borra las posiciones sobrantes del almacenamiento

- Dado un producto que en la importación anterior tenía 3 fotos guardadas, y cuya fila en la hoja actual
  trae solo 2 enlaces de foto,
- Cuando se procesan las fotos de ese producto,
- Entonces el archivo de la tercera posición queda eliminado del almacenamiento después de importar.

### Requirement: MED8 — Generación de collage en una grilla según la cantidad de fotos

El sistema MUST generar un collage a partir de las fotos de un producto en una grilla de 2×2 (hasta 4
fotos) o 2×3 (5 o 6 fotos), con cada tile de 400×400 píxeles recortado para llenar el espacio (*cover*),
y MUST guardar el resultado como JPEG con calidad 85.

#### Scenario: De 1 a 4 fotos generan un collage en grilla 2×2

- Dado un producto con 4 fotos,
- Cuando se genera su collage,
- Entonces el collage resultante tiene una grilla de 2 columnas por 2 filas, con cada tile de 400×400
  píxeles.

#### Scenario: 5 o 6 fotos generan un collage en grilla 2×3

- Dado un producto con 6 fotos,
- Cuando se genera su collage,
- Entonces el collage resultante tiene una grilla de 2 columnas por 3 filas, con cada tile de 400×400
  píxeles.

### Requirement: MED9 — El collage solo se regenera si hubo fotos nuevas o cambió el hash de enlaces de origen

El sistema MUST calcular un hash de los enlaces de origen de las fotos de un producto (`fotos_hash`) y
MUST regenerar su collage únicamente cuando al menos una foto se descargó de nuevo en esta importación
(MED5), o cuando ese hash cambió respecto al guardado en la importación anterior, o cuando el collage
guardado no existe. Cuando ninguna de esas condiciones se cumple, el sistema MUST NOT regenerar el
collage.

#### Scenario: Reimportar sin ningún cambio de fotos no regenera el collage

- Dado un producto cuyos enlaces de foto son idénticos a los de la importación anterior, con todos los
  archivos ya existentes en el almacenamiento y un collage ya guardado,
- Cuando se procesan las fotos de ese producto,
- Entonces el collage no se regenera.

#### Scenario: Cambiar el enlace de una sola foto regenera el collage aunque las demás no cambien

- Dado un producto con 4 fotos, de las cuales solo la de la posición 2 tiene un `origen_url` distinto al
  de la importación anterior,
- Cuando se procesan las fotos de ese producto,
- Entonces el collage se regenera, aunque las otras tres fotos no hayan cambiado.

#### Scenario: Redescargar una foto por archivo faltante regenera el collage aunque el hash no haya cambiado

- Dado un producto cuyos enlaces de foto son idénticos a los de la importación anterior (mismo hash),
  pero cuyo archivo de la posición 1 ya no existe en el almacenamiento,
- Cuando se procesan las fotos de ese producto,
- Entonces esa foto se redescarga y el collage se regenera, aunque el hash de enlaces no haya cambiado.
