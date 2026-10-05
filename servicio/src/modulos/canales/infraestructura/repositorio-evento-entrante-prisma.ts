import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../plataforma/prisma/index.js';
import type { EventoCanal } from '../dominio/evento-canal.js';
import type {
  NuevoEventoEntrante,
  RepositorioEventoEntrante,
  ResultadoRegistro,
} from '../puertos/repositorio-evento-entrante.js';

/** Código de Prisma para "violación de restricción única" (P2002, D5, R4). */
const CODIGO_UNICO_VIOLADO = 'P2002';

/**
 * Misma forma recursiva que Prisma exige para una columna `@db.JsonB` (`ValorJsonbAnidado` de
 * `repositorio-importacion-prisma.ts`, catálogo): se declara aquí en vez de importar el tipo del
 * cliente generado, para que este adaptador no dependa de rutas internas de `plataforma/prisma`
 * más allá de su barril (`PrismaService`) — regla de fronteras `sin-rutas-internas-de-plataforma`.
 * `EventoCanal` (D4) es en tiempo de ejecución un objeto plano serializable; este tipo solo
 * describe esa forma para que `create` acepte el valor sin recurrir a `any`. `EventoCanal` nunca
 * es `null` en la raíz (siempre un objeto), así que `ValorJsonbEscribible` excluye ese caso —
 * igual que la nota de `repositorio-importacion-prisma.ts`: Prisma exige el sentinel
 * `Prisma.JsonNull` para un `null` de raíz, no lo acepta como valor plano.
 */
type ValorJsonbAnidado =
  | string
  | number
  | boolean
  | null
  | { readonly [clave: string]: ValorJsonbAnidado }
  | readonly ValorJsonbAnidado[];
type ValorJsonbEscribible = Exclude<ValorJsonbAnidado, null>;

/**
 * Duck-typing en vez de `instanceof Prisma.PrismaClientKnownRequestError` (D5): la regla de
 * fronteras `sin-rutas-internas-de-plataforma` solo deja importar `plataforma/prisma/index.ts`
 * (que expone `PrismaService`, no el namespace `Prisma` del cliente generado) desde fuera de
 * `plataforma/prisma/`; comparar `.code` evita necesitar esa ruta interna.
 */
function esViolacionDeUnico(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === CODIGO_UNICO_VIOLADO
  );
}

/**
 * Adaptador Prisma del puerto {@link RepositorioEventoEntrante} (design.md D5, D7). `registrar`
 * traduce el `P2002` de `UNIQUE(origen, id_externo)` a `{ resultado: 'duplicado' }` en vez de
 * dejarlo propagar (R4): un evento reintentado por Chatwoot nunca ve un error 500.
 */
@Injectable()
export class RepositorioEventoEntrantePrisma implements RepositorioEventoEntrante {
  constructor(private readonly prisma: PrismaService) {}

  async registrar(evento: NuevoEventoEntrante): Promise<ResultadoRegistro> {
    try {
      const fila = await this.prisma.eventoEntrante.create({
        data: {
          origen: evento.origen,
          idExterno: evento.idExterno,
          payload: evento.payload as unknown as ValorJsonbEscribible,
        },
      });
      return { resultado: 'nuevo', id: fila.id };
    } catch (error) {
      if (esViolacionDeUnico(error)) {
        return { resultado: 'duplicado' };
      }
      throw error;
    }
  }

  async iniciarIntento(id: string): Promise<EventoCanal | null> {
    const filas = await this.prisma.$queryRaw<ReadonlyArray<{ payload: EventoCanal }>>`
      UPDATE evento_entrante
      SET intentos = intentos + 1
      WHERE id = ${id}::uuid AND procesado_en IS NULL AND error IS NULL
      RETURNING payload
    `;
    return filas[0]?.payload ?? null;
  }

  async marcarProcesado(id: string, ahora: Date): Promise<void> {
    await this.prisma.eventoEntrante.update({ where: { id }, data: { procesadoEn: ahora } });
  }

  async marcarMuerto(id: string, error: string): Promise<void> {
    await this.prisma.eventoEntrante.update({ where: { id }, data: { error } });
  }

  async listarPendientesAntesDe(limite: Date, maximo: number): Promise<readonly string[]> {
    const filas = await this.prisma.eventoEntrante.findMany({
      where: { procesadoEn: null, error: null, recibidoEn: { lt: limite } },
      take: maximo,
      select: { id: true },
      orderBy: { recibidoEn: 'asc' },
    });
    return filas.map((fila) => fila.id);
  }
}
