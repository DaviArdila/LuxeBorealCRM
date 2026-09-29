# 0015. Carga y edición masiva por archivo (xlsx/CSV) con exportación previa y control de versión

- Estado: propuesta
- Fecha: 2026-09-29

## Contexto

Hoy el catálogo, las tarifas, la cobertura, los parámetros y los festivos se cargan de forma masiva
desde una hoja de Google Sheets con `npm run catalogo:importar` (Fase 03). El importador ya está
separado del comando y lee de un puerto `FuenteCatalogo` con dos implementaciones: el endpoint
público de Sheets y un directorio local de CSV (`--dir`). La importación es todo o nada, valida cada
fila (pestaña, fila, columna, motivo) y hace `upsert` por clave sin borrar lo que la hoja ya no trae.

El problema es la **hoja viva**: nada garantiza que refleje lo que hay hoy en la base. Si alguien
edita un producto por otra vía (hoy el importador; mañana el cliente de back office con edición por
registro, Fases 11-14) y luego se importa una hoja con datos viejos, la importación pisa lo
editado. El prototipo tuvo un panel web con botón "Importar ahora" y lo retiró (ADR-0006 del
prototipo) para construir el back office como cliente independiente; el cliente previsto es
Angular o React, sobre la API OpenAPI (`docs/analisis/06-cliente-back-office.md`).

## Alternativas

1. **Hoja de Google como fuente viva** (estado actual): cómoda para editar entre varias personas,
   pero puede estar desactualizada, exige compartirla públicamente o configurar una cuenta de
   servicio de Google, y depende de un servicio externo.
2. **Base → hoja de Google → base:** exportar la base a la hoja antes de editar. Resuelve lo viejo,
   pero añade credenciales de Google (cuenta de servicio), una API externa en el camino crítico de
   una operación interna y dos sistemas que pueden divergir entre la exportación y la importación.
3. **Archivo (xlsx o CSV) con ida y vuelta:** se exporta desde la base, se edita, se sube y se
   importa. El archivo siempre nace del estado actual y no requiere servicios externos.

## Decisión

Se adopta la alternativa 3 como forma de carga y edición masiva. Google Sheets se retira **cuando el
reemplazo exista**; hasta entonces sigue funcionando sin cambios.

- **El archivo nace de la base.** Un exportador (primero por CLI, luego desde el cliente) genera el
  archivo con el mismo formato que lee el importador: una hoja por tabla (`productos`, `tarifas`,
  `cobertura`, `parametros`, `excepciones_horario`).
- **Control de versión por fila.** Cada fila exportada lleva la versión que tenía (el `actualizado`
  de su tabla). Al importar, una fila cuya versión en la base cambió desde la exportación es un
  **conflicto**: no se pisa y se informa. Las filas nuevas (sin identificador) se aceptan siempre.
- **Ausente no significa desactivar.** Un producto que no está en el archivo no se desactiva;
  desactivar se hace con la columna `activo`. (El prototipo desactivaba por ausencia, y con un
  archivo incompleto eso es destructivo.)
- **Vista previa e informe.** Antes de aplicar se muestra qué se crearía, actualizaría o rechazaría
  (`--simular` en el CLI); al terminar, un informe por pestaña con lo cargado y los errores por
  fila. La importación sigue siendo todo o nada: un error deja la base como estaba.
- **Formato.** `.xlsx` es el principal: el CSV que guarda Excel en español usa `;` como separador y
  una codificación distinta, y rompe importaciones. El CSV sigue soportado con formato fijo (UTF-8,
  `,`). Leer `.xlsx` exige una librería nueva, que se elige en el cambio que lo implemente.
- **Coexistencia con el cliente.** El cliente edita registros puntuales; el archivo sirve para
  cargas y ediciones masivas. Ambos escriben en la misma base y el control de versión es lo que
  impide que uno pise al otro sin aviso.

## Consecuencias

- No se construye nada todavía. El primer cambio es el exportador por CLI con una prueba de ida y
  vuelta (exportar → importar → mismo estado), la columna de versión y `--simular`; es un cambio
  propio, posterior a la Fase 07. La pantalla y los endpoints (subir, vista previa, aplicar,
  informe, un solo proceso a la vez y solo para el rol admin) son de las Fases 11 y 14.
- Se elimina el acceso a Google (endpoint público de Sheets y `CATALOGO_SHEET_ID`) en el mismo
  cambio que entrega el reemplazo. Las fotos de producto se siguen descargando de enlaces de Drive:
  es un mecanismo aparte.
- Un archivo descargado no se edita entre varias personas a la vez ni se actualiza solo; si dos
  personas exportan y editan a la vez, la segunda que importe verá conflictos y deberá re-exportar.
- Cambiar de alternativa 3 a otra, o cambiar la regla de "ausente no desactiva", requiere un ADR
  nuevo que reemplace este.
