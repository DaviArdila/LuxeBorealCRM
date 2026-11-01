# Design: Fase 13a — Catálogo en el back office

## Resumen

`catalogo` gana un lado de escritura con su API de admin; `medios` sigue siendo el único que habla con el
almacenamiento; el cliente gana el área `catalogo`. El importador, la descarga desde Drive y el collage se borran. No hay
cambios de esquema: las tablas `producto`, `categoria_producto` y `foto` ya tienen todo lo necesario.

```
 Cliente Angular (área catalogo)
        │  cliente HTTP generado (ADR-0022)
        ▼
 interfaz/  productos.controller · categorias.controller · fotos.controller · carga-masiva.controller
        │  guardias de sesión, CSRF y roles (ADR-0021)
        ▼
 aplicacion/  CrearProducto · EditarProducto · GestionarCategorias · SubirFoto · GestionarFotos
              PrevisualizarCarga · AplicarCarga · ListarCatalogoAdmin
        │                                   │
        ▼                                   ▼
 dominio/  validar-producto (CAT15)   puertos/  RepositorioCatalogoAdmin · LectorPlantilla · CerrojoCarga
                                            │
 infraestructura/  repositorio-catalogo-admin-prisma · lector-plantilla-xlsx · cerrojo-carga-redis
        │                                   │
        ▼                                   ▼
   PostgreSQL                         medios: ALMACENAMIENTO (MinIO)  ·  CACHE_CATALOGO (Redis)
```

## Módulos tocados y dependencias

| Módulo | Cambio | Importa (solo lo exportado) |
|---|---|---|
| `catalogo` | Escritura, API de admin, carga masiva; se borra el importador | `medios` (`ALMACENAMIENTO`), `usuarios` (`Roles`, `UsuarioActual`, `DocumentarRutaDeAdmin`), `plataforma/{prisma,redis,reloj,config,errores}` |
| `medios` | Se borran `descarga-drive` y `collage`; se exporta `redimensionarFoto` (MED6) | `plataforma/config` |
| `agente`, `conversaciones` | Sin cambios: siguen leyendo con `ObtenerCatalogoCompacto`, `ObtenerFichaProducto`, `ObtenerFotosProducto` | — |
| `plataforma/config` | Se borran `CATALOGO_SHEET_ID` y `CATALOGO_GENERAR_COLLAGE` | — |
| `cliente` | Área `catalogo` con tres pantallas | API generada |

## Decisiones

### D1 — La escritura vive en `catalogo`, separada de la lectura del bot

Los casos de uso nuevos usan un puerto propio, `RepositorioCatalogoAdmin` (token `REPOSITORIO_CATALOGO_ADMIN`), y no tocan
`RepositorioProducto`, que sirve al bot. Así la ficha, la búsqueda y la caché (CAT1-CAT14) no cambian y no pueden
romperse por la escritura. Alternativa descartada: un módulo `catalogo-admin` aparte, que obligaría a exportar el
modelo interno de `catalogo` para validar e invalidar la caché.

### D2 — Una sola validación de producto (CAT15)

`dominio/validar-producto.ts` es una función pura que recibe los campos ya tipados y la lista de categorías activas, y
devuelve `{ valido, valor } | { valido: false, errores: [{ campo, problema }] }`, igual que `validarCaso` del asistente.
La carga masiva convierte cada fila (`precio_cop` acepta `89.000`, `$ 89000`, como hoy en `aEnteroCop`) y llama a la
misma función; el número de fila lo pone quien la llama. Las reglas salen del `validarProductos` actual (nombre ≤ 24,
descripción corta ≤ 72, SKU `SKU-…`), que se borra con el importador.

### D3 — Bloqueo optimista con `actualizado`

`producto.actualizado` no tiene `@updatedAt`: la escribe el caso de uso con el `Clock` (PLT2). Editar hace
`updateMany({ where: { id, actualizado: leido } })` en una transacción; `count = 0` con el producto existente es
`409 producto-modificado`. Es el mismo patrón que los casos del asistente (P61). Las fotos y las categorías no lo
usan: sus operaciones son puntuales y se validan contra el estado actual.

### D4 — Librería para `.xlsx`: `read-excel-file` y `write-excel-file`

| Opción | A favor | En contra |
|---|---|---|
| **`read-excel-file` + `write-excel-file`** (elegida) | Mantenidas (9.3.14 publicada el 2026-10-29), MIT, sin binarios nativos; `npm audit`: 0 avisos (verificado el 2026-11-01) | Dos dependencias; formato de celdas básico, suficiente para una plantilla |
| `exceljs` | Lee y escribe con estilos | Sin publicar desde 2024-12; 9 avisos moderados abiertos (`archiver`, `uuid`, `glob`…) cuyo arreglo exige bajar de mayor |
| `xlsx` (SheetJS) | La más conocida | La versión de npm (0.18.5) está congelada con avisos abiertos; las nuevas solo se publican en su CDN, fuera de `npm audit` |

Se agregan con `npx -y npm@11 install read-excel-file write-excel-file` (CLAUDE.md, «Trabajo en la nube») y deben dejar
`npm run auditoria` limpia. Viven en un solo archivo cada una, `infraestructura/lector-plantilla-xlsx.ts` y
`infraestructura/escritor-plantilla-xlsx.ts`, detrás de los puertos `LectorPlantilla` y `EscritorPlantilla`; una regla
nueva de `dependency-cruiser` lo impone. El lector rechaza un archivo de más de 2 MB o 500 filas antes de recorrerlo
(Q2), lee el valor calculado de las fórmulas y trata cada celda como texto.

### D5 — Subida de archivos con `FileInterceptor` en memoria

Las rutas de subida usan `FileInterceptor('archivo', { limits: { fileSize, files: 1 } })` de `@nestjs/platform-express`
(multer en memoria; ya es dependencia). El tamaño se corta en el interceptor (10 MB fotos, 2 MB plantilla; `413` con
`archivo-muy-grande`). El tipo se comprueba por contenido: para fotos, `sharp(buffer).metadata()` debe dar `jpeg`, `png` o
`webp`; para la plantilla, la firma ZIP y la hoja `productos`. El contrato documenta `multipart/form-data` con
`format: binary` para que el cliente generado envíe `FormData`. Las rutas siguen bajo la guardia CSRF (encabezado propio,
ADR-0021).

### D6 — Fotos: objeto primero, fila después; borrar fila primero, objeto después

Clave de objeto `productos/<productoId>/<fotoId>.jpg` (id UUID v7 generado antes de subir). Subir: redimensionar (MED6) →
`almacenamiento.guardar` → transacción que valida el límite de 6 y crea la fila (portada si es la primera). Si la
transacción falla, se borra el objeto (best effort, `warn`). Borrar: transacción que valida `producto-sin-fotos`, borra la
fila y pasa la portada a la siguiente; después se borra el objeto; si falla, queda huérfano con un `warn` (no rompe nada:
ninguna fila lo referencia). `redimensionarFoto` sale de `procesar-fotos.ts` a `medios/aplicacion/redimensionar-foto.ts`.

### D7 — Carga masiva: validar dos veces, escribir una, de a una a la vez

La vista previa y la aplicación comparten `ValidarCarga` (lee la plantilla, resuelve categorías por nombre normalizado,
consulta los SKU existentes en una sola consulta y valida cada fila con D2). Aplicar vuelve a validar el archivo recibido
(no confía en una vista previa anterior) y, sin errores, hace `createMany` en una transacción con `activo = false`. Un
cerrojo en Redis (`catalogo:carga-masiva`, `SET NX PX 120000`, liberado en `finally`) impide dos cargas a la vez
(`409 carga-en-curso`). Un SKU que otro admin crea entre la validación y la escritura hace fallar la transacción por el
único de `sku`; se responde `409 sku-duplicado` y no se crea ninguno.

### D8 — Invalidación de la caché después de confirmar

Cada caso de uso que escribe llama a `CACHE_CATALOGO.invalidar()` después de la transacción. Si Redis falla, se registra
`catalogo.cache-no-invalidada` (`warn`, solo el id de la operación) y se responde éxito: la base ya cambió y el TTL de
respaldo de 5 minutos (CAT4) acota el retraso (CAT18).

### D9 — Qué se borra

| Archivo o pieza | Motivo |
|---|---|
| `catalogo/aplicacion/importar-catalogo.ts`, `procesar-fotos.ts`, `resolver-geografia-importacion.ts` y sus tests | Importador |
| `catalogo/dominio/validar-catalogo.ts` (lo de producto pasa a `validar-producto.ts`) | Importador |
| `catalogo/puertos/fuente-catalogo.ts`, `repositorio-importacion.ts` | Importador |
| `catalogo/infraestructura/fuente-catalogo-sheets.ts`, `fuente-catalogo-directorio.ts`, `descarga-drive.ts`, `csv.ts`, `repositorio-importacion-prisma.ts` y sus tests | Importador |
| `medios/aplicacion/collage.ts` | Collage (IMP15, MED8, MED9) |
| `scripts/importar-catalogo.ts` y su test, la entrada de `scripts/cli.ts` y `npm run catalogo:importar` | Comando |
| `test/integracion/catalogo/importar-catalogo-cli.spec.ts`, `fuente-catalogo-directorio.spec.ts`, `test/fixtures/catalogo/` | Tests del importador |
| `CATALOGO_SHEET_ID`, `CATALOGO_GENERAR_COLLAGE` en `esquema.ts` y `.env.example` | Configuración del importador |

`servicio/datos-desarrollo/catalogo/` pasa a tener `productos-ejemplo.xlsx` (generado por un test de ida y vuelta del
escritor de la plantilla, no a mano) y conserva sus fotos con `ATRIBUCIONES.md` para subirlas desde la pantalla.

## Endpoints

Todos bajo `/api/v1`, con cookie de sesión y encabezado CSRF en las mutaciones. Errores RFC 9457.

| Método y ruta | Rol | Cuerpo | Respuesta | Errores |
|---|---|---|---|---|
| `GET /catalogo/productos` | admin, asesor | query `buscar`, `categoriaId`, `activo`, `pagina`, `tamano` | `200 { productos[], total }` | `400` |
| `GET /catalogo/productos/{id}` | admin, asesor | — | `200` producto con `fotos[]` (`id`, `orden`, `esPortada`, `angulo`, `url`) | `404 producto-no-encontrado` |
| `POST /catalogo/productos` | admin | `sku`, `nombre`, `descripcionCorta`, `descripcionLarga`, `precioCop`, `categoriaId?`, `pesoGramos?`, `largoMm?`, `anchoMm?`, `altoMm?` | `201` producto | `409 sku-duplicado`, `422 producto-invalido` |
| `PATCH /catalogo/productos/{id}` | admin | campos editables + `activo?` + `actualizado` | `200` producto | `400` (campo no editable), `404`, `409 producto-modificado`, `409 producto-sin-fotos`, `422 producto-invalido` |
| `GET /catalogo/categorias` | admin, asesor | — | `200 [{ id, nombre, orden, activo, productos }]` | — |
| `POST /catalogo/categorias` | admin | `nombre` | `201` | `409 categoria-duplicada`, `422` |
| `PATCH /catalogo/categorias/{id}` | admin | `nombre?`, `activo?` | `200` | `404`, `409 categoria-duplicada`, `422` |
| `PUT /catalogo/categorias/orden` | admin | `ids[]` | `200` lista | `422` (no coincide) |
| `DELETE /catalogo/categorias/{id}` | admin | — | `204` | `404`, `409 categoria-con-productos` |
| `POST /catalogo/productos/{id}/fotos` | admin | multipart `archivo`, `angulo?` | `201` foto | `404`, `409 limite-fotos`, `413 archivo-muy-grande`, `422 foto-invalida` |
| `PATCH /catalogo/productos/{id}/fotos/{fotoId}` | admin | `angulo?` (o `null`), `esPortada?` (`true`) | `200` fotos | `404`, `422 foto-invalida` |
| `PUT /catalogo/productos/{id}/fotos/orden` | admin | `ids[]` | `200` fotos | `404`, `422` |
| `DELETE /catalogo/productos/{id}/fotos/{fotoId}` | admin | — | `204` | `404`, `409 producto-sin-fotos` |
| `GET /catalogo/carga-masiva/plantilla` | admin | — | `200` `.xlsx` (`Content-Disposition: attachment`) | — |
| `POST /catalogo/carga-masiva/vista-previa` | admin | multipart `archivo` | `200 { aCrear, errores[{ fila, columna, motivo }] }` | `413`, `422 plantilla-invalida` |
| `POST /catalogo/carga-masiva` | admin | multipart `archivo` | `201 { creados }` | `409 carga-en-curso`, `409 sku-duplicado`, `413`, `422 plantilla-invalida`, `422 carga-con-errores` |

## Configuración nueva

Ninguna variable de entorno nueva: los límites (6 fotos, 10 MB, 2 MB, 500 filas, 120 s del cerrojo) son constantes de
código de resiliencia, no datos del negocio (R15 no aplica; mismo criterio que los topes del índice de casos). Se
borran `CATALOGO_SHEET_ID` y `CATALOGO_GENERAR_COLLAGE`.

## Eventos de dominio

Ninguno: la invalidación de la caché es una llamada directa al puerto, como hoy en `configuracion` (CFG5).

## Cliente

- Área `catalogo` (`cliente/src/app/areas/catalogo/`), icono `inventory_2`, roles `admin` y `asesor`; «Carga masiva» solo
  `admin`. Rutas `/catalogo/productos`, `/catalogo/categorias`, `/catalogo/carga-masiva`.
- La ventana de edición reutiliza `DialogoEdicionComponent` (SHL8); la lista, `RejillaComponent`; las confirmaciones,
  `ConfirmacionComponent`. La galería de fotos es un componente nuevo de la propia área.
- El precio se muestra con `Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })`;
  el cliente nunca calcula nada con él.
- Los controles de escritura se ocultan por rol en el cliente y el servidor los rechaza igual (CAT25).

## Pruebas

| Nivel | Qué cubre |
|---|---|
| Unit | `validar-producto`, conversión de filas, `ValidarCarga` con fakes, reglas de portada y orden |
| Integración (Postgres, Redis y MinIO reales) | Repositorio admin, bloqueo optimista, transacción de la carga, cerrojo, subida y borrado de fotos contra MinIO, lector y escritor `.xlsx` (ida y vuelta) |
| e2e (Supertest) | Rutas, roles, CSRF, multipart y errores RFC 9457; un producto creado y activado por la API aparece en el catálogo compacto del bot (CAT18) |
| Cliente (Vitest + jsdom) | SHL13-SHL16 con el cliente HTTP falso |

## ADR

No hace falta uno nuevo: ADR-0015 (enmendada) cubre la carga masiva y D4 elige una librería entre opciones
equivalentes.
