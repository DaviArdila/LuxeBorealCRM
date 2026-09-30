import { Injectable } from '@nestjs/common';
import { ObtenerFichaProducto } from '../../../catalogo/index.js';
import { EvaluarPropuestaLead } from '../../../leads/index.js';
import type { ContextoHerramienta } from '../../dominio/herramienta.js';
import type { EvaluadorLead, PropuestaLead, ResultadoEvaluacionLead } from '../../puertos/evaluador-lead.js';

/**
 * Adaptador del puerto `EVALUADOR_LEAD` sobre el módulo `leads` (D2 de la Fase 08, ADR-0016): traduce la
 * propuesta del modelo a la entrada de `leads` con la conversación y el contacto del contexto del turno
 * (nunca de los argumentos, matriz de amenazas) y resuelve `id_producto` (id o SKU) al id real del
 * producto. Un producto que no se puede resolver no impide guardar el lead: queda sin producto.
 */
@Injectable()
export class EvaluadorLeadDeLeads implements EvaluadorLead {
  constructor(
    private readonly leads: EvaluarPropuestaLead,
    private readonly ficha: ObtenerFichaProducto,
  ) {}

  async evaluar(propuesta: PropuestaLead, ctx: ContextoHerramienta): Promise<ResultadoEvaluacionLead> {
    const resultado = await this.leads.ejecutar({
      conversacionId: ctx.sesion.conversacionId,
      contactoId: ctx.contactoId,
      temperatura: propuesta.temperatura,
      senales: propuesta.senales,
      resumen: propuesta.resumen,
      productoId: await this.idDelProducto(propuesta.productoId),
    });
    return {
      derivado: resultado.derivado,
      accion: resultado.accion,
      leadId: resultado.leadId,
      ...(resultado.motivo === undefined ? {} : { motivo: resultado.motivo }),
    };
  }

  private async idDelProducto(idOSku: string | null): Promise<string | null> {
    if (idOSku === null) {
      return null;
    }
    try {
      return (await this.ficha.ejecutar(idOSku)).id;
    } catch {
      return null;
    }
  }
}
