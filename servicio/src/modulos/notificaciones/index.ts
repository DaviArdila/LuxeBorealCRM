/**
 * Superficie pública de `modulos/notificaciones`. Nadie fuera de este módulo importa rutas internas (regla
 * de fronteras `sin-rutas-internas-de-modulo`): `leads` encola avisos con {@link EncolarAviso}.
 */
export { NotificacionesModule } from './notificaciones.module.js';
export { EncolarAviso, type EntradaAviso } from './aplicacion/encolar-aviso.js';
export { ResolverEnlaceConversacion } from './aplicacion/resolver-enlace-conversacion.js';
export type {
  DatosAviso,
  DatosAvisoEspera,
  DatosAvisoLead,
  DatosAvisoSinTraspaso,
  DatosAvisoTraspaso,
  MotivoAvisoSinTraspaso,
  MotivoTraspaso,
} from './dominio/armar-aviso.js';
export { construirEnlaceConversacion, type EntradaEnlaceConversacion } from './dominio/enlace-conversacion.js';
