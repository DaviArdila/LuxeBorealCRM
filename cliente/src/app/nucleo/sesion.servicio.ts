import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../api/api';
import { cerrarSesion } from '../api/fn/auth/cerrar-sesion';
import { iniciarSesion } from '../api/fn/auth/iniciar-sesion';
import { obtenerSesionActual } from '../api/fn/auth/obtener-sesion-actual';
import type { RespuestaDe } from './tipos';

export type Usuario = RespuestaDe<typeof obtenerSesionActual>;

/**
 * Quién es el usuario según el servidor (CLT5). El cliente no guarda nada en el navegador: la sesión
 * es la cookie httpOnly y este servicio solo recuerda la respuesta de `/yo` mientras la pestaña vive.
 * `undefined` = todavía no se preguntó; `null` = no hay sesión.
 */
@Injectable({ providedIn: 'root' })
export class SesionServicio {
  private readonly api = inject(Api);
  readonly usuario = signal<Usuario | null | undefined>(undefined);

  /** Pregunta a `/yo` una sola vez; un `401` es «sin sesión», no un error. */
  async cargar(): Promise<void> {
    if (this.usuario() !== undefined) return;
    try {
      this.usuario.set(await this.api.invoke(obtenerSesionActual));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.usuario.set(null);
        return;
      }
      throw error;
    }
  }

  /** Rechaza con el error HTTP si el servidor no acepta las credenciales. */
  async iniciar(email: string, contrasena: string): Promise<void> {
    this.usuario.set(await this.api.invoke(iniciarSesion, { body: { email, contrasena } }));
  }

  /** Cierra en el servidor; aunque falle, el cliente deja de creerse con sesión. */
  async cerrar(): Promise<void> {
    try {
      await this.api.invoke(cerrarSesion);
    } finally {
      this.usuario.set(null);
    }
  }

  /** El servidor dijo `401` a mitad de uso: se olvida al usuario sin otra llamada. */
  expirar(): void {
    this.usuario.set(null);
  }
}
