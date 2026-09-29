import { describe, expect, it } from 'vitest';
import { POLITICA_CONTRAENTREGA_POR_DEFECTO } from '../dominio/politica.js';
import type { RepositorioPolitica } from '../puertos/repositorio-politica.js';
import { ConsultarPolitica } from './consultar-politica.js';

/** Doble en memoria de {@link RepositorioPolitica}: tema → texto. */
class RepositorioPoliticaFalso implements RepositorioPolitica {
  constructor(private readonly politicas: Readonly<Record<string, string>>) {}
  obtener(tema: string): Promise<string | null> {
    return Promise.resolve(this.politicas[tema] ?? null);
  }
  listarTemas(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.politicas));
  }
}

describe('ConsultarPolitica (CAT12)', () => {
  it('CAT12 — Una política configurada se devuelve tal cual', async () => {
    const caso = new ConsultarPolitica(new RepositorioPoliticaFalso({ devoluciones: 'Texto  exacto.' }));

    expect(await caso.ejecutar('devoluciones')).toEqual({ encontrada: true, texto: 'Texto  exacto.' });
  });

  it('CAT12 — La política de contra entrega sin configurar usa el texto aprobado por el negocio', async () => {
    const caso = new ConsultarPolitica(new RepositorioPoliticaFalso({}));

    expect(await caso.ejecutar('contra_entrega')).toEqual({ encontrada: true, texto: POLITICA_CONTRAENTREGA_POR_DEFECTO });
  });

  it('CAT12 — La política de contra entrega configurada reemplaza al texto de respaldo', async () => {
    const caso = new ConsultarPolitica(new RepositorioPoliticaFalso({ contra_entrega: 'Otro texto.' }));

    expect(await caso.ejecutar('contra_entrega')).toEqual({ encontrada: true, texto: 'Otro texto.' });
  });

  it('CAT12 — Un tema sin política devuelve los temas disponibles y no inventa texto', async () => {
    const caso = new ConsultarPolitica(new RepositorioPoliticaFalso({ devoluciones: 'x' }));

    expect(await caso.ejecutar('garantia')).toEqual({ encontrada: false, temasDisponibles: ['contra_entrega', 'devoluciones'] });
  });

  it('CAT12 — Los temas disponibles unen los configurados y los de respaldo sin repetirse', async () => {
    const caso = new ConsultarPolitica(new RepositorioPoliticaFalso({ devoluciones: 'x', contra_entrega: 'y' }));

    expect(await caso.listarTemas()).toEqual(['contra_entrega', 'devoluciones']);
  });
});
