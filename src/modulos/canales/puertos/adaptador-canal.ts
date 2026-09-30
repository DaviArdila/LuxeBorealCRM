/**
 * Puerto síncrono del adaptador de canal (design.md D12, D13, D15): las cuatro operaciones HTTP
 * que el manejador del outbox (`aplicacion/publicar-efecto-canal.ts`, T7) necesita para cumplir
 * los efectos de `SalidaCanal` (`salida-canal.ts`) contra Chatwoot. Interno del módulo: no se
 * exporta en `index.ts` (D9) — solo lo invoca ese manejador, nunca código fuera de `canales`, así
 * nadie puede saltarse el outbox (el único mecanismo de reintento, ADR-0004) para mandar un
 * mensaje.
 */
import type { EstadoConversacionCanal } from '../dominio/evento-canal.js';

/** Token de inyección del puerto {@link AdaptadorCanal}. */
export const ADAPTADOR_CANAL = Symbol('ADAPTADOR_CANAL');

export type NaturalezaFallo = 'transitorio' | 'permanente';

/**
 * Fallo de un adaptador de canal (D12, CAN7). El mensaje MUST NOT llevar el cuerpo de la respuesta
 * ni el token de autenticación (matriz de amenazas de `design.md`: "Token de Chatwoot filtrado en
 * errores") — solo lo que quien lo lanza decide incluir explícitamente (método, ruta y status).
 * `esperaSugeridaS` traduce la cabecera `Retry-After` de un 429 cuando el proveedor la envía; el
 * publicador del outbox (T6/T7) decide si la respeta y cómo la acota.
 */
export class FalloCanal extends Error {
  constructor(
    readonly naturaleza: NaturalezaFallo,
    readonly causa: string,
    readonly esperaSugeridaS?: number,
  ) {
    super(causa);
    this.name = 'FalloCanal';
  }
}

/**
 * Cada método lanza {@link FalloCanal} si Chatwoot responde con error o la petición no llega
 * (D12). `enviarTexto` recibe `marca` (clave de idempotencia, D11) para que el adaptador la
 * persista como `content_attributes.luxe_clave`; `existeMensajeConMarca` es la reconciliación de
 * D13 que el manejador del outbox usa antes de reintentar un mensaje cuyo intento anterior no
 * terminó con certeza. `enviarImagen` (D5 de la 07b) sube el adjunto con la misma `marca`: viaja en
 * `content_attributes` y, como respaldo, en el nombre del archivo (CAN10), porque no está confirmado
 * que Chatwoot conserve `content_attributes` en un multipart.
 */
export interface AdaptadorCanal {
  enviarTexto(idConversacion: string, texto: string, marca: string): Promise<void>;
  enviarImagen(
    idConversacion: string,
    contenido: Buffer,
    contentType: string,
    leyenda: string | undefined,
    marca: string,
  ): Promise<void>;
  existeMensajeConMarca(idConversacion: string, marca: string): Promise<boolean>;
  cambiarEstado(idConversacion: string, estado: Exclude<EstadoConversacionCanal, 'pospuesta'>): Promise<void>;
  agregarEtiquetas(idConversacion: string, etiquetas: readonly string[]): Promise<void>;
}
