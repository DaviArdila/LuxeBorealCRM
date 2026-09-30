import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { CLOCK, type Clock } from '../../../../plataforma/reloj/index.js';
import type { DatosCapturados, RepositorioContactoAgente } from '../../puertos/repositorio-contacto-agente.js';

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
}
