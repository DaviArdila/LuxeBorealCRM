import type { Routes } from '@angular/router';
import type { obtenerSesionActual } from '../api/fn/auth/obtener-sesion-actual';
import type { RespuestaDe } from './tipos';

/** Rol del usuario, tal como lo documenta el contrato (`GET /api/v1/auth/yo`). */
export type Rol = RespuestaDe<typeof obtenerSesionActual>['rol'];

/** Una pantalla del menú: lleva a una ruta. Sin `icono` usa el del área. */
export interface EntradaDeRuta {
  readonly titulo: string;
  /** Ruta absoluta de la pantalla, p. ej. `/asistente/estilo`. */
  readonly ruta: string;
  readonly roles: readonly Rol[];
  /** Nombre del ícono de Material Symbols; el modo compacto lo muestra solo. */
  readonly icono?: string;
  readonly hijos?: undefined;
}

/** Un grupo desplegable de submódulos (SHL1): no navega, solo agrupa pantallas. */
export interface GrupoDeMenu {
  readonly titulo: string;
  readonly icono: string;
  readonly roles: readonly Rol[];
  readonly hijos: readonly EntradaDeRuta[];
  readonly ruta?: undefined;
}

export type EntradaDeMenu = EntradaDeRuta | GrupoDeMenu;

/**
 * Qué es un área del back office (D9): una funcionalidad de negocio con sus rutas, cargada en
 * diferido. El shell solo conoce esta forma; el menú y las rutas salen de aquí y del rol, y el
 * servidor sigue siendo quien decide el acceso de verdad (API7).
 */
export interface DefinicionArea {
  readonly id: string;
  readonly titulo: string;
  /** Nombre del ícono de Material Symbols, p. ej. `forum`. */
  readonly icono: string;
  readonly roles: readonly Rol[];
  readonly menu: readonly EntradaDeMenu[];
  readonly rutas: () => Promise<Routes>;
}
