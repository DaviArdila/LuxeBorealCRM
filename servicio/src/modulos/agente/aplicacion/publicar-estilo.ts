import { Inject, Injectable, Logger } from '@nestjs/common';
import { CLOCK } from '../../../plataforma/reloj/index.js';
import type { Clock } from '../../../plataforma/reloj/index.js';
import { validarEstilo } from '../dominio/validar-estilo.js';
import { REPOSITORIO_ESTILO, type AutorEstilo, type RepositorioEstilo } from '../puertos/repositorio-estilo.js';
import { VERSION_ESTILO, type VersionEstilo } from '../puertos/version-estilo.js';

/**
 * Por qué no se publicó (AGT23): `invalido` si el texto incumple AGT20; `version-inexistente` si se pidió restaurar
 * una versión que no está en el historial. Permite a la API responder `422` o `404` sin comparar textos.
 */
export type RazonNoPublicado = 'invalido' | 'version-inexistente';

/** Resultado de publicar o restaurar: la versión nueva, o el motivo (sin copiar el texto, R14). */
export type ResultadoPublicacion =
  | { readonly publicado: true; readonly version: number }
  | { readonly publicado: false; readonly motivo: string; readonly razon: RazonNoPublicado };

/**
 * Publica un estilo nuevo (AGT20, AGT21, D2 de la Fase 08c): valida, guarda de forma atómica (texto, historial y
 * versión) y después sube la versión compartida para que todos los procesos lean el nuevo. Si Redis falla tras
 * confirmar la base, el estilo ya está publicado: el TTL de respaldo de la copia en memoria alcanza a los demás
 * procesos y el resultado es éxito. `autor` es quien publica (EST-D3); sin él (el comando) la versión queda sin autor. Nunca escribe el texto en logs (R14).
 */
@Injectable()
export class PublicarEstilo {
  private readonly logger = new Logger(PublicarEstilo.name);

  constructor(
    @Inject(REPOSITORIO_ESTILO) private readonly repositorio: RepositorioEstilo,
    @Inject(VERSION_ESTILO) private readonly version: VersionEstilo,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async ejecutar(texto: string, autor?: AutorEstilo): Promise<ResultadoPublicacion> {
    const validacion = validarEstilo(texto);
    if (!validacion.valido) {
      return { publicado: false, motivo: validacion.motivo, razon: 'invalido' };
    }
    const version = await this.repositorio.publicar(texto, this.clock.ahora(), autor);
    try {
      await this.version.incrementar();
    } catch {
      this.logger.warn({ evento: 'agente.estilo-version-compartida-no-actualizada', version });
    }
    return { publicado: true, version };
  }
}
