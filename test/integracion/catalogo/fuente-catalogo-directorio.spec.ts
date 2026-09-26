import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FuenteCatalogoDirectorio } from '../../../src/modulos/catalogo/infraestructura/fuente-catalogo-directorio.js';
import { PestanaNoDisponible } from '../../../src/modulos/catalogo/puertos/fuente-catalogo.js';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR_COMPLETO = join(AQUI, 'fixtures', 'fuente-catalogo-directorio');
const DIR_INCOMPLETO = join(AQUI, 'fixtures', 'fuente-catalogo-directorio-incompleto');

describe('FuenteCatalogoDirectorio (T4, integración — IMP1, IMP2)', () => {
  it('IMP1 — Leer desde un directorio local carga las cinco pestañas del catálogo', async () => {
    const fuente = new FuenteCatalogoDirectorio(DIR_COMPLETO);

    const productos = await fuente.leerPestana('productos');
    const tarifas = await fuente.leerPestana('tarifas');
    const cobertura = await fuente.leerPestana('cobertura');
    const parametros = await fuente.leerPestana('parametros');
    const excepciones = await fuente.leerPestana('excepciones_horario');

    expect(productos).toEqual([
      expect.objectContaining({ sku: 'SKU-0001', nombre: 'Alfombra clásica', precio: '89000' }),
    ]);
    expect(tarifas).toEqual([expect.objectContaining({ departamento: 'Antioquia', ciudad: 'Medellín' })]);
    expect(cobertura).toEqual([expect.objectContaining({ departamento: 'Amazonas', ciudad: '' })]);
    expect(parametros).toEqual([{ clave: 'recargo_contraentrega_pct', valor: '3' }]);
    expect(excepciones).toEqual([{ fecha: '2026-12-25', motivo: 'Festivo' }]);
  });

  it('IMP2 — Una pestaña inexistente falla con un error que la nombra', async () => {
    const fuente = new FuenteCatalogoDirectorio(DIR_INCOMPLETO);

    await expect(fuente.leerPestana('cobertura')).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(PestanaNoDisponible);
      const pestanaNoDisponible = error as PestanaNoDisponible;
      expect(pestanaNoDisponible.pestana).toBe('cobertura');
      expect(pestanaNoDisponible.motivo).toBe('inexistente');
      return true;
    });
  });
});
