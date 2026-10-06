import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { guardarConfiguracionEnvios } from '../../../api/fn/configuracion/guardar-configuracion-envios';
import { obtenerConfiguracionEnvios } from '../../../api/fn/configuracion/obtener-configuracion-envios';
import type { RespuestaDe } from '../../../nucleo/tipos';

export type Envios = RespuestaDe<typeof obtenerConfiguracionEnvios>;

/** Estado de la pantalla «Envíos» (D11): lo que dijo el servidor, sin store global. */
@Injectable()
export class EnviosServicio {
  private readonly api = inject(Api);
  readonly envios = signal<Envios | null>(null);

  async cargar(): Promise<void> {
    this.envios.set(await this.api.invoke(obtenerConfiguracionEnvios));
  }

  /** El servidor valida el rango de cada campo (`422` con el motivo) y devuelve lo guardado. */
  async guardar(recargoContraentregaPct: number, factorVolumetrico: number): Promise<void> {
    this.envios.set(await this.api.invoke(guardarConfiguracionEnvios, { body: { recargoContraentregaPct, factorVolumetrico } }));
  }
}
