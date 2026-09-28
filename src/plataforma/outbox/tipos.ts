/**
 * Tipos y tokens de `plataforma/outbox` (D10 de
 * `openspec/changes/fase-04-canal-chatwoot/design.md`). `NuevaEntradaOutbox` es lo que agrega un
 * módulo dueño (`canales` en la Fase 04/T7); `EntradaOutbox` es lo que recibe cada
 * {@link ManejadorOutbox} al publicar. `plataforma/outbox` MUST NOT importar `modulos/` (regla de
 * fronteras 7): estos tipos no conocen `canal.mensaje` ni ningún otro `tipo` concreto — solo `string`.
 */

/** Token de inyección del puerto {@link RegistroOutbox}. */
export const REGISTRO_OUTBOX = Symbol('REGISTRO_OUTBOX');

/** Nombre de la cola BullMQ del outbox genérico (D6, D10); un solo dueño para todos los `tipo`. */
export const NOMBRE_COLA_OUTBOX = 'outbox';

/** Job normal, disparado tras `agregar` con el mismo tope de 200 ms de D5 (D10, "Disparo"). */
export const NOMBRE_JOB_PUBLICAR = 'publicar';

/** Job repetible de barrido (D10): llama a `publicarPendientes()` igual que el job normal. */
export const NOMBRE_JOB_BARRIDO_OUTBOX = 'barrido-outbox';

/** Lo que agrega quien dispara un efecto externo (D10, D11): persiste en `outbox.payload`. */
export interface NuevaEntradaOutbox {
  /** p. ej. `'canal.mensaje'`, `'canal.estado'`, `'canal.etiquetas'` (esta fase, D10). */
  readonly tipo: string;
  /** Formato de dominio de quien agrega (D11); columna única — `agregar` usa `ON CONFLICT DO NOTHING`. */
  readonly claveIdempotencia: string;
  /** Filas del mismo grupo se publican en orden estricto (D10); ninguna se salta a una anterior pendiente. */
  readonly grupo: string;
  /** Desempata filas insertadas en la misma transacción (mismo `creado`); orden total: `(creado, orden, id)`. */
  readonly orden: number;
  /** Lo que persiste más allá de la entrega (D10). */
  readonly datos: Readonly<Record<string, unknown>>;
  /** Lo que NO puede quedar persistido más allá de la entrega (D10); se borra al cerrar la fila. */
  readonly efimero?: Readonly<Record<string, unknown>>;
}

/** Puerto de disparo del outbox genérico (D10, D11); lo exporta el barril de `plataforma/outbox`. */
export interface RegistroOutbox {
  agregar(entradas: readonly NuevaEntradaOutbox[]): Promise<void>;
}

/** Lo que recibe un {@link ManejadorOutbox} al publicar una fila reclamada (D10). */
export interface EntradaOutbox extends NuevaEntradaOutbox {
  readonly id: string;
  /** `intentos` de la fila tras el reclamo que la trajo (≥ 1, D10). */
  readonly intento: number;
}

/**
 * Lanzada por un {@link ManejadorOutbox} para clasificar un fallo (D10, D12). `esperaSugeridaS`
 * (p. ej. `Retry-After` de un 429) MUST quedar acotado a `OUTBOX_BACKOFF_MAX_S` antes de
 * combinarse con `retrasoSegundos` tomando el máximo (D12) — lo acota `PublicadorOutbox`, no quien
 * lanza el fallo; `causa` MUST NOT ser el `message` libre de una excepción de cliente (R14) — la
 * construye el manejador que la lanza, nunca `PublicadorOutbox`.
 */
export class FalloPublicacion extends Error {
  constructor(
    readonly clase: 'transitorio' | 'permanente',
    readonly causa: string,
    readonly esperaSugeridaS?: number,
  ) {
    super(causa);
    this.name = 'FalloPublicacion';
  }
}

/** Manejador de un `tipo` de outbox concreto (D10); registrado por su módulo dueño en {@link RegistroManejadoresOutbox}. */
export interface ManejadorOutbox {
  /** MUST lanzar {@link FalloPublicacion} para un fallo esperado; cualquier otro error se trata como transitorio. */
  publicar(entrada: EntradaOutbox): Promise<void>;
}

/** Forma persistida en `outbox.payload` (jsonb); interno de este submódulo (D10). */
export interface PayloadOutbox {
  readonly v: 1;
  readonly grupo: string;
  readonly orden: number;
  readonly datos: Readonly<Record<string, unknown>>;
  readonly efimero?: Readonly<Record<string, unknown>>;
}
