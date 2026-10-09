import type { EfectoTurno } from '../../dominio/efectos.js';
import type { ContextoHerramienta } from '../../dominio/herramienta.js';
import type { EvaluadorLead, PropuestaLead, ResultadoEvaluacionLead } from '../../puertos/evaluador-lead.js';
import { crearMarcarLeadCaliente } from './marcar-lead-caliente.js';

// Escenarios AGT11 (modificado en la Fase 08) de
// `openspec/changes/archive/2026-09-30-fase-08-leads-handoff/specs/agente/spec.md`.

function contexto(efectosPrevios: readonly EfectoTurno[] = []): ContextoHerramienta {
  return { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'k', efectosPrevios };
}

const ARGUMENTOS = {
  temperatura: 'caliente',
  senales: ['pide_pagar'],
  resumen: 'Quiere el anillo Aurora',
  id_producto: 'SKU-1',
} as const;

function evaluador(resultado: ResultadoEvaluacionLead) {
  const propuestas: PropuestaLead[] = [];
  const doble: EvaluadorLead = {
    evaluar: (propuesta) => {
      propuestas.push(propuesta);
      return Promise.resolve(resultado);
    },
  };
  return { doble, propuestas };
}

describe('modulos/agente/aplicacion/herramientas — marcar_lead_caliente', () => {
  it('AGT11 — La propuesta confirmada por la escala avisa: el modelo recibe derivado true y queda el efecto avisar-asesor', async () => {
    const { doble } = evaluador({ derivado: true, accion: 'derivar', leadId: 'lead-1' });

    const resultado = await crearMarcarLeadCaliente(doble).ejecutar(ARGUMENTOS, contexto());

    expect(resultado.paraElModelo).toEqual({ derivado: true });
    expect(resultado.efectos).toEqual([{ tipo: 'avisar-asesor', motivo: 'lead-caliente' }]);
  });

  it('AGT11 — La propuesta que la escala no confirma no deriva y da un motivo al modelo', async () => {
    const { doble } = evaluador({ derivado: false, accion: 'ninguna', leadId: 'lead-1', motivo: 'sigue atendiendo' });

    const resultado = await crearMarcarLeadCaliente(doble).ejecutar({ ...ARGUMENTOS, senales: ['pregunta_precio'] }, contexto());

    expect(resultado.paraElModelo).toEqual({ derivado: false, motivo: 'sigue atendiendo' });
    expect(resultado.efectos).toEqual([{ tipo: 'lead-propuesto', temperatura: 'caliente' }]);
  });

  it('LDS4 — Fuera de horario el modelo recibe la instrucción de capturar los datos y el efecto de captura pendiente', async () => {
    const { doble } = evaluador({ derivado: false, accion: 'capturar', leadId: 'lead-2', motivo: 'pide los datos' });

    const resultado = await crearMarcarLeadCaliente(doble).ejecutar(ARGUMENTOS, contexto());

    expect(resultado.paraElModelo).toEqual({ derivado: false, motivo: 'pide los datos' });
    expect(resultado.efectos).toEqual([{ tipo: 'lead-propuesto', temperatura: 'caliente' }]);
  });

  it('AGT11 — Sin cobertura no se evalúa el lead', async () => {
    let consultas = 0;
    const doble: EvaluadorLead = {
      evaluar: () => {
        consultas += 1;
        return Promise.resolve({ derivado: true, accion: 'derivar', leadId: null });
      },
    };

    const resultado = await crearMarcarLeadCaliente(doble).ejecutar(ARGUMENTOS, contexto([{ tipo: 'sin-cobertura' }]));

    expect(resultado.paraElModelo).toMatchObject({ derivado: false });
    expect(consultas).toBe(0);
    expect(resultado.efectos).toEqual([]);
  });

  it('le pasa al evaluador la propuesta completa y su contexto', async () => {
    const { doble, propuestas } = evaluador({ derivado: false, accion: 'ninguna', leadId: null });

    await crearMarcarLeadCaliente(doble).ejecutar({ ...ARGUMENTOS, id_producto: null }, contexto());

    expect(propuestas).toEqual([
      { temperatura: 'caliente', senales: ['pide_pagar'], resumen: 'Quiere el anillo Aurora', productoId: null },
    ]);
  });

  it('su definición limita las señales al vocabulario cerrado (LDS1) y valida la temperatura', () => {
    const { definicion } = crearMarcarLeadCaliente(evaluador({ derivado: false, accion: 'ninguna', leadId: null }).doble);

    expect(definicion.nombre).toBe('marcar_lead_caliente');
    expect(definicion.esquema.safeParse({ ...ARGUMENTOS, id_producto: null }).success).toBe(true);
    expect(definicion.esquema.safeParse({ ...ARGUMENTOS, senales: ['esta_emocionado'] }).success).toBe(false);
    expect(definicion.esquema.safeParse({ ...ARGUMENTOS, temperatura: 'helado' }).success).toBe(false);
    expect(JSON.stringify(definicion.esquemaJson)).toContain('pide_pagar');
  });
});
