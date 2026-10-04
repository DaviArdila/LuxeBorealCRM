import type { Observable } from 'rxjs';
import type { StrictHttpResponse } from '../api/strict-http-response';

/**
 * Tipo del cuerpo de la respuesta de una función generada (D13). El contrato documenta las
 * respuestas en línea, así que `ng-openapi-gen` no entrega modelos con nombre: cada pantalla
 * declara su alias, p. ej. `type Usuario = RespuestaDe<typeof obtenerSesionActual>`.
 */
export type RespuestaDe<F extends (...args: never[]) => Observable<StrictHttpResponse<unknown>>> =
  ReturnType<F> extends Observable<StrictHttpResponse<infer R>> ? R : never;
