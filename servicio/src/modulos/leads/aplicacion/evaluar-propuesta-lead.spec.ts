import { RepositorioLeadEnMemoria } from '../../../../test/fakes/repositorio-lead-en-memoria.js';
import { EvaluarPropuestaLead, type EntradaPropuesta } from './evaluar-propuesta-lead.js';

// Escenarios LDS2 (y la decisión derivar/capturar de LDS4) de
// `openspec/changes/archive/2026-09-30-fase-08-leads-handoff/specs/leads/spec.md`.

const BASE: EntradaPropuesta = {
  conversacionId: 'conv-1',
  contactoId: 'contacto-1',
  temperatura: 'caliente',
  senales: ['pide_pagar'],
  resumen: 'Quiere el anillo Aurora',
  productoId: 'prod-1',
};

function crear(dentroDeHorario = true) {
  const repositorio = new RepositorioLeadEnMemoria();
  const horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  return { caso: new EvaluarPropuestaLead(repositorio, horario), repositorio };
}

describe('modulos/leads/aplicacion — EvaluarPropuestaLead', () => {
  it('LDS2 — La propuesta confirmada crea un lead derivado', async () => {
    const { caso, repositorio } = crear();

    const resultado = await caso.ejecutar(BASE);

    expect(resultado).toMatchObject({ derivado: true, accion: 'derivar' });
    expect(repositorio.leads).toHaveLength(1);
    expect(repositorio.leads[0]).toMatchObject({
      contactoId: 'contacto-1',
      conversacionId: 'conv-1',
      productoId: 'prod-1',
      temperatura: 'caliente',
      senales: ['pide_pagar'],
      derivado: true,
      estado: 'nuevo',
    });
    expect(resultado.leadId).toBe(repositorio.leads[0]?.id);
  });

  it('LDS2 — La propuesta no confirmada se guarda sin derivar', async () => {
    const { caso, repositorio } = crear();

    const resultado = await caso.ejecutar({ ...BASE, senales: ['pregunta_precio'] });

    expect(resultado).toMatchObject({ derivado: false, accion: 'ninguna' });
    expect(resultado.motivo).toContain('sigue atendiendo');
    expect(repositorio.leads[0]).toMatchObject({ derivado: false, temperatura: 'caliente' });
  });

  it('R9 — El LLM propone pero la escala determinista no confirma: la temperatura propuesta no decide', async () => {
    const { caso } = crear();

    const resultado = await caso.ejecutar({ ...BASE, temperatura: 'caliente', senales: [] });

    expect(resultado.derivado).toBe(false);
  });

  it('LDS2 — Una segunda propuesta actualiza el lead existente', async () => {
    const { caso, repositorio } = crear();
    await caso.ejecutar({ ...BASE, temperatura: 'tibio', senales: ['pregunta_precio'], productoId: null });

    const resultado = await caso.ejecutar({ ...BASE, temperatura: 'tibio', senales: ['pide_fotos'], productoId: 'prod-2' });

    expect(repositorio.leads).toHaveLength(1);
    expect(repositorio.leads[0]).toMatchObject({
      senales: ['pregunta_precio', 'pide_fotos'],
      productoId: 'prod-2',
      derivado: true,
    });
    expect(resultado).toMatchObject({ derivado: true, accion: 'derivar' });
  });

  it('la temperatura del lead solo sube: una propuesta tibia no enfría a un lead caliente', async () => {
    const { caso, repositorio } = crear();
    await caso.ejecutar({ ...BASE, senales: ['pregunta_precio'] });

    await caso.ejecutar({ ...BASE, temperatura: 'tibio', senales: ['pide_fotos'] });

    expect(repositorio.leads[0]?.temperatura).toBe('caliente');
  });

  it('LDS2 — Un lead ya derivado no se deriva otra vez', async () => {
    const { caso, repositorio } = crear();
    await caso.ejecutar(BASE);

    const resultado = await caso.ejecutar(BASE);

    expect(repositorio.leads).toHaveLength(1);
    expect(resultado).toMatchObject({ derivado: false, accion: 'ninguna' });
    expect(resultado.motivo).toContain('ya fue derivado');
  });

  it('LDS2 — El resumen no lleva datos personales', async () => {
    const { caso, repositorio } = crear();

    await caso.ejecutar({ ...BASE, resumen: 'Llamar al 3001234567 o laura@correo.com' });

    expect(repositorio.leads[0]?.resumen).toBe('Llamar al [dato omitido] o [dato omitido]');
  });

  it('las señales desconocidas no se guardan', async () => {
    const { caso, repositorio } = crear();

    await caso.ejecutar({ ...BASE, senales: ['pide_pagar', 'esta_emocionado'] });

    expect(repositorio.leads[0]?.senales).toEqual(['pide_pagar']);
  });

  it('LDS4 — Fuera de horario la propuesta confirmada no deriva: pide capturar los datos', async () => {
    const { caso, repositorio } = crear(false);

    const resultado = await caso.ejecutar(BASE);

    expect(resultado).toMatchObject({ derivado: false, accion: 'capturar' });
    expect(resultado.motivo).toMatch(/datos/);
    expect(repositorio.leads[0]).toMatchObject({ derivado: false, capturadoFueraHorario: false });
  });
});
