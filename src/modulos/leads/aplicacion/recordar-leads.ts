import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION } from '../../../plataforma/config/index.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { EncolarAviso } from '../../notificaciones/index.js';
import { REPOSITORIO_LEAD, type RepositorioLead } from '../puertos/repositorio-lead.js';
import { ArmarDatosAvisoLead } from './armar-datos-aviso-lead.js';

const MS_POR_MINUTO = 60_000;
/** Tope por barrido: un aviso por lead, sin inundar el grupo si se acumularon muchos. */
const MAXIMO_POR_BARRIDO = 50;

/**
 * Recuerda al asesor los leads derivados que nadie atiende (D10 de la Fase 08, LDS5, P35): pasados
 * `LEADS_RECORDATORIO_MIN` minutos desde el aviso y aún en `nuevo`, encola **un** recordatorio y marca
 * `recordatorio_en`, así el barrido no lo repite. Es otro tipo de aviso: ignora la ventana de 24 h por
 * contacto. Un lead nunca avisado no se recuerda (no hay aviso que recordar). Si el encolado de uno falla,
 * se deshace su marca —el próximo barrido lo reintenta— y los demás siguen.
 */
@Injectable()
export class RecordarLeads {
  private readonly logger = new Logger(RecordarLeads.name);

  constructor(
    @Inject(REPOSITORIO_LEAD) private readonly repositorio: RepositorioLead,
    private readonly encolarAviso: EncolarAviso,
    private readonly armarDatos: ArmarDatosAvisoLead,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
  ) {}

  /** Devuelve cuántos recordatorios quedaron encolados. */
  async ejecutar(): Promise<number> {
    const ahora = this.clock.ahora();
    const limite = new Date(ahora.getTime() - this.configuracion.LEADS_RECORDATORIO_MIN * MS_POR_MINUTO);
    const leads = await this.repositorio.reclamarSinAtender(limite, ahora, MAXIMO_POR_BARRIDO);

    let encolados = 0;
    for (const lead of leads) {
      try {
        await this.encolarAviso.ejecutar({
          claveIdempotencia: `recordatorio:${lead.id}`,
          grupo: `lead:${lead.id}`,
          aviso: await this.armarDatos.ejecutar(lead, 'recordatorio'),
        });
        encolados += 1;
      } catch (error) {
        await this.repositorio.desmarcarRecordatorio(lead.id);
        this.logger.warn({
          evento: 'leads.recordatorio-fallo',
          error: error instanceof Error ? error.name : 'desconocido',
        });
      }
    }
    return encolados;
  }
}
