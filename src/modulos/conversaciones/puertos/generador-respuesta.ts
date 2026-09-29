import type { CanalConversacion } from './repositorio-conversacion.js';
import type { PasoRespuesta } from './salida-conversacion.js';

/**
 * Mismos valores que `TipoContenido` de `canales`, copiados como tipo propio para no filtrar el tipo
 * de ese módulo al generador (D2 de la Fase 07a).
 */
export type TipoContenidoTurno = 'texto' | 'imagen' | 'audio' | 'ubicacion' | 'documento' | 'sticker' | 'otro';

/** Un mensaje del turno tal como quedó en el buffer: su tipo y, solo si es `texto`, el texto real (D16, CNV7). */
export interface MensajeTurno {
  readonly idMensaje: string;
  readonly tipoContenido: TipoContenidoTurno;
  /** Vacío salvo `tipoContenido === 'texto'` (CNV7): el consumidor no lee de Chatwoot los demás tipos. */
  readonly texto: string;
}

/** Lo que el generador necesita saber del canal sin preguntar por él (principio 7 de `SPEC.md`, D5). */
export interface CapacidadesSalida {
  readonly mensajeSalienteCuesta: boolean;
  readonly admiteImagen: boolean;
}

export interface ContextoTurno {
  readonly conversacionId: string;
  readonly contactoId: string;
  readonly canal: CanalConversacion;
  /** Constante mientras la conversación está en `bot`: identifica la sesión (D8 de la Fase 07a). */
  readonly version: number;
  readonly capacidades: CapacidadesSalida;
}

export interface SolicitudTurno {
  readonly contexto: ContextoTurno;
  readonly mensajes: readonly MensajeTurno[];
}

export type MotivoHandoff =
  | 'audio-repetido'
  | 'tope-turnos'
  | 'fallo-llm'
  | 'techo-gasto'
  | 'argumentos-invalidos'
  | 'plazo-agotado'
  | 'lead-caliente';

export interface RespuestaTurno {
  /** Vacío = no enviar nada (CNV8). */
  readonly pasos: readonly PasoRespuesta[];
  /** Lo ejecuta `conversaciones` después de enviar los pasos (CNV8); el generador nunca transiciona (R6). */
  readonly handoff?: { readonly motivo: MotivoHandoff };
}

/** Token de inyección del puerto {@link GeneradorRespuesta} (D9 de `design.md`). */
export const GENERADOR_RESPUESTA = Symbol('GENERADOR_RESPUESTA');

/**
 * Contrato del generador de respuesta (D9 de la Fase 05, ampliado en la 07a — D1): recibe el contexto
 * del turno y los mensajes con su tipo, y devuelve pasos y, si corresponde, un pedido de `handoff`.
 * Su dueño es `conversaciones`; el módulo `agente` lo implementa (ADR-0016) y `AgenteEco` es el
 * *stand-in* de los tests del propio módulo.
 */
export interface GeneradorRespuesta {
  generar(solicitud: SolicitudTurno): Promise<RespuestaTurno>;
}
