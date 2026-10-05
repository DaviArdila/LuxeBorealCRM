/**
 * Superficie pública de `plataforma/config` (PLT1). Nadie fuera de este módulo lee `process.env`
 * directamente ni importa rutas internas (`./esquema.js`, `./cargar-configuracion.js`, etc.).
 */
export { cargarArchivoEntorno } from './cargar-archivo-entorno.js';
export { cargarConfiguracion } from './cargar-configuracion.js';
export { CONFIGURACION, ConfiguracionModule } from './configuracion.module.js';
export {
  ConfiguracionInvalidaError,
  esquemaConfiguracion,
  type Configuracion,
  type ProblemaConfiguracion,
  type VariableInvalida,
} from './esquema.js';
