import { Inject, Injectable } from '@nestjs/common';
import { REPOSITORIO_ESTILO, type RepositorioEstilo } from '../puertos/repositorio-estilo.js';
import { PublicarEstilo } from './publicar-estilo.js';

/** Resultado de sembrar: `sembrado` con la versión creada, o `sembrado: false` si la base ya tenía alguna versión. */
export type ResultadoSembrarEstilo =
  | { readonly sembrado: true; readonly version: number }
  | { readonly sembrado: false };

/**
 * Semilla del estilo inicial (EST-D6): publica `texto` como versión 1 solo si `version_estilo` no tiene ninguna fila,
 * ni vigente ni retirada. Si el usuario ya publicó, restauró o retiró un estilo, no hace nada: la semilla nunca pisa
 * ni suma versiones a un estilo que alguien decidió. Reutiliza `PublicarEstilo` (validación AGT20, versión compartida);
 * la versión queda sin autor, como la que publica el comando. Nunca escribe el texto en logs (R14).
 */
@Injectable()
export class SembrarEstilo {
  constructor(
    @Inject(REPOSITORIO_ESTILO) private readonly repositorio: RepositorioEstilo,
    private readonly publicar: PublicarEstilo,
  ) {}

  async ejecutar(texto: string): Promise<ResultadoSembrarEstilo> {
    if ((await this.repositorio.leerVigente()) !== null) return { sembrado: false };
    if ((await this.repositorio.leerHistorial()).length > 0) return { sembrado: false };
    const resultado = await this.publicar.ejecutar(texto);
    if (!resultado.publicado) throw new Error(`el estilo inicial no es válido: ${resultado.motivo}`);
    return { sembrado: true, version: resultado.version };
  }
}
