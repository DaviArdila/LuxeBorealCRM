import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { guardarGastoLlm } from '../../../api/fn/configuracion/guardar-gasto-llm';
import { obtenerGastoLlm } from '../../../api/fn/configuracion/obtener-gasto-llm';
import type { RespuestaDe } from '../../../nucleo/tipos';

export type GastoLlm = RespuestaDe<typeof obtenerGastoLlm>;

/** Estado de la pantalla «Gasto del LLM» (D11): lo que dijo el servidor, sin store global. */
@Injectable()
export class GastoLlmServicio {
  private readonly api = inject(Api);
  readonly gasto = signal<GastoLlm | null>(null);

  async cargar(): Promise<void> {
    this.gasto.set(await this.api.invoke(obtenerGastoLlm));
  }

  /** Solo el techo se escribe; el estado y el gasto del mes los guarda el sistema. */
  async guardar(techoMensualUsd: number): Promise<void> {
    this.gasto.set(await this.api.invoke(guardarGastoLlm, { body: { techoMensualUsd } }));
  }
}
