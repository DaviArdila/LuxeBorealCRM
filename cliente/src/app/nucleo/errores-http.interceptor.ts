import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { iniciarSesion } from '../api/fn/auth/iniciar-sesion';
import { obtenerSesionActual } from '../api/fn/auth/obtener-sesion-actual';
import { AvisosServicio } from './avisos.servicio';
import { SesionServicio } from './sesion.servicio';

/** Las llamadas de sesión manejan sus propios `401`: la pantalla y la guardia los interpretan. */
const RUTAS_DE_SESION = new Set<string>([iniciarSesion.PATH, obtenerSesionActual.PATH]);

/**
 * CLT5: un `401` de cualquier llamada lleva a `/entrar`; un `403` avisa de permiso insuficiente sin
 * cerrar la sesión.
 */
export const erroresHttpInterceptor: HttpInterceptorFn = (peticion, siguiente) => {
  const sesion = inject(SesionServicio);
  const router = inject(Router);
  const avisos = inject(AvisosServicio);
  return siguiente(peticion).pipe(
    tap({
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse)) return;
        if (error.status === 401 && !RUTAS_DE_SESION.has(peticion.url)) {
          sesion.expirar();
          void router.navigateByUrl('/entrar');
        } else if (error.status === 403) {
          avisos.permisoInsuficiente.set(true);
        }
      },
    }),
  );
};
