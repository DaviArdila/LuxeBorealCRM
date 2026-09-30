/**
 * Cliente HTTP de la API de Chatwoot (D12 de `design.md`), portado de
 * `../ChatLuxeCRM/src/chatwoot/chatwootClient.real.ts`. `fetch` nativo,
 * `AbortSignal.timeout(CHATWOOT_HTTP_TIMEOUT_MS)`, header `api_access_token`. **Cero reintentos
 * propios** (ADR-0004: "un solo mecanismo de reintento para todos los efectos externos", que es el
 * outbox de plataforma, T6/T7) — cada fallo se traduce a {@link FalloCanal} para que el publicador
 * del outbox decida si reintenta y con qué backoff. El mensaje de `FalloCanal` MUST NOT llevar el
 * cuerpo de la respuesta ni el token (matriz de amenazas de `design.md`): solo método, ruta y
 * status. Vive en `infraestructura/chatwoot/` (D1: habla el formato de Chatwoot).
 */
import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION } from '../../../../plataforma/config/index.js';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import { FalloCanal } from '../../puertos/adaptador-canal.js';

type Metodo = 'GET' | 'POST';

@Injectable()
export class ClienteChatwoot {
  constructor(@Inject(CONFIGURACION) private readonly configuracion: Configuracion) {}

  async post(idConversacion: string, sufijo: string, cuerpo: Readonly<Record<string, unknown>>): Promise<unknown> {
    return this.llamar('POST', idConversacion, sufijo, cuerpo);
  }

  /**
   * `POST` `multipart/form-data` (D5 de la 07b, CAN6). El `Content-Type` con su `boundary` lo pone
   * `fetch` al recibir un `FormData`: fijarlo a mano rompería el límite entre partes.
   */
  async postMultipart(idConversacion: string, sufijo: string, formulario: FormData): Promise<unknown> {
    return this.llamar('POST', idConversacion, sufijo, formulario);
  }

  async get(idConversacion: string, sufijo: string): Promise<unknown> {
    return this.llamar('GET', idConversacion, sufijo);
  }

  private url(idConversacion: string, sufijo: string): string {
    const base = this.configuracion.CHATWOOT_URL.replace(/\/+$/, '');
    return `${base}/api/v1/accounts/${this.configuracion.CHATWOOT_ACCOUNT_ID}/conversations/${idConversacion}/${sufijo}`;
  }

  private async llamar(
    metodo: Metodo,
    idConversacion: string,
    sufijo: string,
    cuerpo?: Readonly<Record<string, unknown>> | FormData,
  ): Promise<unknown> {
    const url = this.url(idConversacion, sufijo);
    const pathname = new URL(url).pathname;

    let respuesta: Response;
    try {
      respuesta = await fetch(url, {
        method: metodo,
        headers: {
          api_access_token: this.configuracion.CHATWOOT_BOT_TOKEN,
          ...(cuerpo && !(cuerpo instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        },
        body: cuerpo instanceof FormData ? cuerpo : cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(this.configuracion.CHATWOOT_HTTP_TIMEOUT_MS),
      });
    } catch {
      // Error de red o timeout (`AbortError`): transitorio (D12). Nunca se incluye la causa cruda
      // del error de fetch en el mensaje: podría filtrar detalles de la URL o del entorno.
      throw new FalloCanal('transitorio', `${metodo} ${pathname}: sin respuesta`);
    }

    if (respuesta.ok) {
      if (respuesta.status === 204) return undefined;
      return respuesta.json().catch(() => undefined);
    }

    if (respuesta.status === 429) {
      const esperaSugeridaS = analizarRetryAfter(respuesta.headers.get('retry-after'));
      throw new FalloCanal('transitorio', `${metodo} ${pathname}: 429`, esperaSugeridaS);
    }
    if (respuesta.status >= 500) {
      throw new FalloCanal('transitorio', `${metodo} ${pathname}: ${respuesta.status}`);
    }
    // Cualquier otro 4xx: permanente, sin reintento (CAN7).
    throw new FalloCanal('permanente', `${metodo} ${pathname}: ${respuesta.status}`);
  }
}

function analizarRetryAfter(valor: string | null): number | undefined {
  if (!valor) return undefined;
  const segundos = Number(valor);
  return Number.isFinite(segundos) && segundos >= 0 ? segundos : undefined;
}
