import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { listarHistorialEstilo } from '../../../api/fn/estilo/listar-historial-estilo';
import { obtenerEstilo } from '../../../api/fn/estilo/obtener-estilo';
import { publicarEstilo } from '../../../api/fn/estilo/publicar-estilo';
import { restaurarEstilo } from '../../../api/fn/estilo/restaurar-estilo';
import type { RespuestaDe } from '../../../nucleo/tipos';

export type EstiloVigente = RespuestaDe<typeof obtenerEstilo>;
export type VersionDelEstilo = RespuestaDe<typeof listarHistorialEstilo>['versiones'][number];

/** Estado de la pantalla «Estilo del bot» (D11): lo que dijo el servidor, sin store global. */
@Injectable()
export class EstiloServicio {
  private readonly api = inject(Api);
  readonly vigente = signal<EstiloVigente | null>(null);
  readonly historial = signal<readonly VersionDelEstilo[]>([]);

  async cargar(): Promise<void> {
    const [vigente, historial] = await Promise.all([
      this.api.invoke(obtenerEstilo),
      this.api.invoke(listarHistorialEstilo),
    ]);
    this.vigente.set(vigente);
    this.historial.set(historial.versiones);
  }

  /** Publica el texto; el servidor es quien lo valida (`422` con el motivo). */
  async publicar(texto: string): Promise<number> {
    return (await this.api.invoke(publicarEstilo, { body: { texto } })).version;
  }

  async restaurar(version: number): Promise<number> {
    return (await this.api.invoke(restaurarEstilo, { body: { version } })).version;
  }
}
