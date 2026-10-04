import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SesionServicio, type Usuario } from './sesion.servicio';

/**
 * Sin sesión (según `/yo`) lleva a `/entrar` (CLT5). Es comodidad de interfaz: la protección real
 * es del servidor en cada llamada (API7).
 */
export const guardiaDeSesion: CanActivateFn = async () => {
  const sesion = inject(SesionServicio);
  const router = inject(Router);
  await sesion.cargar();
  return sesion.usuario() ? true : router.createUrlTree(['/entrar']);
};

/** Una ruta que el rol del usuario no puede usar lleva al inicio; el servidor sigue protegiéndola. */
export function guardiaDeRol(roles: readonly Usuario['rol'][]): CanActivateFn {
  return () => {
    const rol = inject(SesionServicio).usuario()?.rol;
    return rol !== undefined && roles.includes(rol) ? true : inject(Router).createUrlTree(['/']);
  };
}
