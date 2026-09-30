import { RepositorioLeadEnMemoria } from '../../../../test/fakes/repositorio-lead-en-memoria.js';
import { RegistrarPidePersona } from './registrar-pide-persona.js';

// LDS3 (R9): el lead de una petición explícita de persona, sin pasar por el LLM.

function crear(dentroDeHorario = true) {
  const repositorio = new RepositorioLeadEnMemoria();
  const horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  return { caso: new RegistrarPidePersona(repositorio, horario), repositorio };
}

const ENTRADA = { conversacionId: 'conv-1', contactoId: 'contacto-1' };

describe('modulos/leads/aplicacion — RegistrarPidePersona (LDS3, D6)', () => {
  it('LDS3 — Petición explícita de hablar con una persona: crea un lead derivado con la señal pide_persona', async () => {
    const { caso, repositorio } = crear();

    const resultado = await caso.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ accion: 'derivar' });
    expect(repositorio.leads).toHaveLength(1);
    expect(repositorio.leads[0]).toMatchObject({
      contactoId: 'contacto-1',
      conversacionId: 'conv-1',
      senales: ['pide_persona'],
      temperatura: 'caliente',
      derivado: true,
      estado: 'nuevo',
    });
    expect(repositorio.leads[0]?.resumen).toContain('persona');
  });

  it('LDS3 — Pedir una persona sin cobertura sigue derivando: no se consulta la cobertura', async () => {
    const { caso } = crear();

    await expect(caso.ejecutar(ENTRADA)).resolves.toMatchObject({ accion: 'derivar' });
  });

  it('actualiza el lead abierto de la conversación en vez de crear otro, y lo deja derivado', async () => {
    const { caso, repositorio } = crear();
    await repositorio.crear({
      contactoId: 'contacto-1',
      conversacionId: 'conv-1',
      productoId: 'prod-1',
      temperatura: 'tibio',
      senales: ['pregunta_precio'],
      resumen: 'Preguntó el precio',
      derivado: false,
    });

    const resultado = await caso.ejecutar(ENTRADA);

    expect(repositorio.leads).toHaveLength(1);
    expect(repositorio.leads[0]).toMatchObject({
      senales: ['pregunta_precio', 'pide_persona'],
      temperatura: 'caliente',
      productoId: 'prod-1',
      derivado: true,
    });
    expect(resultado.leadId).toBe(repositorio.leads[0]?.id);
  });

  it('pedir una persona dos veces no duplica la señal ni el lead', async () => {
    const { caso, repositorio } = crear();

    await caso.ejecutar(ENTRADA);
    await caso.ejecutar(ENTRADA);

    expect(repositorio.leads).toHaveLength(1);
    expect(repositorio.leads[0]?.senales).toEqual(['pide_persona']);
  });

  it('LDS4 — Fuera de horario no deriva: deja el lead pendiente de captura', async () => {
    const { caso, repositorio } = crear(false);

    const resultado = await caso.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ accion: 'capturar' });
    expect(repositorio.leads[0]).toMatchObject({ derivado: false, capturadoFueraHorario: false, senales: ['pide_persona'] });
  });
});
