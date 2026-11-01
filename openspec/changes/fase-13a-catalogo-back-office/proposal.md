# Proposal: Fase 13a — Catálogo en el back office

- Change: `fase-13a-catalogo-back-office` · Fase de la hoja de ruta: **13a** · Rama: `fase-13a-catalogo-back-office`
- Fecha: 2026-11-01 · Estado: **spec en revisión** (solo el dueño la pasa a `aprobada`)
- Depende de: **12d cerrada** y de `fix/auditoria-dependencias` (CI en verde).
- ADR: [0015](../../../docs/adr/0015-importacion-por-archivo-con-exportacion-previa.md) (aceptada, enmendada el
  2026-11-01). Se apoya en 0021 (sesión y roles), 0022 (cliente Angular) y 0023 (estructura).
- Decisiones del dueño que usa: P79 (alta masiva que solo crea; retiro de Sheets y del comando) y P80 (reglas del
  catálogo).

## Intent

Hoy los productos solo entran con `npm run catalogo:importar`, que lee Google Sheets o una carpeta de CSV y, en cada
corrida, desactiva lo que falte, borra y recrea tarifas y cobertura, sobrescribe parámetros y reemplaza las excepciones
de horario. El back office no puede crear ni editar un producto, y lo que se editara en él lo pisaría la siguiente
importación.

Esta fase hace del back office **la única forma de administrar el catálogo**:

1. **Productos y categorías** se crean, editan y desactivan desde la pantalla, con las mismas validaciones del importador
   y protección cuando dos personas editan a la vez.
2. **Fotos** se suben desde el navegador, se ordenan y se marcan como portada o con su ángulo.
3. **Alta masiva única**: una plantilla `.xlsx` que solo crea productos nuevos, con vista previa y todo o nada.
4. **Retiro** de Google Sheets, del comando `catalogo:importar` y del collage, que solo existía para el importador.

Éxito: el dueño descarga la plantilla, la llena con 20 productos, ve la vista previa con un error en la fila 12, lo
corrige, la aplica y los 20 quedan creados; sube las fotos de uno, edita su precio, y en el siguiente mensaje de
WhatsApp el bot ya lo ofrece con el precio nuevo. Un asesor ve el catálogo pero no puede editarlo.

## Decisiones ya tomadas (no se reabren)

| Tema | Decisión | Dónde |
|---|---|---|
| Fuente de verdad | La base de datos; el día a día se hace en la interfaz | ADR-0015, P79 |
| Carga masiva | Solo crea productos nuevos; un SKU existente es un error de esa fila; vista previa; todo o nada | P79 |
| Edición masiva con exportación | Pospuesta hasta que el dueño la pida | P79, ADR-0015 (enmienda) |
| Google Sheets y `catalogo:importar` | Se retiran en esta fase | P79 |
| Tarifas y cobertura | Conservan lo que haya en la base hasta la Fase 15 | P79 (opción A) |
| SKU | Inmutable tras crear el producto | P80 |
| Borrado | Un producto nunca se borra, se desactiva | P80 |
| Permisos | El asesor ve el catálogo; solo el admin lo edita y hace la carga masiva | P80 |
| Stock | No se toca en esta fase: la columna de stock inicial de la plantilla llega con la 13b | P80, hoja de ruta |

## Scope

### In Scope

1. Casos de uso de escritura en `catalogo`: crear, editar y desactivar productos; crear, renombrar, ordenar, desactivar
   y borrar (si está vacía) categorías. Validación de dominio compartida con la carga masiva.
2. Fotos: subir (JPEG, PNG o WebP), redimensionar con las reglas de hoy (MED6), ordenar, marcar portada y ángulo, borrar;
   máximo 6 por producto.
3. Carga masiva: plantilla `.xlsx` descargable, vista previa sin escribir y aplicación todo o nada.
4. API de admin bajo `/api/v1/catalogo` con contrato OpenAPI; lectura para `admin` y `asesor`, escritura solo `admin`.
5. Cliente: área **Catálogo** con «Productos» (lista con buscador, ventana de edición y galería de fotos), «Categorías»
   y «Carga masiva».
6. Cada escritura invalida el caché del catálogo (CAT5): el bot ve el cambio en el siguiente mensaje.
7. Retiro de `FuenteCatalogoSheets`, `FuenteCatalogoDirectorio`, `ImportarCatalogo`, `ProcesarFotos` del importador,
   `descarga-drive`, el collage, `scripts/importar-catalogo.ts`, `CATALOGO_SHEET_ID`, `CATALOGO_GENERAR_COLLAGE` y sus
   specs (IMP1-IMP15, MED2-MED5, MED7-MED9).
8. Datos de desarrollo: `servicio/datos-desarrollo/catalogo/` pasa a ser una plantilla `.xlsx` de ejemplo con sus fotos.
9. Guía de operación `docs/operacion/catalogo.md` y specs, contrato y documentación al día.

### Out of Scope

| Qué | Dónde | Motivo |
|---|---|---|
| Stock, movimientos, stock inicial en la plantilla, alertas | Fase 13b | Es el módulo `inventario` |
| Edición masiva por archivo con exportación | Cuando el dueño la pida | P79 |
| Tarifas y zonas sin cobertura | Fase 15 | P79, opción A |
| Fotos desde enlaces (Drive) en la plantilla | Posterior, si se pide | Las fotos se suben en la pantalla del producto |
| Disponibilidad en el bot | Fase 16 | P81 |
| Historial de cambios de un producto | Posterior | Se protege la edición simultánea con `actualizado` |
| Borrar las columnas `clave_collage` y `fotos_hash` | Pregunta Q1 | Es esquema: decisión del dueño |

## Qué se migra del prototipo

| Pieza del prototipo | Decisión | Motivo |
|---|---|---|
| Importador desde Google Sheets (`importar-catalogo`) | **descartar** | ADR-0015: la hoja viva pisa lo editado; P79 |
| Panel web con «Importar ahora» | **descartar** | Retirado en el prototipo (su ADR-0006); el back office es Angular (ADR-0022) |
| Descarga de fotos desde enlaces de Drive | **posponer** | Las fotos se suben en la pantalla; se retoma si el dueño lo pide |
| Collage de fotos | **descartar** | Apagado por defecto desde la 08b; el bot envía fotos sueltas con ángulo |
| Validación de filas de producto | **conservar** | Se reutiliza para la interfaz y la carga masiva |
| Redimensionado de fotos (sharp, 1600 px, JPEG 80) | **conservar** | MED6 sin cambios |

Tests del prototipo que esta fase reemplaza: ninguno nuevo; los del importador de la Fase 03 se retiran con su código.

## Risks

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sin comando, una base nueva queda sin tarifas ni cobertura hasta la Fase 15 | El bot cotiza «sin tarifa» en una base recién creada | La base local actual conserva sus datos; los tests siembran sus propias tarifas; se anota en la guía |
| El retiro del importador borra mucho código y tests (~2.000 líneas) | PR de retiro grande | **size:exception** prevista para T6: casi todo es borrado y un retiro a medias no compila |
| Librería nueva para `.xlsx` | Superficie de dependencias y avisos de seguridad | Se elige en el design (D4) con auditoría limpia; se lee con límites de tamaño y de filas |
| Subida de archivos (fotos y plantilla) | Archivos enormes o que no son imágenes | Límite de tamaño en el interceptor, tipo comprobado por contenido con `sharp`, solo admin |
| Dos admins editan el mismo producto | Uno pisa al otro | Bloqueo optimista con `actualizado` (`409 producto-modificado`) |

## Rollback

Cada slice es un PR propio sin cambios de esquema. Revertir el slice de retiro (T6) devuelve el importador; los
productos creados en la interfaz quedan en la base y el importador los respetaría salvo los ausentes de la hoja, que
desactivaría (comportamiento de hoy). Revertir los slices de la API y del cliente no pierde datos.

## Preguntas para el dueño

| # | Pregunta | Recomendación | Bloquea |
|---|---|---|---|
| Q1 | ¿Se borran las columnas `producto.clave_collage` y `producto.fotos_hash`, que quedan sin uso al retirar el collage y el importador? | **No en esta fase**: no estorban y se borran en una limpieza de esquema junto con las de la 13b | No (default: se conservan) |
| Q2 | ¿Cuántos productos como máximo trae una plantilla? | **500 filas** y **2 MB**, suficiente para el primer registro | No (default aplicado) |
| Q3 | ¿Tamaño máximo de una foto subida? | **10 MB**, JPEG, PNG o WebP; se guarda redimensionada (MED6) | No (default aplicado) |
| Q4 | ¿Se puede crear un producto sin fotos? | **Sí, pero queda inactivo** hasta que tenga al menos una foto (hoy el importador exige fotos a un producto activo, IMP4) | No (default aplicado) |
