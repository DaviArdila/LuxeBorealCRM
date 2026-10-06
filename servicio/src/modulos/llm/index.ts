/**
 * Superficie pública del módulo `llm`: el módulo Nest, el token del puerto y el error tipado con sus
 * códigos. Los tipos del contrato (`LlmPort`, `SolicitudGeneracion`, `RespuestaGeneracion`…) se
 * exportan como tipos desde aquí. El adaptador, el gateway y los puertos internos no salen del
 * módulo (LLM11).
 */
export { LlmModule } from './llm.module.js';
export { CODIGOS_ERROR_PASARELA, ErrorPasarelaLlm } from './dominio/error-pasarela-llm.js';
export { ObtenerMensajeTechoGasto } from './aplicacion/obtener-mensaje-techo-gasto.js';
export { LLM_PORT } from './puertos/llm-port.js';
export type {
  CodigoErrorPasarela,
  DefinicionHerramienta,
  EsquemaArgumentos,
  LlamadaHerramienta,
  LlamadaInvalida,
  LlmPort,
  MensajeLlm,
  PerfilLlm,
  RespuestaGeneracion,
  ResultadoHerramienta,
  RolMensajeLlm,
  SolicitudGeneracion,
  UsoReportado,
} from './puertos/llm-port.js';
