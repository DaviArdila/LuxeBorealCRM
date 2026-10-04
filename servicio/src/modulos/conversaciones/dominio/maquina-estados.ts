/**
 * Máquina de estados bot/humano, pura (D3, D4 de `design.md`). Sin `@nestjs`, `@prisma/client` ni
 * `redis` (regla de fronteras `dominio-aislado`): `EstadoAtencion` se declara aquí, no se importa
 * del cliente Prisma generado (frontera 4).
 */

/** Mismos valores que el enum `estado_atencion` de Prisma (`schema.prisma`), sin importarlo (A9). */
export type EstadoAtencion = 'bot' | 'handoff_pendiente' | 'humano' | 'pausado';

/**
 * Tipo cerrado, igual al prototipo (D4). Esta fase produce `ttl`, `chatwoot_pending`,
 * `chatwoot_resolved` y `eco_humano`; `admin`, `regla_handoff_explicita` y `lead_caliente` quedan
 * declarados porque el dominio ya los valida (R6), aunque ningún código de esta fase los dispare
 * todavía (Fases 08/09).
 */
export type OrigenTransicion =
  | 'ttl'
  | 'admin'
  | 'chatwoot_pending'
  | 'chatwoot_resolved'
  | 'eco_humano'
  | 'regla_handoff_explicita'
  | 'lead_caliente';

export interface ResultadoTransicion {
  readonly destino: EstadoAtencion;
  readonly expiraControlEn: Date | null;
}

/** R6: una transición fuera de este mapa lanza, nunca un `warn` que deja pasar (A6). */
const ORIGENES_PERMITIDOS_A_BOT: ReadonlySet<OrigenTransicion> = new Set([
  'ttl',
  'admin',
  'chatwoot_pending',
  'chatwoot_resolved',
]);

/** R6: una transición fuera del mapa válido de orígenes hacia `bot`/`pausado`. */
export class TransicionInvalida extends Error {
  constructor(destino: EstadoAtencion, origen: OrigenTransicion) {
    super(`Transición a "${destino}" con origen "${origen}" no permitida (R6).`);
    this.name = 'TransicionInvalida';
  }
}

/**
 * Calcula el resultado de transicionar una conversación (D3). **Lanza** {@link TransicionInvalida}
 * si `destino` es `bot` con un origen distinto de `ttl`/`admin`/`chatwoot_pending`/
 * `chatwoot_resolved`, o si `destino` es `pausado` con un origen distinto de `admin` (R6); nunca
 * solo advierte (A6). `actual` se recibe por fidelidad con el contrato de `design.md` D3; esta fase
 * no valida reglas dependientes del estado de origen (solo del origen de la transición) —
 * `aplicacion/consumidor-conversaciones.ts` (T5) es quien decide si una transición es un no-op
 * observable antes de llamar aquí (D5).
 *
 * `expiraControlEn` se calcula con `ahora` (el `CLOCK` inyectado la produce, esta función no lo
 * llama): `ahora + humanoTtlHoras` para `humano`, `ahora + handoffTtlMin` para
 * `handoff_pendiente`, `null` para `bot`/`pausado`.
 */
export function calcularTransicion(
  actual: EstadoAtencion,
  destino: EstadoAtencion,
  origen: OrigenTransicion,
  ahora: Date,
  humanoTtlHoras: number,
  handoffTtlMin: number,
): ResultadoTransicion {
  void actual;

  if (destino === 'bot' && !ORIGENES_PERMITIDOS_A_BOT.has(origen)) {
    throw new TransicionInvalida(destino, origen);
  }
  if (destino === 'pausado' && origen !== 'admin') {
    throw new TransicionInvalida(destino, origen);
  }

  return { destino, expiraControlEn: calcularExpiracion(destino, ahora, humanoTtlHoras, handoffTtlMin) };
}

function calcularExpiracion(
  destino: EstadoAtencion,
  ahora: Date,
  humanoTtlHoras: number,
  handoffTtlMin: number,
): Date | null {
  if (destino === 'humano') {
    return new Date(ahora.getTime() + humanoTtlHoras * 60 * 60 * 1000);
  }
  if (destino === 'handoff_pendiente') {
    return new Date(ahora.getTime() + handoffTtlMin * 60 * 1000);
  }
  return null;
}
