import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { CLOCK, type Clock } from '../../../../plataforma/reloj/index.js';
import type { CambiosLead, Lead, NuevoLead } from '../../dominio/lead.js';
import type { RepositorioLead } from '../../puertos/repositorio-lead.js';

interface FilaLead {
  readonly id: string;
  readonly contactoId: string;
  readonly conversacionId: string | null;
  readonly productoId: string | null;
  readonly temperatura: Lead['temperatura'];
  readonly senales: unknown;
  readonly resumen: string;
  readonly derivado: boolean;
  readonly capturadoFueraHorario: boolean;
  readonly estado: Lead['estado'];
  readonly notificadoEn: Date | null;
  readonly recordatorioEn: Date | null;
}

/** `senales` es jsonb (`string[]` validado al leer, `MODELO_DATOS.md` §5): lo que no es texto se descarta. */
function senalesDe(valor: unknown): readonly string[] {
  return Array.isArray(valor) ? valor.filter((elemento): elemento is string => typeof elemento === 'string') : [];
}

function aLead(fila: FilaLead): Lead {
  return {
    id: fila.id,
    contactoId: fila.contactoId,
    conversacionId: fila.conversacionId,
    productoId: fila.productoId,
    temperatura: fila.temperatura,
    senales: senalesDe(fila.senales),
    resumen: fila.resumen,
    derivado: fila.derivado,
    capturadoFueraHorario: fila.capturadoFueraHorario,
    estado: fila.estado,
    notificadoEn: fila.notificadoEn,
    recordatorioEn: fila.recordatorioEn,
  };
}

/** Adaptador Prisma de {@link RepositorioLead} sobre `lead` (D3 de la Fase 08). El reloj sale del `Clock`. */
@Injectable()
export class RepositorioLeadPrisma implements RepositorioLead {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async obtenerAbiertoDeConversacion(conversacionId: string): Promise<Lead | null> {
    const fila = await this.prisma.lead.findFirst({
      where: { conversacionId, estado: 'nuevo' },
      orderBy: { creado: 'desc' },
    });
    return fila === null ? null : aLead(fila);
  }

  async crear(nuevo: NuevoLead): Promise<Lead> {
    const fila = await this.prisma.lead.create({
      data: {
        contactoId: nuevo.contactoId,
        conversacionId: nuevo.conversacionId,
        productoId: nuevo.productoId,
        temperatura: nuevo.temperatura,
        senales: [...nuevo.senales],
        resumen: nuevo.resumen,
        derivado: nuevo.derivado,
        capturadoFueraHorario: false,
        estado: 'nuevo',
      },
    });
    return aLead(fila);
  }

  async actualizar(id: string, cambios: CambiosLead): Promise<Lead> {
    const fila = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(cambios.temperatura === undefined ? {} : { temperatura: cambios.temperatura }),
        ...(cambios.senales === undefined ? {} : { senales: [...cambios.senales] }),
        ...(cambios.resumen === undefined ? {} : { resumen: cambios.resumen }),
        ...(cambios.productoId === undefined ? {} : { productoId: cambios.productoId }),
        ...(cambios.derivado === undefined ? {} : { derivado: cambios.derivado }),
        ...(cambios.capturadoFueraHorario === undefined ? {} : { capturadoFueraHorario: cambios.capturadoFueraHorario }),
        actualizado: this.clock.ahora(),
      },
    });
    return aLead(fila);
  }
}
