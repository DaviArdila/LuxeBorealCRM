import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { guardarMensajeFijo } from '../../../api/fn/mensajes-fijos/guardar-mensaje-fijo';
import { listarMensajesFijos } from '../../../api/fn/mensajes-fijos/listar-mensajes-fijos';
import type { RespuestaDe } from '../../../nucleo/tipos';

export type MensajeFijo = RespuestaDe<typeof guardarMensajeFijo>;

/** Estado de la pantalla «Mensajes fijos» (D11): la lista que dijo el servidor, fila por fila. */
@Injectable()
export class MensajesFijosServicio {
  private readonly api = inject(Api);
  readonly mensajes = signal<readonly MensajeFijo[]>([]);

  async cargar(): Promise<void> {
    this.mensajes.set((await this.api.invoke(listarMensajesFijos)).mensajes);
  }

  /** Guarda el texto (el servidor lo valida) y reemplaza la fila con lo que devolvió. */
  async guardar(clave: string, texto: string): Promise<void> {
    const guardado = await this.api.invoke(guardarMensajeFijo, { clave, body: { texto } });
    this.mensajes.update((filas) => filas.map((fila) => (fila.clave === clave ? guardado : fila)));
  }
}
