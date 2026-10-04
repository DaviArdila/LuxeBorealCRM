import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import { normalizarEmail, type Usuario, type UsuarioNuevo } from '../../dominio/usuario.js';
import type { RepositorioUsuario, ResultadoCrearUsuario } from '../../puertos/repositorio-usuario.js';

/** Código de Prisma para «violación de restricción única» (`usuario.email`). */
const CODIGO_UNICO_VIOLADO = 'P2002';

/** Por forma y no por clase, para no importar rutas internas de `plataforma/prisma` (regla de fronteras 6). */
function esCorreoRepetido(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === CODIGO_UNICO_VIOLADO
  );
}

const COLUMNAS = { id: true, email: true, nombre: true, passwordHash: true, rol: true, activo: true } as const;

/** Adaptador Prisma de {@link RepositorioUsuario} sobre `usuario` (sin cambio de esquema, design.md). */
@Injectable()
export class RepositorioUsuarioPrisma implements RepositorioUsuario {
  constructor(private readonly prisma: PrismaService) {}

  async buscarPorEmail(email: string): Promise<Usuario | null> {
    // El comando guarda el correo en minúsculas; `mode: insensitive` cubre además una fila escrita a mano.
    return this.prisma.usuario.findFirst({
      where: { email: { equals: normalizarEmail(email), mode: 'insensitive' } },
      select: COLUMNAS,
    });
  }

  async buscarPorId(id: string): Promise<Usuario | null> {
    return this.prisma.usuario.findUnique({ where: { id }, select: COLUMNAS });
  }

  async registrarAcceso(id: string, instante: Date): Promise<void> {
    // `actualizado` no tiene `@updatedAt` en el esquema: se escribe a mano con el mismo instante.
    await this.prisma.usuario.update({ where: { id }, data: { ultimoAcceso: instante, actualizado: instante } });
  }

  async crear(nuevo: UsuarioNuevo): Promise<ResultadoCrearUsuario> {
    try {
      const usuario = await this.prisma.usuario.create({ data: nuevo, select: COLUMNAS });
      return { creado: true, usuario };
    } catch (error) {
      if (esCorreoRepetido(error)) {
        return { creado: false, motivo: 'correo-repetido' };
      }
      throw error;
    }
  }
}
