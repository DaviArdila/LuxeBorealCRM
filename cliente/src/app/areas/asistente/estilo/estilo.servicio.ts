import { inject, Injectable, signal } from '@angular/core';
import { Api } from '../../../api/api';
import { crearSeccionEstilo } from '../../../api/fn/estilo/crear-seccion-estilo';
import { editarSeccionEstilo } from '../../../api/fn/estilo/editar-seccion-estilo';
import { listarHistorialEstilo } from '../../../api/fn/estilo/listar-historial-estilo';
import { listarSeccionesEstilo } from '../../../api/fn/estilo/listar-secciones-estilo';
import { obtenerEstilo } from '../../../api/fn/estilo/obtener-estilo';
import { ordenarSeccionesEstilo } from '../../../api/fn/estilo/ordenar-secciones-estilo';
import { restaurarEstilo } from '../../../api/fn/estilo/restaurar-estilo';
import type { RespuestaDe } from '../../../nucleo/tipos';

export type EstiloVigente = RespuestaDe<typeof obtenerEstilo>;
export type VersionDelEstilo = RespuestaDe<typeof listarHistorialEstilo>['versiones'][number];
export type SeccionDelEstilo = RespuestaDe<typeof editarSeccionEstilo>;
export type DatosNuevaSeccion = Parameters<typeof crearSeccionEstilo>[2]['body'];
export type CambiosDeSeccion = Parameters<typeof editarSeccionEstilo>[2]['body'];

/** Estado de la pantalla «Estilo del bot» (D11): lo que dijo el servidor, sin store global. */
@Injectable()
export class EstiloServicio {
  private readonly api = inject(Api);
  readonly vigente = signal<EstiloVigente | null>(null);
  readonly historial = signal<readonly VersionDelEstilo[]>([]);
  readonly secciones = signal<readonly SeccionDelEstilo[]>([]);
  /** Largo del texto compuesto con las secciones activas, y el tope que hace cumplir el servidor. */
  readonly caracteresCompuestos = signal(0);
  readonly maximo = signal(10000);

  async cargar(): Promise<void> {
    const [vigente, historial, secciones] = await Promise.all([
      this.api.invoke(obtenerEstilo),
      this.api.invoke(listarHistorialEstilo),
      this.api.invoke(listarSeccionesEstilo),
    ]);
    this.vigente.set(vigente);
    this.historial.set(historial.versiones);
    this.fijarSecciones(secciones);
  }

  async crear(datos: DatosNuevaSeccion): Promise<SeccionDelEstilo> {
    return this.api.invoke(crearSeccionEstilo, { body: datos });
  }

  /** Cambia una sección; `actualizado` es la marca de concurrencia con la que se leyó. */
  async editar(id: string, cambios: CambiosDeSeccion): Promise<SeccionDelEstilo> {
    return this.api.invoke(editarSeccionEstilo, { id, body: cambios });
  }

  /** Manda el orden completo de las secciones (activas e inactivas). */
  async ordenar(ids: readonly string[]): Promise<void> {
    this.fijarSecciones(await this.api.invoke(ordenarSeccionesEstilo, { body: { ids: [...ids] } }));
  }

  /** Muestra al instante el orden que se va a mandar; si el servidor lo rechaza, `cargar` devuelve el real. */
  aplicarOrden(ids: readonly string[]): void {
    const posicion = new Map(ids.map((id, indice) => [id, indice]));
    this.secciones.update((secciones) =>
      [...secciones].sort((a, b) => (posicion.get(a.id) ?? a.orden) - (posicion.get(b.id) ?? b.orden)),
    );
  }

  async restaurar(version: number): Promise<number> {
    return (await this.api.invoke(restaurarEstilo, { body: { version } })).version;
  }

  private fijarSecciones(respuesta: RespuestaDe<typeof listarSeccionesEstilo>): void {
    this.secciones.set([...respuesta.secciones].sort((a, b) => a.orden - b.orden));
    this.caracteresCompuestos.set(respuesta.caracteresCompuestos);
    this.maximo.set(respuesta.maximo);
  }
}
