import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONFIGURACION,
  ConfiguracionModule,
  type Configuracion,
} from '../../../src/plataforma/config/index.js';
import {
  GeografiaModule,
  REPOSITORIO_GEOGRAFIA,
  type RepositorioGeografia,
} from '../../../src/modulos/geografia/index.js';
import { urlPostgresDePrueba, urlRedisDePrueba } from '../../soporte/infraestructura.js';

let modulo: TestingModule | undefined;

afterEach(async () => {
  await modulo?.close();
  modulo = undefined;
});

async function crearRepositorio(): Promise<RepositorioGeografia> {
  const configuracionDePrueba: Configuracion = {
    NODE_ENV: 'test',
    PORT: 3000,
    LOG_LEVEL: 'silent',
    DATABASE_URL: urlPostgresDePrueba(),
    REDIS_URL: urlRedisDePrueba(),
    HEALTH_TIMEOUT_MS: 1500,
    DOCS_HABILITADO: false,
  };

  modulo = await Test.createTestingModule({
    imports: [ConfiguracionModule, GeografiaModule],
  })
    .overrideProvider(CONFIGURACION)
    .useValue(configuracionDePrueba)
    .compile();

  return modulo.get(REPOSITORIO_GEOGRAFIA);
}

describe('Repositorio de geografía (T3, integración)', () => {
  it('PER13 — listarDepartamentos devuelve los departamentos ordenados por id', async () => {
    const repositorio = await crearRepositorio();

    await repositorio.guardarCatalogo({
      departamentos: [
        { id: '20', nombre: 'Departamento veinte' },
        { id: '05', nombre: 'Departamento cinco' },
        { id: '11', nombre: 'Departamento once' },
      ],
      ciudades: [],
    });

    const departamentos = await repositorio.listarDepartamentos();
    const filtrados = departamentos.filter((departamento) =>
      ['05', '11', '20'].includes(departamento.id),
    );

    expect(filtrados.map((departamento) => departamento.id)).toEqual(['05', '11', '20']);
  });

  it('PER13 — listarCiudadesDe devuelve las ciudades de un departamento ordenadas por id', async () => {
    const repositorio = await crearRepositorio();

    await repositorio.guardarCatalogo({
      departamentos: [
        { id: '70', nombre: 'Departamento setenta' },
        { id: '71', nombre: 'Departamento setenta y uno' },
      ],
      ciudades: [
        { id: '71001', departamentoId: '71', nombre: 'Ciudad de otro departamento' },
        { id: '70002', departamentoId: '70', nombre: 'Ciudad B' },
        { id: '70001', departamentoId: '70', nombre: 'Ciudad A' },
      ],
    });

    const ciudades = await repositorio.listarCiudadesDe('70');

    expect(ciudades.map((ciudad) => ciudad.id)).toEqual(['70001', '70002']);
    expect(ciudades.every((ciudad) => ciudad.departamentoId === '70')).toBe(true);
  });

  it('PER13 — guardarCatalogo nunca borra un departamento o ciudad existente', async () => {
    const repositorio = await crearRepositorio();

    await repositorio.guardarCatalogo({
      departamentos: [{ id: '80', nombre: 'Departamento ochenta' }],
      ciudades: [{ id: '80001', departamentoId: '80', nombre: 'Ciudad de departamento ochenta' }],
    });

    await repositorio.guardarCatalogo({
      departamentos: [{ id: '81', nombre: 'Departamento ochenta y uno' }],
      ciudades: [],
    });

    const departamentos = await repositorio.listarDepartamentos();
    const ciudadesDe80 = await repositorio.listarCiudadesDe('80');

    expect(departamentos.map((departamento) => departamento.id)).toContain('80');
    expect(ciudadesDe80.map((ciudad) => ciudad.id)).toContain('80001');
  });
});
