import type {
  MarcaAsesorAvisado,
  MotivoMarca,
} from '../../src/modulos/conversaciones/puertos/marca-asesor-avisado.js';

/** Doble en memoria del puerto `MarcaAsesorAvisado`: mismo contrato que el adaptador Redis, sin infraestructura. */
export class MarcaAsesorAvisadoEnMemoria implements MarcaAsesorAvisado {
  readonly puestas = new Set<string>();
  /** Para probar que un fallo del almacén no pierde el aviso (CNV14). */
  fallar = false;

  private clave(conversacionId: string, motivo: MotivoMarca): string {
    return `${conversacionId}:${motivo}`;
  }

  adquirir(conversacionId: string, motivo: MotivoMarca): Promise<boolean> {
    if (this.fallar) return Promise.reject(new Error('redis caído'));
    const clave = this.clave(conversacionId, motivo);
    if (this.puestas.has(clave)) return Promise.resolve(false);
    this.puestas.add(clave);
    return Promise.resolve(true);
  }

  liberar(conversacionId: string, motivo: MotivoMarca): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('redis caído'));
    this.puestas.delete(this.clave(conversacionId, motivo));
    return Promise.resolve();
  }

  limpiar(conversacionId: string): Promise<void> {
    if (this.fallar) return Promise.reject(new Error('redis caído'));
    for (const clave of [...this.puestas]) {
      if (clave.startsWith(`${conversacionId}:`)) this.puestas.delete(clave);
    }
    return Promise.resolve();
  }

  estaAvisado(conversacionId: string): Promise<boolean> {
    if (this.fallar) return Promise.reject(new Error('redis caído'));
    return Promise.resolve([...this.puestas].some((clave) => clave.startsWith(`${conversacionId}:`)));
  }
}
