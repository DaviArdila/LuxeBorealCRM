import { Injectable, signal } from '@angular/core';

/** Avisos transversales que el shell muestra (hoy, solo el de permiso insuficiente, CLT5). */
@Injectable({ providedIn: 'root' })
export class AvisosServicio {
  readonly permisoInsuficiente = signal(false);

  descartarPermisoInsuficiente(): void {
    this.permisoInsuficiente.set(false);
  }
}
