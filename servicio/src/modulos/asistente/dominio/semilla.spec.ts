import { describe, expect, it } from 'vitest';
import { CASOS_DEL_SISTEMA, textoDeRespaldo } from './sistema.js';
import { planificarSemilla } from './semilla.js';

// CAS6 (Fase 12, T4): qué casos crea la semilla a partir de lo que ya hay en `parametro` y del código.

function filas(objeto: Record<string, unknown>): ReadonlyMap<string, unknown> {
  return new Map(Object.entries(objeto));
}

describe('planificarSemilla (CAS6)', () => {
  it('sin nada en parametro: once casos del sistema con su respaldo, en las categorías Sistema y Políticas', () => {
    const plan = planificarSemilla(filas({}));

    expect(plan.categorias.map((c) => [c.nombre, c.orden])).toEqual([
      ['Sistema', 0],
      ['Políticas', 1],
    ]);
    expect(plan.casos).toHaveLength(11);
    for (const definicion of CASOS_DEL_SISTEMA) {
      const caso = plan.casos.find((c) => c.claveSistema === definicion.clave);
      expect(caso?.texto, definicion.clave).toBe(textoDeRespaldo(definicion.clave));
      expect(caso?.claveParametro, definicion.clave).toBeNull();
    }
    expect(plan.casos.find((c) => c.claveSistema === 'contra_entrega')).toMatchObject({
      categoria: 'Políticas',
      disparador: 'intencion',
    });
    expect(plan.casos.find((c) => c.claveSistema === 'mensaje_handoff')).toMatchObject({
      categoria: 'Sistema',
      disparador: 'evento',
      modo: 'literal',
    });
  });

  it('CAS6 — Sembrar copia los textos que ya estaban editados', () => {
    const plan = planificarSemilla(filas({ mensaje_handoff: '  Texto propio del negocio.  ' }));

    const caso = plan.casos.find((c) => c.claveSistema === 'mensaje_handoff');
    expect(caso).toMatchObject({ texto: 'Texto propio del negocio.', claveParametro: 'mensaje_handoff' });
  });

  it('CAS6 — Un valor de parametro en blanco o que no es texto se ignora y rige el respaldo', () => {
    const plan = planificarSemilla(filas({ aviso_datos: '   ', mensaje_error_llm: 42 }));

    expect(plan.casos.find((c) => c.claveSistema === 'aviso_datos')).toMatchObject({
      texto: textoDeRespaldo('aviso_datos'),
      claveParametro: null,
    });
    expect(plan.casos.find((c) => c.claveSistema === 'mensaje_error_llm')?.texto).toBe(textoDeRespaldo('mensaje_error_llm'));
  });

  it('CAS6 — politica_contra_entrega alimenta el caso contra_entrega', () => {
    const plan = planificarSemilla(filas({ politica_contra_entrega: 'Pagas al recibir.' }));

    expect(plan.casos.find((c) => c.claveSistema === 'contra_entrega')).toMatchObject({
      texto: 'Pagas al recibir.',
      claveParametro: 'politica_contra_entrega',
    });
  });

  it('CAS6 — Sembrar convierte las políticas existentes en casos de intención', () => {
    const plan = planificarSemilla(
      filas({
        politica_devoluciones: 'Aceptamos devoluciones en ocho días.',
        politica_garantia: 'La garantía cubre defectos de fábrica.',
        politica_instalacion: 'La instalación va por cuenta del cliente.',
      }),
    );

    const politicas = plan.casos.filter((c) => c.claveSistema === null);
    expect(politicas.map((c) => [c.titulo, c.categoria, c.disparador, c.modo, c.claveParametro])).toEqual([
      ['Devoluciones', 'Políticas', 'intencion', 'literal', 'politica_devoluciones'],
      ['Garantía', 'Políticas', 'intencion', 'literal', 'politica_garantia'],
      ['Instalación', 'Políticas', 'intencion', 'literal', 'politica_instalacion'],
    ]);
    expect(politicas[1]?.cuandoAplica).toBe('Cuando el cliente pregunta por garantía.');
    expect(politicas[1]?.texto).toBe('La garantía cubre defectos de fábrica.');
  });

  it('un tema nuevo toma su título del nombre de la clave', () => {
    const plan = planificarSemilla(filas({ politica_medios_de_pago: 'Aceptamos transferencia.' }));

    expect(plan.casos.find((c) => c.claveParametro === 'politica_medios_de_pago')).toMatchObject({
      titulo: 'Medios de pago',
    });
  });

  it('una política con valor en blanco o que no es texto no crea un caso', () => {
    const plan = planificarSemilla(filas({ politica_vacia: ' ', politica_numero: 3 }));

    expect(plan.casos.filter((c) => c.claveSistema === null)).toEqual([]);
  });
});
