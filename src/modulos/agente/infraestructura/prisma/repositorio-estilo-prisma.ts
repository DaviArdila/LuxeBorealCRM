import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../plataforma/prisma/index.js';
import {
  MAX_VERSIONES_HISTORIAL,
  type EstiloGuardado,
  type RepositorioEstilo,
  type VersionHistorial,
} from '../../puertos/repositorio-estilo.js';

/** Claves de `parametro` del estilo editable (D1 de la Fase 08c). */
export const CLAVE_ESTILO = 'prompt_estilo';
export const CLAVE_ESTILO_VERSION = 'prompt_estilo_version';
export const CLAVE_ESTILO_HISTORIAL = 'prompt_estilo_historial';

function textoValido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.trim().length > 0;
}

function versionValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor > 0;
}

function aHistorial(valor: unknown): readonly VersionHistorial[] {
  if (!Array.isArray(valor)) {
    return [];
  }
  return valor.filter(
    (item): item is VersionHistorial =>
      typeof item === 'object' &&
      item !== null &&
      versionValida((item as VersionHistorial).version) &&
      typeof (item as VersionHistorial).texto === 'string' &&
      typeof (item as VersionHistorial).fecha === 'string',
  );
}

/**
 * Adaptador Prisma de {@link RepositorioEstilo} sobre `parametro` (ADR-0020). Una clave ausente, en blanco o con
 * un valor que no es texto devuelve `null` y nunca lanza: rige el archivo de respaldo (AGT18). Un estilo editado a
 * mano sin versión se lee como versión 1; un historial dañado se lee como vacío.
 */
@Injectable()
export class RepositorioEstiloPrisma implements RepositorioEstilo {
  constructor(private readonly prisma: PrismaService) {}

  async leerVigente(): Promise<EstiloGuardado | null> {
    const filas = await this.prisma.parametro.findMany({ where: { clave: { in: [CLAVE_ESTILO, CLAVE_ESTILO_VERSION] } } });
    const texto = filas.find((fila) => fila.clave === CLAVE_ESTILO)?.valor;
    if (!textoValido(texto)) {
      return null;
    }
    const version = filas.find((fila) => fila.clave === CLAVE_ESTILO_VERSION)?.valor;
    return { texto, version: versionValida(version) ? version : 1 };
  }

  async leerHistorial(): Promise<readonly VersionHistorial[]> {
    const fila = await this.prisma.parametro.findUnique({ where: { clave: CLAVE_ESTILO_HISTORIAL } });
    return aHistorial(fila?.valor);
  }

  /**
   * Una transacción con un candado consultivo serializa a quienes publican a la vez (si no, dos lecturas de la
   * misma versión pisarían el historial); como la primera publicación aún no tiene filas que bloquear, el candado
   * es por clave y no por fila. Escribe las tres claves o ninguna (D2).
   */
  async publicar(texto: string, fecha: Date): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${CLAVE_ESTILO}))`;
      const filas = await tx.parametro.findMany({
        where: { clave: { in: [CLAVE_ESTILO, CLAVE_ESTILO_VERSION, CLAVE_ESTILO_HISTORIAL] } },
      });
      const valorDe = (clave: string): unknown => filas.find((fila) => fila.clave === clave)?.valor;
      const textoActual = valorDe(CLAVE_ESTILO);
      const versionGuardada = valorDe(CLAVE_ESTILO_VERSION);
      const hayVigente = textoValido(textoActual);
      const versionActual = versionValida(versionGuardada) ? versionGuardada : hayVigente ? 1 : 0;
      const retirada: readonly VersionHistorial[] = hayVigente
        ? [{ version: versionActual, texto: textoActual, fecha: fecha.toISOString() }]
        : [];
      const historial = [...retirada, ...aHistorial(valorDe(CLAVE_ESTILO_HISTORIAL))].slice(0, MAX_VERSIONES_HISTORIAL);
      const nueva = versionActual + 1;

      const guardar = (clave: string, valor: string | number | { version: number; texto: string; fecha: string }[]) =>
        tx.parametro.upsert({
          where: { clave },
          create: { clave, valor, actualizado: fecha },
          update: { valor, actualizado: fecha },
        });
      await guardar(CLAVE_ESTILO, texto);
      await guardar(CLAVE_ESTILO_VERSION, nueva);
      await guardar(
        CLAVE_ESTILO_HISTORIAL,
        historial.map(({ version, texto: textoVersion, fecha: fechaVersion }) => ({ version, texto: textoVersion, fecha: fechaVersion })),
      );
      return nueva;
    });
  }
}
