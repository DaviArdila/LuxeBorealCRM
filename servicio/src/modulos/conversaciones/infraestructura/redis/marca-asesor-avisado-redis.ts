import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../../plataforma/config/index.js';
import { asegurarConexion, REDIS_CLIENTE, type ClienteRedis } from '../../../../plataforma/redis/index.js';
import type { MarcaAsesorAvisado, MotivoMarca } from '../../puertos/marca-asesor-avisado.js';

const MOTIVOS: readonly MotivoMarca[] = ['pide-persona', 'lead-caliente', 'audio-repetido'];

/**
 * TTL de respaldo (D3 de la Fase 12d): resiliencia técnica, no un dato del negocio. Una marca huérfana (una
 * conversación que nadie volvió a transicionar) no debe callar al asesor para siempre.
 */
const TTL_RESPALDO_S = 24 * 3600;

/**
 * Adaptador Redis de la marca «asesor avisado» (CNV14, D3 de la Fase 12d): una clave por conversación y motivo,
 * `SET … NX EX`, de valor fijo. Nunca guarda el contenido de un mensaje (R14). Las claves cuelgan de `COLAS_PREFIJO`,
 * que cada worker de pruebas ya aísla, y se arman en una sola función (preparado para multiempresa).
 */
@Injectable()
export class MarcaAsesorAvisadoRedis implements MarcaAsesorAvisado {
  private readonly prefijo: string;

  constructor(
    @Inject(REDIS_CLIENTE) private readonly redis: ClienteRedis,
    @Inject(CONFIGURACION) configuracion: Pick<Configuracion, 'COLAS_PREFIJO'>,
  ) {
    this.prefijo = configuracion.COLAS_PREFIJO;
  }

  private clave(conversacionId: string, motivo: MotivoMarca): string {
    return `${this.prefijo}:asesor-avisado:${conversacionId}:${motivo}`;
  }

  private claves(conversacionId: string): string[] {
    return MOTIVOS.map((motivo) => this.clave(conversacionId, motivo));
  }

  async adquirir(conversacionId: string, motivo: MotivoMarca): Promise<boolean> {
    await asegurarConexion(this.redis);
    const resultado = await this.redis.set(this.clave(conversacionId, motivo), '1', 'EX', TTL_RESPALDO_S, 'NX');
    return resultado === 'OK';
  }

  async liberar(conversacionId: string, motivo: MotivoMarca): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.del(this.clave(conversacionId, motivo));
  }

  async limpiar(conversacionId: string): Promise<void> {
    await asegurarConexion(this.redis);
    await this.redis.del(...this.claves(conversacionId));
  }

  async estaAvisado(conversacionId: string): Promise<boolean> {
    await asegurarConexion(this.redis);
    return (await this.redis.exists(...this.claves(conversacionId))) > 0;
  }
}
