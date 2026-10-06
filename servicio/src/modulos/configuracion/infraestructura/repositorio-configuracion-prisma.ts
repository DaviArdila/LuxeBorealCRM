import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../plataforma/prisma/generado/client.js';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import { esClaveRegistrada, validarValorRegistrado } from '../dominio/registro.js';
import {
  ClaveFueraDelRegistro,
  type ExcepcionDeHorario,
  type ParametroGuardado,
  type RepositorioConfiguracion,
} from '../puertos/repositorio-configuracion.js';

/** `excepcion_horario.fecha` es `date`: se lee y se escribe como `AAAA-MM-DD` en UTC, sin corrimiento por zona horaria. */
function fechaComoTexto(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/**
 * Adaptador Prisma de {@link RepositorioConfiguracion}. Es la única puerta de escritura de `parametro` para la API: antes
 * de tocar la base valida que cada clave esté en el registro y que su valor tenga el tipo de su clave (CFG6).
 */
@Injectable()
export class RepositorioConfiguracionPrisma implements RepositorioConfiguracion {
  constructor(private readonly prisma: PrismaService) {}

  async leerParametro(clave: string): Promise<ParametroGuardado | null> {
    if (!esClaveRegistrada(clave)) throw new ClaveFueraDelRegistro(clave);
    const fila = await this.prisma.parametro.findUnique({ where: { clave } });
    return fila === null ? null : { valor: fila.valor, actualizado: fila.actualizado };
  }

  async guardarParametros(entradas: readonly { readonly clave: string; readonly valor: unknown }[], ahora: Date): Promise<void> {
    for (const { clave, valor } of entradas) {
      if (!esClaveRegistrada(clave) || !validarValorRegistrado(clave, valor)) throw new ClaveFueraDelRegistro(clave);
    }
    await this.prisma.$transaction(
      entradas.map(({ clave, valor }) =>
        this.prisma.parametro.upsert({
          where: { clave },
          create: { clave, valor: valor as Prisma.InputJsonValue, actualizado: ahora },
          update: { valor: valor as Prisma.InputJsonValue, actualizado: ahora },
        }),
      ),
    );
  }

  async listarExcepciones(): Promise<readonly ExcepcionDeHorario[]> {
    const filas = await this.prisma.excepcionHorario.findMany({ orderBy: { fecha: 'asc' } });
    return filas.map((fila) => ({ fecha: fechaComoTexto(fila.fecha), motivo: fila.motivo }));
  }

  async crearExcepcion(fecha: string, motivo: string | null): Promise<boolean> {
    const creadas = await this.prisma.excepcionHorario.createMany({ data: [{ fecha: new Date(`${fecha}T00:00:00.000Z`), motivo }], skipDuplicates: true });
    return creadas.count === 1;
  }

  async borrarExcepcion(fecha: string): Promise<boolean> {
    const borradas = await this.prisma.excepcionHorario.deleteMany({ where: { fecha: new Date(`${fecha}T00:00:00.000Z`) } });
    return borradas.count === 1;
  }
}
