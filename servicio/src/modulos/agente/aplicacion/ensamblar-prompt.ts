import { Inject, Injectable } from '@nestjs/common';
import { CONSULTA_CASOS, lineaDeIndice, type ConsultaCasos } from '../../asistente/index.js';
import { ObtenerCatalogoCompacto } from '../../catalogo/index.js';
import { HORARIO, type Horario } from '../../horario/index.js';
import { CargadorPrompts } from '../infraestructura/prompts/cargador-prompts.js';
import { ProveedorEstilo } from './proveedor-estilo.js';

/** Instrucciones variables del turno (contexto inicial): siempre al final del prompt (AGT13). */
export interface EntradaPrompt {
  readonly instruccionesTurno: readonly string[];
}

export interface PromptEnsamblado {
  readonly texto: string;
  readonly version: string;
  /** Versión del estilo publicado (`0` = el archivo de respaldo): al log del turno, nunca su texto (AGT13). */
  readonly versionEstilo: number;
}

/**
 * Arma el prompt de sistema en el orden que fija AGT13 (D8 de la Fase 07b, D1 de la 08b): reglas no
 * negociables, estilo, el índice de casos de uso (título y «cuándo aplica», CAS8: sin sus textos ni precios), catálogo
 * compacto sin precios y, al final, la parte variable del turno (horario e
 * instrucciones del contexto inicial). El estilo lo entrega `ProveedorEstilo` (base con respaldo en archivo,
 * Fase 08c); `reglas` y `turno` siguen siendo archivos. Las cuatro primeras piezas no dependen de la conversación, así que el prefijo es idéntico entre turnos
 * mientras no cambie el catálogo y el proveedor puede cachearlo (ADR-0002). Las definiciones de las
 * herramientas viajan por el parámetro `tools` del LLM, no en este texto.
 */
@Injectable()
export class EnsamblarPrompt {
  constructor(
    private readonly cargador: CargadorPrompts,
    private readonly proveedorEstilo: ProveedorEstilo,
    private readonly catalogoCompacto: ObtenerCatalogoCompacto,
    @Inject(HORARIO) private readonly horario: Horario,
    @Inject(CONSULTA_CASOS) private readonly casos: ConsultaCasos,
  ) {}

  async ensamblar(entrada: EntradaPrompt): Promise<PromptEnsamblado> {
    const estilo = await this.proveedorEstilo.obtener();
    const indice = await this.casos.indice();
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
    const casos =
      indice.length === 0
        ? []
        : [
            '# Casos de uso\n\nConsulta un caso con `consultar_caso` solo cuando lo que pide el cliente coincida con su «cuándo aplica». ' +
              `Casos disponibles:\n\n${indice.map(lineaDeIndice).join('\n')}`,
          ];
    const texto = [this.cargador.reglas.trim(), estilo.texto.trim(), ...casos, `# Catálogo\n\n${catalogo}`, variable].join('\n\n');
    return { texto, version: this.cargador.version, versionEstilo: estilo.version };
  }
}
