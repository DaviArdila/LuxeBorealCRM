import { RepositorioParametroAgenteEnMemoria } from '../../../../test/fakes/repositorio-parametro-agente-en-memoria.js';
import { TextoHandoff } from './texto-handoff.js';

function crear(dentroDeHorario: boolean) {
  const parametros = new RepositorioParametroAgenteEnMemoria();
  parametros.textos.set('mensaje_handoff', 'Te paso con un asesor');
  parametros.textos.set('mensaje_handoff_fuera_horario', 'Te escribimos apenas abramos');
  const horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  return new TextoHandoff(horario, parametros);
}

describe('TextoHandoff', () => {
  it('dentro del horario de atención usa mensaje_handoff', async () => {
    expect(await crear(true).obtener()).toBe('Te paso con un asesor');
  });

  it('fuera del horario usa mensaje_handoff_fuera_horario', async () => {
    expect(await crear(false).obtener()).toBe('Te escribimos apenas abramos');
  });
});
