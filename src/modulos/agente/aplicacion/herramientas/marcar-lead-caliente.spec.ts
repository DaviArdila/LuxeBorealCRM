import type { EfectoTurno } from '../../dominio/efectos.js';
import type { ContextoHerramienta } from '../../dominio/herramienta.js';
import type { EvaluadorLead, PropuestaLead } from '../../puertos/evaluador-lead.js';
import { EvaluadorLeadSinEscala } from '../evaluador-lead-sin-escala.js';
import { crearMarcarLeadCaliente } from './marcar-lead-caliente.js';

// Escenarios AGT11 de `openspec/changes/fase-07b-agente-llm-herramientas/specs/agente/spec.md`.

function contexto(efectosPrevios: readonly EfectoTurno[] = []): ContextoHerramienta {
  return { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'k', efectosPrevios };
}

const ARGUMENTOS = {
  temperatura: 'caliente',
  senales: ['pregunta por pago'],
  resumen: 'Quiere el anillo Aurora',
  id_producto: 'SKU-1',
} as const;

describe('modulos/agente/aplicacion/herramientas — marcar_lead_caliente', () => {
  it('AGT11 — Sin escala la propuesta no deriva', async () => {
    const resultado = await crearMarcarLeadCaliente(new EvaluadorLeadSinEscala()).ejecutar(ARGUMENTOS, contexto());

    expect(resultado.paraElModelo).toMatchObject({ derivado: false, motivo: expect.any(String) as unknown });
    expect(resultado.efectos).toEqual([{ tipo: 'lead-propuesto', temperatura: 'caliente' }]);
  });

  it('AGT11 — Sin cobertura no se evalúa el lead', async () => {
    let consultas = 0;
    const evaluador: EvaluadorLead = {
      evaluar: () => {
        consultas += 1;
        return Promise.resolve({ derivado: true });
      },
    };

    const resultado = await crearMarcarLeadCaliente(evaluador).ejecutar(ARGUMENTOS, contexto([{ tipo: 'sin-cobertura' }]));

    expect(resultado.paraElModelo).toMatchObject({ derivado: false });
    expect(consultas).toBe(0);
    expect(resultado.efectos).toEqual([]);
  });

  it('le pasa al evaluador la propuesta completa y su contexto', async () => {
    const propuestas: PropuestaLead[] = [];
    const evaluador: EvaluadorLead = {
      evaluar: (propuesta) => {
        propuestas.push(propuesta);
        return Promise.resolve({ derivado: true });
      },
    };

    const resultado = await crearMarcarLeadCaliente(evaluador).ejecutar({ ...ARGUMENTOS, id_producto: null }, contexto());

    expect(propuestas).toEqual([
      { temperatura: 'caliente', senales: ['pregunta por pago'], resumen: 'Quiere el anillo Aurora', productoId: null },
    ]);
    expect(resultado.paraElModelo).toEqual({ derivado: true });
  });

  it('su definición valida la temperatura y admite id_producto nulo', () => {
    const { definicion } = crearMarcarLeadCaliente(new EvaluadorLeadSinEscala());

    expect(definicion.nombre).toBe('marcar_lead_caliente');
    expect(definicion.esquema.safeParse({ ...ARGUMENTOS, id_producto: null }).success).toBe(true);
    expect(definicion.esquema.safeParse({ ...ARGUMENTOS, temperatura: 'helado' }).success).toBe(false);
  });
});
