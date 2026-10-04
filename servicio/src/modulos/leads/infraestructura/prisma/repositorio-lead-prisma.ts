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

  /**
   * Una transacción con el contacto bloqueado (`FOR UPDATE`) serializa a quienes avisan por el mismo
   * contacto; cada sentencia ve entonces lo que confirmó la anterior. Un solo `UPDATE ... WHERE NOT
   * EXISTS` no bastaba: bajo `READ COMMITTED` dos sentencias concurrentes verían la misma foto y
   * avisarían las dos (NTF2). El reloj es el `Clock` inyectado, no `now()` de SQL.
   */
  async marcarNotificado(lead: { id: string; contactoId: string }, ahora: Date, limite: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM contacto WHERE id = ${lead.contactoId}::uuid FOR UPDATE`;
      const marcados = await tx.$queryRaw<{ id: string }[]>`
        UPDATE lead SET notificado_en = ${ahora}, actualizado = ${ahora}
        WHERE id = ${lead.id}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM lead
            WHERE contacto_id = ${lead.contactoId}::uuid AND notificado_en > ${limite}
          )
        RETURNING id`;
      return marcados.length > 0;
    });
  }

  async desmarcarNotificado(id: string): Promise<void> {
    await this.prisma.lead.update({ where: { id }, data: { notificadoEn: null, actualizado: this.clock.ahora() } });
  }

  /**
   * `FOR UPDATE SKIP LOCKED` hace que dos barridos simultáneos reclamen leads distintos, nunca el mismo, y
   * la marca se escribe en la misma transacción que la selección (LDS5, D10).
   */
  async reclamarSinAtender(limite: Date, ahora: Date, maximo: number): Promise<Lead[]> {
    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM lead
        WHERE estado = 'nuevo'::estado_lead AND derivado AND recordatorio_en IS NULL
          AND notificado_en IS NOT NULL AND notificado_en < ${limite}
        ORDER BY notificado_en
        LIMIT ${maximo}
        FOR UPDATE SKIP LOCKED`;
      const ids = filas.map((fila) => fila.id);
      if (ids.length === 0) {
        return [];
      }
      await tx.lead.updateMany({ where: { id: { in: ids } }, data: { recordatorioEn: ahora, actualizado: ahora } });
      const reclamados = await tx.lead.findMany({ where: { id: { in: ids } }, orderBy: { notificadoEn: 'asc' } });
      return reclamados.map(aLead);
    });
  }

  async desmarcarRecordatorio(id: string): Promise<void> {
    await this.prisma.lead.update({ where: { id }, data: { recordatorioEn: null, actualizado: this.clock.ahora() } });
  }
}
