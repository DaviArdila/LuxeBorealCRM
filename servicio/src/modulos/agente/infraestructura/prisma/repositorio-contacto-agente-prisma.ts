import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { CLOCK, type Clock } from '../../../../plataforma/reloj/index.js';
import type {
  DatosCapturados,
  EstadoConsentimiento,
  RepositorioContactoAgente,
} from '../../puertos/repositorio-contacto-agente.js';

/** Adaptador Prisma de {@link RepositorioContactoAgente}: solo los campos de `contacto` que el agente toca (D6). */
@Injectable()
export class RepositorioContactoAgentePrisma implements RepositorioContactoAgente {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async leerNombre(contactoId: string): Promise<string | null> {
    const fila = await this.prisma.contacto.findUnique({ where: { id: contactoId }, select: { nombre: true } });
    return fila?.nombre ?? null;
  }

  async guardarDatosCapturados(contactoId: string, datos: DatosCapturados): Promise<void> {
    await this.prisma.contacto.update({
      where: { id: contactoId },
      data: {
        nombre: datos.nombre,
        telefonoAlterno: datos.telefonoAlterno,
        direccion: datos.direccion,
        localidad: datos.localidad,
        actualizado: this.clock.ahora(),
      },
    });
  }

  async consentimientoDe(contactoId: string): Promise<EstadoConsentimiento> {
    const fila = await this.prisma.contacto.findUnique({
      where: { id: contactoId },
      select: { consentimientoDatosEn: true, consentimientoRechazadoEn: true },
    });
    if (fila?.consentimientoDatosEn != null) return 'aceptado';
    if (fila?.consentimientoRechazadoEn != null) return 'rechazado';
    return 'pendiente';
  }

  /**
   * Un solo `UPDATE` por respuesta: así nunca existe, ni un instante, un contacto con las dos fechas (el `CHECK`
   * `[manual]` lo impediría) y repetir la misma respuesta conserva la fecha original con `COALESCE` (AGT25).
   */
  async registrarConsentimiento(contactoId: string, acepta: boolean): Promise<void> {
    const ahora = this.clock.ahora();
    const filas = acepta
      ? await this.prisma.$executeRaw`UPDATE contacto SET
          consentimiento_datos_en = COALESCE(consentimiento_datos_en, ${ahora}),
          consentimiento_rechazado_en = NULL,
          actualizado = ${ahora}
        WHERE id = ${contactoId}::uuid`
      : await this.prisma.$executeRaw`UPDATE contacto SET
          consentimiento_rechazado_en = COALESCE(consentimiento_rechazado_en, ${ahora}),
          consentimiento_datos_en = NULL,
          actualizado = ${ahora}
        WHERE id = ${contactoId}::uuid`;
    if (filas === 0) {
      throw new Error('contacto inexistente');
    }
  }
}
