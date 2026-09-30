import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { EncolarAviso } from '../../notificaciones/index.js';
import { REPOSITORIO_LEAD, type RepositorioLead } from '../puertos/repositorio-lead.js';

const MS_POR_HORA = 3_600_000;

/**
 * Avisa a los asesores de un lead derivado (D8 de la Fase 08, NTF1/NTF2): a lo sumo un aviso por contacto
 * dentro de `LEADS_VENTANA_NOTIFICACION_H`. La marca `notificado_en` es atómica en el repositorio; si el
 * encolado falla se deshace y el error sube, para que quien llama decida (mejor perder la marca que el
 * aviso). La clave de idempotencia lleva el instante de la marca: un mismo lead puede volver a avisarse
 * pasada la ventana sin que el outbox lo tome por un duplicado.
 */
@Injectable()
export class AvisarLead {
  constructor(
    @Inject(REPOSITORIO_LEAD) private readonly repositorio: RepositorioLead,
    private readonly encolarAviso: EncolarAviso,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  async ejecutar(conversacionId: string): Promise<'avisado' | 'omitido'> {
    const lead = await this.repositorio.obtenerAbiertoDeConversacion(conversacionId);
    if (lead === null || !lead.derivado) {
      return 'omitido';
    }

    const ahora = this.clock.ahora();
    const limite = new Date(ahora.getTime() - this.configuracion.LEADS_VENTANA_NOTIFICACION_H * MS_POR_HORA);
    if (!(await this.repositorio.marcarNotificado(lead, ahora, limite))) {
      return 'omitido';
    }

    try {
      await this.encolarAviso.ejecutar({
        claveIdempotencia: `aviso:${lead.id}:${ahora.getTime()}`,
        grupo: `lead:${lead.id}`,
        aviso: {
          tipo: 'lead',
          temperatura: lead.temperatura,
          senales: lead.senales,
          resumen: lead.resumen,
          capturadoFueraHorario: lead.capturadoFueraHorario,
        },
      });
    } catch (error) {
      await this.repositorio.desmarcarNotificado(lead.id);
      throw error;
    }
    return 'avisado';
  }
}
