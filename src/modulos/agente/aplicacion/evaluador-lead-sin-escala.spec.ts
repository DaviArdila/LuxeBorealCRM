import type { EvaluadorLead } from '../puertos/evaluador-lead.js';
import { EvaluadorLeadSinEscala } from './evaluador-lead-sin-escala.js';

describe('modulos/agente/aplicacion — EvaluadorLeadSinEscala (D6)', () => {
  it('nunca deriva y da un motivo para el modelo', async () => {
    const resultado = await (new EvaluadorLeadSinEscala() as EvaluadorLead).evaluar(
      { temperatura: 'caliente', senales: ['pide pagar'], resumen: 'quiere el anillo', productoId: null },
      { sesion: { conversacionId: 'c', version: 0 }, contactoId: 'k', efectosPrevios: [] },
    );

    expect(resultado.derivado).toBe(false);
    expect(resultado.motivo).toContain('sigue atendiendo');
  });
});
