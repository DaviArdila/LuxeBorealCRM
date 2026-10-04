import type { HttpInterceptorFn } from '@angular/common/http';

const METODOS_QUE_CAMBIAN = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CLT6 (USR7 del servidor): toda mutación hacia `/api` lleva `X-Luxe-Csrf: 1`; las lecturas y los
 * destinos ajenos no. El cliente generado no lo pide (D12): es una regla transversal.
 */
export const csrfInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const haciaLaApi = peticion.url.startsWith('/api/');
  if (haciaLaApi && METODOS_QUE_CAMBIAN.has(peticion.method)) {
    return siguiente(peticion.clone({ setHeaders: { 'X-Luxe-Csrf': '1' } }));
  }
  return siguiente(peticion);
};
