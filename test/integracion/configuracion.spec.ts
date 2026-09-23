import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfiguracionModule } from '../../src/plataforma/config/index.js';

const VARIABLES_VALIDAS = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgresql://luxe:luxe@localhost:5435/luxeboreal',
  REDIS_URL: 'redis://localhost:6380',
  HEALTH_TIMEOUT_MS: '1500',
} as const;

function stubearVariables(variables: Readonly<Record<string, string | undefined>>): void {
  for (const [nombre, valor] of Object.entries(variables)) {
    vi.stubEnv(nombre, valor);
  }
}

describe('ConfiguracionModule (integración)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('PLT1 — La aplicación no arranca con configuración inválida o incompleta', async () => {
    stubearVariables({ ...VARIABLES_VALIDAS, DATABASE_URL: undefined });

    await expect(
      Test.createTestingModule({ imports: [ConfiguracionModule] }).compile(),
    ).rejects.toThrow();
  });

  it('el módulo raíz compila cuando la configuración es válida', async () => {
    stubearVariables(VARIABLES_VALIDAS);

    const modulo = await Test.createTestingModule({ imports: [ConfiguracionModule] }).compile();

    expect(modulo).toBeDefined();
    await modulo.close();
  });
});
