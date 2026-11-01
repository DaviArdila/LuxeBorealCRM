# Tasks: fase-13a-catalogo-back-office

- Modo TDD: **estricto** (CLAUDE.md, `openspec/config.yaml`) · Runner: Vitest (`npm test`, `npm run test:integracion`,
  `npm run test:e2e`; cliente: `npm --prefix cliente test`).
- Review requerida: **RDD** (la 13a no exige `judgment-day`).
- Publicación (P82): cada slice es una rama apilada, se sube y su CI debe quedar en verde; **no se fusiona a `main` sin la
  revisión del dueño**.
- Antes de cada push: batería completa del servicio dentro de `servicio/` (lint, typecheck, fronteras,
  `contrato:deriva`, `commits`, `unit`, `integracion`, `e2e`, `evals`) y, si toca `cliente/`, `npm --prefix cliente run ci`.
  Las fallas de Docker Hub (`429`) en la nube se distinguen contra `main` y se anotan aquí.

## Slices

| Slice | Rama | Tareas | Pronóstico de líneas |
|---|---|---|---|
| p0 | `fase-13a-catalogo-back-office` | Spec (este change) | solo documentación |
| p1 | `fase-13a-p1-productos` | T1, T2 | ~400 |
| p2 | `fase-13a-p2-categorias-y-api` | T3, T4 | ~400 |
| p3 | `fase-13a-p3-fotos` | T5 | ~400 |
| p4 | `fase-13a-p4-carga-masiva` | T6 | ~400 |
| p5 | `fase-13a-p5-retiro-importador` | T7 | **~2.000, casi todo borrado: size:exception** (proposal, Risks) |
| p6 | `fase-13a-p6-cliente-productos` | T8 | ~400 |
| p7 | `fase-13a-p7-cliente-fotos-y-carga` | T9 | ~400 |
| p8 | `fase-13a-p8-cierre` | T10 | ~250 |

Cada rama sale de la anterior; el PR de cada una apunta a la anterior (`stacked-to-main`).

## Tareas

- [ ] **T1 — Validación y creación de productos (CAT15, CAT16).** `dominio/validar-producto.ts` con las reglas del
  importador; puerto `RepositorioCatalogoAdmin` y su adaptador Prisma; caso de uso `CrearProducto` (inactivo, SKU en
  mayúsculas, `409 sku-duplicado`, `422 producto-invalido`). RED: tests de CAT15 (unit) y CAT16 (integración contra
  Postgres). Ruta: inline.
- [ ] **T2 — Edición, activación y caché (CAT17, CAT18).** `EditarProducto` con bloqueo optimista por `actualizado` (D3),
  SKU inmutable, `producto-sin-fotos` al activar, invalidación de la caché tras confirmar con `warn` si Redis falla (D8).
  RED: escenarios de CAT17 y CAT18 en integración (Postgres y Redis reales).
- [ ] **T3 — Categorías (CAT19).** Casos de uso para listar con conteo, crear, renombrar, ordenar, desactivar y borrar
  vacía, con nombre único sin distinguir mayúsculas. RED: escenarios de CAT19 en integración.
- [ ] **T4 — API de productos y categorías (CAT25, CAT26).** Controladores `productos` y `categorias`, esquemas Zod,
  listado paginado con búsqueda sin tildes, roles (`admin`, `asesor` en lectura) y contrato regenerado
  (`contrato:generar`, `contrato:deriva`, `contrato:lint`, `contrato:diff`). RED: e2e de CAT25 y CAT26 y de los errores
  RFC 9457 de CAT16, CAT17 y CAT19.
- [ ] **T5 — Fotos (CAT20, CAT21, MED6).** `redimensionarFoto` pasa a `medios`; `SubirFoto` y `GestionarFotos` con D6;
  controlador `fotos` con `FileInterceptor` (D5) y contrato `multipart/form-data`. RED: integración contra MinIO (subir,
  portada, límite, borrar y objeto borrado) y e2e de `foto-invalida`, `limite-fotos` y `archivo-muy-grande`.
- [ ] **T6 — Carga masiva (CAT22, CAT23, CAT24).** Dependencias `read-excel-file` y `write-excel-file` (D4) con
  `npm run auditoria` limpia; puertos `LectorPlantilla` y `EscritorPlantilla` y regla de fronteras; `ValidarCarga`,
  `PrevisualizarCarga`, `AplicarCarga` con el cerrojo de Redis (D7); controlador `carga-masiva`. RED: unit de la
  conversión de filas, integración de la ida y vuelta de la plantilla y de la transacción todo o nada, e2e de los tres
  endpoints.
- [ ] **T7 — Retiro del importador, de Sheets y del collage (D9).** Borra el código, los tests, el comando, las variables
  y `test/fixtures/catalogo/`; `servicio/datos-desarrollo/catalogo/` pasa a la plantilla de ejemplo; `.env.example`,
  README y guías sin el importador. RED: `npm run fronteras` y `typecheck` con un test que exige que `catalogo` no exporte
  `ImportarCatalogo` ni `FUENTE_CATALOGO`. Excepción de tamaño prevista (Risks de la proposal).
- [ ] **T8 — Cliente: área Catálogo, «Productos» y «Categorías» (SHL13, SHL15).** Cliente HTTP regenerado
  (`api:generar`), área con roles, lista con buscador y filtros, ventana de edición con errores por campo y aviso de
  edición ajena, pantalla de categorías. RED: tests de componente de SHL13 y SHL15.
- [ ] **T9 — Cliente: fotos y «Carga masiva» (SHL14, SHL16).** Galería con subida múltiple, orden, portada, ángulo y
  borrado; pantalla de carga masiva con plantilla, vista previa y aplicar. RED: tests de componente de SHL14 y SHL16.
- [ ] **T10 — Cierre.** e2e de punta a punta: crear un producto por la API, subirle una foto, activarlo y verlo en el
  catálogo compacto y en la ficha del bot (CAT18); guía `docs/operacion/catalogo.md` y fila en el mapa de documentación
  de `CLAUDE.md`; `docs/operacion/cliente-back-office.md` al día; `verify-report.md`; deltas fusionados en
  `openspec/specs/`; change archivado; `docs/fases/README.md` y `docs/migracion/inventario.md` al día.
- [ ] **`[manual]` — Prueba del dueño (fuera del conteo de tareas).** Cargar productos reales con la plantilla, subir sus fotos, activarlos y
  preguntar por WhatsApp. No bloquea el cierre en código.

## Evidencia

(Se llena al implementar: RED observado, GREEN, commit y CI de cada tarea.)
