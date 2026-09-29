import type { RespuestaGeneracion, SolicitudGeneracion } from '../dominio/tipos-llm.js';

export type { CodigoErrorPasarela } from '../dominio/error-pasarela-llm.js';
export type {
  DefinicionHerramienta,
  EsquemaArgumentos,
  LlamadaHerramienta,
  LlamadaInvalida,
  MensajeLlm,
  PerfilLlm,
  RespuestaGeneracion,
  ResultadoHerramienta,
  RolMensajeLlm,
  SolicitudGeneracion,
  UsoReportado,
} from '../dominio/tipos-llm.js';

/** Token de inyección del puerto {@link LlmPort}. */
export const LLM_PORT = Symbol('LLM_PORT');

/**
 * Único contrato que conoce el llamador para pedir una generación al LLM: tipos propios, sin ningún
 * tipo del SDK de un proveedor. Los fallos salen como `ErrorPasarelaLlm` (`codigo` distingue
 * `timeout`, `no-reintentable`, `circuito-abierto`, `techo-alcanzado` y `proveedor-caido`).
 * Las definiciones y llamadas de herramientas viajan sin interpretarse (R1/R2) y los
 * `metadatosProveedor` son opacos: el llamador solo los transporta.
 */
export interface LlmPort {
  generar(solicitud: SolicitudGeneracion): Promise<RespuestaGeneracion>;
}
