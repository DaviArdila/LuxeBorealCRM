/**
 * Superficie pública de `modulos/leads`. Nadie fuera de este módulo importa rutas internas (regla de
 * fronteras `sin-rutas-internas-de-modulo`): el agente usa los casos de uso y el vocabulario de señales.
 */
export { LeadsModule } from './leads.module.js';
export {
  EvaluarPropuestaLead,
  type AccionLead,
  type EntradaPropuesta,
  type ResultadoPropuesta,
} from './aplicacion/evaluar-propuesta-lead.js';
export { RecordarLeads } from './aplicacion/recordar-leads.js';
export { AvisarLead } from './aplicacion/avisar-lead.js';
export { CompletarCaptura } from './aplicacion/completar-captura.js';
export { ObtenerCapturaPendiente } from './aplicacion/obtener-captura-pendiente.js';
export {
  RegistrarPidePersona,
  type EntradaPidePersona,
  type ResultadoPidePersona,
} from './aplicacion/registrar-pide-persona.js';
export { HECHO_CAPTURA_PENDIENTE } from './dominio/hecho-captura.js';
export { detectarPidePersona } from './dominio/detectar-pide-persona.js';
export { NOMBRES_SENALES, type NombreSenal } from './dominio/escala-lead.js';
