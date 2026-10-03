import type { EsperaCliente, MarcaEsperaCliente } from '../../src/modulos/conversaciones/puertos/marca-espera-cliente.js';

/** Doble en memoria del puerto `MarcaEsperaCliente`: mismo contrato que el adaptador Redis, sin infraestructura. */
export class MarcaEsperaClienteEnMemoria implements MarcaEsperaCliente {
  readonly pendientes = new Map<string, Date>();
  readonly avisadas = new Set<string>();
  /** Para probar que un fallo del almacén no frena el mensaje ni la transición. */
  fallar = false;

  registrar(conversacionId: string, ahora: Date): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('redis caído'));
    if (!this.avisadas.has(conversacionId) && !this.pendientes.has(conversacionId)) {
      this.pendientes.set(conversacionId, ahora);
    }
    return Promise.resolve();
  }

  cerrar(conversacionId: string): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('redis caído'));
    this.pendientes.delete(conversacionId);
    this.avisadas.delete(conversacionId);
    return Promise.resolve();
  }

  vencidas(limite: Date, maximo: number): Promise<readonly EsperaCliente[]> {
    return Promise.resolve(
      [...this.pendientes.entries()]
        .filter(([, desde]) => desde.getTime() <= limite.getTime())
        .sort((a, b) => a[1].getTime() - b[1].getTime())
        .slice(0, maximo)
        .map(([conversacionId, desde]) => ({ conversacionId, desde })),
    );
  }

  reclamarAviso(conversacionId: string): Promise<boolean> {
    const eraPendiente = this.pendientes.delete(conversacionId);
    if (this.avisadas.has(conversacionId)) return Promise.resolve(false);
    this.avisadas.add(conversacionId);
    return Promise.resolve(eraPendiente);
  }

  devolverAviso(espera: EsperaCliente): Promise<void> {
    this.avisadas.delete(espera.conversacionId);
    if (!this.pendientes.has(espera.conversacionId)) this.pendientes.set(espera.conversacionId, espera.desde);
    return Promise.resolve();
  }
}
