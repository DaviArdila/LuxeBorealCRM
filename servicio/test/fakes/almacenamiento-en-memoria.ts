import {
  ObjetoNoEncontrado,
  type Almacenamiento,
  type ObjetoAlmacenado,
} from '../../src/modulos/medios/index.js';

/**
 * Doble en memoria del puerto `Almacenamiento` (MED1, MED10) para las pruebas que solo necesitan
 * "hay un objeto bajo esta clave" sin levantar MinIO (salida de imagen por outbox, e2e de la 07b).
 */
export class AlmacenamientoEnMemoria implements Almacenamiento {
  private readonly objetos = new Map<string, ObjetoAlmacenado>();

  guardar(clave: string, contenido: Buffer, contentType: string): Promise<void> {
    this.objetos.set(clave, { contenido, contentType });
    return Promise.resolve();
  }

  leer(clave: string): Promise<ObjetoAlmacenado> {
    const objeto = this.objetos.get(clave);
    return objeto === undefined ? Promise.reject(new ObjetoNoEncontrado(clave)) : Promise.resolve(objeto);
  }

  obtenerUrl(clave: string): Promise<string> {
    return Promise.resolve(`https://almacenamiento.prueba/${clave}`);
  }

  eliminar(clave: string): Promise<void> {
    this.objetos.delete(clave);
    return Promise.resolve();
  }
}
