import { VersionAsistenteRedis } from '../../src/modulos/asistente/infraestructura/redis/version-asistente-redis.js';
import { prefijoRedisDePrueba } from './infraestructura.js';

/**
 * Versión compartida de los casos con una clave propia del worker (`test:<id>:asistente:version`): el Redis de prueba es uno
 * solo y la clave real es global, así que dos archivos que escriben casos en paralelo se pisarían el contador.
 */
export class VersionAsistenteDePrueba extends VersionAsistenteRedis {
  protected override readonly clave = `${prefijoRedisDePrueba()}asistente:version`;

  get claveDePrueba(): string {
    return this.clave;
  }
}
