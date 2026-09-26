/**
 * Superficie pública de `modulos/medios` (D1). Nadie fuera de este módulo importa rutas internas
 * (`./puertos/almacenamiento.js`, `./infraestructura/almacenamiento-minio.js`,
 * `./aplicacion/collage.js`) — regla de fronteras `sin-rutas-internas-de-modulo`.
 */
export { MediosModule } from './medios.module.js';
export { ALMACENAMIENTO, type Almacenamiento } from './puertos/almacenamiento.js';
export { construirCollage, type FotoParaCollage } from './aplicacion/collage.js';
