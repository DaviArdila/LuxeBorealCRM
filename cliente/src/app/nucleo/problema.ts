import { HttpErrorResponse } from '@angular/common/http';

/** Lo que una pantalla necesita de un error del servidor (D11). */
export interface Problema {
  /** Estado HTTP; 0 si no hubo respuesta. */
  readonly estado: number;
  /** Código estable de la API (`credenciales-invalidas`, `estilo-invalido`…), no el estado. */
  readonly codigo: string;
  readonly titulo: string;
  /** `detail` de RFC 9457: el motivo legible, cuando el servidor lo da. */
  readonly motivo: string | undefined;
  /** Segundos de `Retry-After` en un `429`. */
  readonly esperarSegundos: number | undefined;
}

interface CuerpoProblema {
  readonly codigo?: unknown;
  readonly title?: unknown;
  readonly detail?: unknown;
}

function comoTexto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/** Las rutas sin cuerpo se piden como texto: el problema llega como un JSON en una cadena. */
function cuerpoDe(error: HttpErrorResponse): CuerpoProblema {
  let contenido: unknown = error.error;
  if (typeof contenido === 'string') {
    try {
      contenido = JSON.parse(contenido);
    } catch {
      return {};
    }
  }
  return typeof contenido === 'object' && contenido !== null ? (contenido as CuerpoProblema) : {};
}

/** Lee un error de `HttpClient` (problem+json de la API) sin suponer que lo sea. */
export function leerProblema(error: unknown): Problema {
  if (!(error instanceof HttpErrorResponse)) {
    return { estado: 0, codigo: 'desconocido', titulo: 'Error inesperado', motivo: undefined, esperarSegundos: undefined };
  }
  const cuerpo = cuerpoDe(error);
  const espera = Number(error.headers?.get('Retry-After'));
  return {
    estado: error.status,
    codigo: comoTexto(cuerpo.codigo) ?? 'desconocido',
    titulo: comoTexto(cuerpo.title) ?? 'Error inesperado',
    motivo: comoTexto(cuerpo.detail),
    esperarSegundos: Number.isFinite(espera) && espera > 0 ? espera : undefined,
  };
}
