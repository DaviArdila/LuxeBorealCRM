import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../plataforma/prisma/index.js';
import { RepositorioParametroCatalogoPrisma } from './repositorio-parametro-prisma.js';

function conValor(valor: unknown): RepositorioParametroCatalogoPrisma {
  const prisma = { parametro: { findUnique: () => Promise.resolve(valor === undefined ? null : { clave: 'factor_volumetrico', valor }) } };
  return new RepositorioParametroCatalogoPrisma(prisma as unknown as PrismaService);
}

afterEach(() => vi.restoreAllMocks());

describe('CFG6 — El catálogo lee el factor volumétrico con su valor por defecto', () => {
  it('CFG6 — Un valor del tipo equivocado rige el valor por defecto con un aviso sin el valor, sin lanzar', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(await conValor('cuatro mil').obtenerFactorVolumetrico()).toBe(4000);

    expect(aviso).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(aviso.mock.calls)).not.toContain('cuatro mil');
  });

  it('CFG6 — Un valor válido se usa sin avisos', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(await conValor(5000).obtenerFactorVolumetrico()).toBe(5000);
    expect(aviso).not.toHaveBeenCalled();
  });

  it('CFG6 — Sin fila rige el valor por defecto sin avisos', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    expect(await conValor(undefined).obtenerFactorVolumetrico()).toBe(4000);
    expect(aviso).not.toHaveBeenCalled();
  });
});
