/**
 * Superficie pública de `modulos/catalogo` (design.md, tabla "Módulos tocados y dependencias").
 * Nadie fuera de este módulo importa rutas internas (`./dominio/...`, `./aplicacion/...`,
 * `./puertos/...`, `./infraestructura/...`) — regla de fronteras `sin-rutas-internas-de-modulo`. Se
 * exportan los cuatro casos de uso de aplicación (T8) y los tipos de dominio que un consumidor
 * futuro (Fase 07: `buscar_producto`, `obtener_ficha`, `cotizar_envio`) necesita para leer sus
 * resultados, sin conocer los puertos ni los adaptadores internos (a diferencia de `geografia`,
 * este módulo no expone sus tokens de puerto: D1 ya descartó que otro módulo dependa de ellos
 * directamente).
 *
 * Excepción, T10: `FUENTE_CATALOGO` y sus dos adaptadores (`FuenteCatalogoSheets`,
 * `FuenteCatalogoDirectorio`) sí se exportan — a diferencia del resto de puertos de este módulo —
 * porque `scripts/importar-catalogo.ts` (fuera de `modulos/`) necesita construir el adaptador
 * correcto según el flag de CLI (`--sheet-id`/`--dir`) y proveerlo al contexto de aplicación antes
 * de resolver `ImportarCatalogo` (nota de deviación de `catalogo.module.ts`, T9): sin este export,
 * `scripts/` tendría que importar una ruta interna del módulo para lograrlo.
 */
export { CatalogoModule } from './catalogo.module.js';
export { CotizarEnvio } from './aplicacion/cotizar-envio.js';
export { ConsultarPolitica, type ResultadoPolitica } from './aplicacion/consultar-politica.js';
export {
  ImportarCatalogo,
  type OpcionesImportacion,
  type ReporteImportacion,
} from './aplicacion/importar-catalogo.js';
export { ListarProductosActivos } from './aplicacion/listar-productos-activos.js';
export { ObtenerCatalogoCompacto } from './aplicacion/obtener-catalogo-compacto.js';
export { ObtenerFichaProducto } from './aplicacion/obtener-ficha-producto.js';
export { ProductoNoDisponible, type FichaProducto, type Producto, type ProductoResumen } from './dominio/producto.js';
export { type DestinoEnvio, type ResultadoCotizacion } from './dominio/envio.js';
export { FUENTE_CATALOGO, PestanaNoDisponible, type FuenteCatalogo } from './puertos/fuente-catalogo.js';
export { FuenteCatalogoDirectorio } from './infraestructura/fuente-catalogo-directorio.js';
export { FuenteCatalogoSheets } from './infraestructura/fuente-catalogo-sheets.js';
