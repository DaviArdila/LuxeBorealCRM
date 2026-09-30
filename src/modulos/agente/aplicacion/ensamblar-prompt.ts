import { Inject, Injectable } from '@nestjs/common';
import { ObtenerCatalogoCompacto } from '../../catalogo/index.js';
import { HORARIO, type Horario } from '../../horario/index.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';

/** Instrucciones variables del turno (contexto inicial): siempre al final del prompt (AGT13). */
export interface EntradaPrompt {
  readonly instruccionesTurno: readonly string[];
}

export interface PromptEnsamblado {
  readonly texto: string;
  readonly version: string;
}

/**
 * Arma el prompt de sistema en el orden que fija AGT13 (D8 de la Fase 07b): reglas, catálogo compacto
 * sin precios y, al final, la parte variable del turno (horario e instrucciones del contexto inicial).
 * Las dos primeras piezas no dependen de la conversación, así que el prefijo es idéntico entre turnos
 * mientras no cambie el catálogo y el proveedor puede cachearlo (ADR-0002). Las definiciones de las
 * herramientas viajan por el parámetro `tools` del LLM, no en este texto.
 */
@Injectable()
export class EnsamblarPrompt {
  constructor(
    private readonly cargador: CargadorPrompts,
    private readonly catalogoCompacto: ObtenerCatalogoCompacto,
    @Inject(HORARIO) private readonly horario: Horario,
  ) {}

  async ensamblar(entrada: EntradaPrompt): Promise<PromptEnsamblado> {
    const catalogo = await this.catalogoCompacto.ejecutar();
    const dentro = await this.horario.estaDentroDeHorario();
    const variable = this.cargador.turno
      .replace(
        '{{horario}}',
        dentro
          ? 'Ahora estamos dentro del horario de atención de los asesores.'
          : 'Ahora estamos fuera del horario de atención de los asesores.',
      )
      .replace('{{instrucciones}}', entrada.instruccionesTurno.join('\n'))
      .trim();
    const texto = [this.cargador.reglas.trim(), `# Catálogo\n\n${catalogo}`, variable].join('\n\n');
    return { texto, version: this.cargador.version };
  }
}
