import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import type { EstadoAtencion, OrigenTransicion } from '../../dominio/maquina-estados.js';
import type {
  CanalConversacion,
  Conversacion,
  RepositorioConversacion,
} from '../../puertos/repositorio-conversacion.js';

/** Código de Prisma para "violación de restricción única" (mismo criterio que `canales`, R4). */
const CODIGO_UNICO_VIOLADO = 'P2002';

function esViolacionDeUnico(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === CODIGO_UNICO_VIOLADO
  );
}

interface FilaConversacion {
  readonly id: string;
  readonly contactoId: string;
  readonly chatwootConversationId: number;
  readonly estado: EstadoAtencion;
  readonly expiraControlEn: Date | null;
  readonly version: number;
}

const ESTADOS_VENCIBLES: readonly EstadoAtencion[] = ['humano', 'handoff_pendiente'];

/**
 * Adaptador Prisma del puerto {@link RepositorioConversacion} (design.md D2). Nunca busca por
 * teléfono ni otro dato del contacto (P1): la única llave de búsqueda externa es
 * `chatwootConversationId`.
 */
@Injectable()
export class RepositorioConversacionPrisma implements RepositorioConversacion {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPorConversacionCanal(chatwootConversationId: number): Promise<Conversacion | null> {
    const fila = await this.prisma.conversacion.findUnique({ where: { chatwootConversationId } });
    return fila === null ? null : mapear(fila);
  }

  async obtenerPorId(id: string): Promise<Conversacion | null> {
    const fila = await this.prisma.conversacion.findUnique({ where: { id } });
    return fila === null ? null : mapear(fila);
  }

  async transicionar(
    id: string,
    versionLeida: number,
    destino: EstadoAtencion,
    origen: OrigenTransicion,
    expiraControlEn: Date | null,
    ahora: Date,
  ): Promise<Conversacion | null> {
    // `origen` no es una columna de `conversacion` (D2 de design.md): solo el dominio la valida.
    void origen;

    const filas = await this.prisma.$queryRaw<readonly FilaConversacion[]>`
      UPDATE conversacion
      SET estado = ${destino}::estado_atencion,
          expira_control_en = ${expiraControlEn},
          version = version + 1,
          actualizado = ${ahora}
      WHERE id = ${id}::uuid AND version = ${versionLeida}
      RETURNING
        id,
        contacto_id AS "contactoId",
        chatwoot_conversation_id AS "chatwootConversationId",
        estado,
        expira_control_en AS "expiraControlEn",
        version
    `;
    return filas[0] ?? null;
  }

  async obtenerOCrear(
    chatwootConversationId: number,
    idContactoExterno: string | null,
    canal: CanalConversacion,
  ): Promise<Conversacion> {
    const existente = await this.obtenerPorConversacionCanal(chatwootConversationId);
    if (existente !== null) return existente;

    const contacto =
      idContactoExterno !== null
        ? await this.prisma.contacto.upsert({
            where: { chatwootContactId: Number(idContactoExterno) },
            update: {},
            create: { chatwootContactId: Number(idContactoExterno) },
          })
        : await this.prisma.contacto.create({ data: {} });

    try {
      const fila = await this.prisma.conversacion.create({
        data: { contactoId: contacto.id, chatwootConversationId, canal, estado: 'bot' },
      });
      return mapear(fila);
    } catch (error) {
      if (!esViolacionDeUnico(error)) throw error;
      // Dos eventos casi simultáneos de la misma conversación nueva (D5): la segunda creación
      // pierde la carrera contra `chatwoot_conversation_id` único; releer es correcto y suficiente.
      const creadaPorOtro = await this.obtenerPorConversacionCanal(chatwootConversationId);
      if (creadaPorOtro === null) throw error;
      return creadaPorOtro;
    }
  }

  async listarVencidas(ahora: Date): Promise<readonly Conversacion[]> {
    const filas = await this.prisma.conversacion.findMany({
      where: { estado: { in: [...ESTADOS_VENCIBLES] }, expiraControlEn: { lte: ahora } },
    });
    return filas.map(mapear);
  }
}

function mapear(fila: {
  id: string;
  contactoId: string;
  chatwootConversationId: number;
  estado: string;
  expiraControlEn: Date | null;
  version: number;
}): Conversacion {
  return {
    id: fila.id,
    contactoId: fila.contactoId,
    chatwootConversationId: fila.chatwootConversationId,
    estado: fila.estado as EstadoAtencion,
    expiraControlEn: fila.expiraControlEn,
    version: fila.version,
  };
}
