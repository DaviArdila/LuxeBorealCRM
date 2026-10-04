import { describe, expect, it } from 'vitest';
import { RepositorioGeografiaEnMemoria } from '../../../../test/fakes/repositorio-geografia-en-memoria.js';
import { FuenteDivipolaInvalida } from '../dominio/geografia.js';
import { SembrarGeografia } from './sembrar-geografia.js';

const FUENTE_VALIDA = JSON.stringify([
  {
    cod_dpto: '05',
    dpto: 'ANTIOQUIA',
    cod_mpio: '05001',
    nom_mpio: 'MEDELLÍN',
    tipo_municipio: 'Municipio',
  },
]);

describe('SembrarGeografia (aplicación, T4)', () => {
  it('interpreta la fuente y guarda el catálogo a través del repositorio', async () => {
    const repositorio = new RepositorioGeografiaEnMemoria();
    const casoDeUso = new SembrarGeografia(repositorio);

    const resumen = await casoDeUso.ejecutar(FUENTE_VALIDA);

    expect(resumen.departamentos).toEqual({ insertados: 1, actualizados: 0, sinCambios: 0 });
    expect(resumen.ciudades).toEqual({ insertados: 1, actualizados: 0, sinCambios: 0 });
    expect(await repositorio.listarDepartamentos()).toEqual([
      { id: '05', nombre: 'ANTIOQUIA' },
    ]);
  });

  it('no escribe nada cuando la fuente es inválida', async () => {
    const repositorio = new RepositorioGeografiaEnMemoria();
    const casoDeUso = new SembrarGeografia(repositorio);

    await expect(casoDeUso.ejecutar('{esto no es json')).rejects.toThrow(FuenteDivipolaInvalida);
    expect(await repositorio.listarDepartamentos()).toEqual([]);
  });
});
