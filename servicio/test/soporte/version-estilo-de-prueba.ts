import { VersionEstiloRedis } from '../../src/modulos/agente/infraestructura/redis/version-estilo-redis.js';
import { prefijoRedisDePrueba } from './infraestructura.js';

/**
 * Versión compartida del estilo con una clave propia del worker (`test:<id>:agente:prompt:version`): el Redis de prueba es
 * uno solo y la clave real es global, así que dos archivos que publican un estilo en paralelo se pisaban los contadores.
 */
export class VersionEstiloDePrueba extends VersionEstiloRedis {
  protected override readonly clave = `${prefijoRedisDePrueba()}agente:prompt:version`;

  get claveDePrueba(): string {
    return this.clave;
  }
}
