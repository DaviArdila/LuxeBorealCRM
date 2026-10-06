import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { borrarExcepcionHorario } from '../../../api/fn/configuracion/borrar-excepcion-horario';
import { crearExcepcionHorario } from '../../../api/fn/configuracion/crear-excepcion-horario';
import { guardarHorario } from '../../../api/fn/configuracion/guardar-horario';
import { obtenerHorario } from '../../../api/fn/configuracion/obtener-horario';
import type { RespuestaDe } from '../../../nucleo/tipos';

export type Horario = RespuestaDe<typeof obtenerHorario>;
export type DiasDelHorario = Horario['dias'];
export type Dia = keyof DiasDelHorario;

/** Estado de la pantalla «Horario» (D11): lo que dijo el servidor, sin store global. */
@Injectable()
export class HorarioServicio {
  private readonly api = inject(Api);
  readonly horario = signal<Horario | null>(null);

  async cargar(): Promise<void> {
    this.horario.set(await this.api.invoke(obtenerHorario));
  }

  /** Guarda los siete días (el servidor valida y responde `422` con el motivo) y muestra lo que devolvió. */
  async guardar(dias: DiasDelHorario): Promise<void> {
    this.horario.set(await this.api.invoke(guardarHorario, { body: { dias } }));
  }

  async agregarExcepcion(fecha: string, motivo: string | null): Promise<void> {
    await this.api.invoke(crearExcepcionHorario, { body: { fecha, motivo } });
    await this.cargar();
  }

  async quitarExcepcion(fecha: string): Promise<void> {
    await this.api.invoke(borrarExcepcionHorario, { fecha });
    await this.cargar();
  }
}
