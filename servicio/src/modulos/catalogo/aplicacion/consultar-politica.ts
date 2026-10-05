import { Inject, Injectable } from '@nestjs/common';
import { POLITICAS_POR_DEFECTO } from '../dominio/politica.js';
import { REPOSITORIO_POLITICA, type RepositorioPolitica } from '../puertos/repositorio-politica.js';

export type ResultadoPolitica =
  | { readonly encontrada: true; readonly texto: string }
  | { readonly encontrada: false; readonly temasDisponibles: readonly string[] };

/**
 * Caso de uso de consulta de políticas del negocio (CAT12). Devuelve el texto tal cual está
 * guardado, sin interpretarlo (R1, R2); si el tema no está configurado usa el texto de respaldo
 * (solo `contra_entrega` lo tiene) y, si tampoco existe, lista los temas disponibles sin inventar
 * ninguno. La Fase 07 lo expone como la herramienta `consultar_politica`.
 */
@Injectable()
export class ConsultarPolitica {
  constructor(@Inject(REPOSITORIO_POLITICA) private readonly repositorio: RepositorioPolitica) {}

  async ejecutar(tema: string): Promise<ResultadoPolitica> {
    const texto = (await this.repositorio.obtener(tema)) ?? POLITICAS_POR_DEFECTO[tema] ?? null;
    if (texto !== null) return { encontrada: true, texto };
    return { encontrada: false, temasDisponibles: await this.listarTemas() };
  }

  /** Unión ordenada y sin repetir de los temas configurados y los de respaldo. */
  async listarTemas(): Promise<string[]> {
    const configurados = await this.repositorio.listarTemas();
    return [...new Set([...configurados, ...Object.keys(POLITICAS_POR_DEFECTO)])].sort();
  }
}
