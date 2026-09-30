import { RepositorioLeadEnMemoria } from '../../../../test/fakes/repositorio-lead-en-memoria.js';
import { CompletarCaptura } from './completar-captura.js';
import { ObtenerCapturaPendiente } from './obtener-captura-pendiente.js';

// Escenarios LDS4 de `openspec/changes/fase-08-leads-handoff/specs/leads/spec.md`.

async function conLead(
  repositorio: RepositorioLeadEnMemoria,
  sobrescribir: Partial<Parameters<RepositorioLeadEnMemoria['crear']>[0]> = {},
) {
  return repositorio.crear({
    contactoId: 'contacto-1',
    conversacionId: 'conv-1',
    productoId: null,
    temperatura: 'caliente',
    senales: ['pide_pagar'],
    resumen: 'Quiere pagar',
    derivado: false,
    ...sobrescribir,
  });
}

describe('modulos/leads/aplicacion — captura fuera de horario (LDS4, D5)', () => {
  it('LDS4 — Un lead confirmado y no derivado está pendiente de captura', async () => {
    const repositorio = new RepositorioLeadEnMemoria();
    await conLead(repositorio);

    await expect(new ObtenerCapturaPendiente(repositorio).ejecutar('conv-1')).resolves.toBe(true);
  });

  it('una petición de persona fuera de horario también está pendiente de captura', async () => {
    const repositorio = new RepositorioLeadEnMemoria();
    await conLead(repositorio, { senales: ['pide_persona'] });

    await expect(new ObtenerCapturaPendiente(repositorio).ejecutar('conv-1')).resolves.toBe(true);
  });

  it('un lead que la escala no confirma no pide captura', async () => {
    const repositorio = new RepositorioLeadEnMemoria();
    await conLead(repositorio, { senales: ['pregunta_precio'] });

    await expect(new ObtenerCapturaPendiente(repositorio).ejecutar('conv-1')).resolves.toBe(false);
  });

  it('sin lead o con el lead ya derivado no hay captura pendiente', async () => {
    const repositorio = new RepositorioLeadEnMemoria();
    const consulta = new ObtenerCapturaPendiente(repositorio);
    await expect(consulta.ejecutar('conv-1')).resolves.toBe(false);

    await conLead(repositorio, { derivado: true });
    await expect(consulta.ejecutar('conv-1')).resolves.toBe(false);
  });

  it('LDS4 — Con los datos guardados el lead queda capturado y derivado', async () => {
    const repositorio = new RepositorioLeadEnMemoria();
    const lead = await conLead(repositorio);

    const resultado = await new CompletarCaptura(repositorio).ejecutar('conv-1');

    expect(resultado).toEqual({ leadId: lead.id });
    expect(repositorio.leads[0]).toMatchObject({ derivado: true, capturadoFueraHorario: true });
    await expect(new ObtenerCapturaPendiente(repositorio).ejecutar('conv-1')).resolves.toBe(false);
  });

  it('completar sin captura pendiente no hace nada', async () => {
    const repositorio = new RepositorioLeadEnMemoria();
    await conLead(repositorio, { senales: ['pregunta_precio'] });

    await expect(new CompletarCaptura(repositorio).ejecutar('conv-1')).resolves.toBeNull();
    expect(repositorio.leads[0]).toMatchObject({ derivado: false, capturadoFueraHorario: false });
  });

  it('completar dos veces no repite: la segunda no encuentra captura pendiente', async () => {
    const repositorio = new RepositorioLeadEnMemoria();
    await conLead(repositorio);
    const caso = new CompletarCaptura(repositorio);

    await caso.ejecutar('conv-1');

    await expect(caso.ejecutar('conv-1')).resolves.toBeNull();
  });
});
