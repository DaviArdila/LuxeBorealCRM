import { AgenteEco } from './agente-eco.js';

describe('modulos/conversaciones/aplicacion — AgenteEco', () => {
  it('CNV6 — El agente eco reenvía el texto del último mensaje del turno', async () => {
    const agente = new AgenteEco();

    const respuesta = await agente.generar([
      { idMensaje: '1', texto: 'primero' },
      { idMensaje: '2', texto: 'segundo' },
      { idMensaje: '3', texto: 'último mensaje del turno' },
    ]);

    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', texto: 'último mensaje del turno' }]);
  });

  it('con el turno vacío, responde con texto vacío en vez de lanzar', async () => {
    const agente = new AgenteEco();

    const respuesta = await agente.generar([]);

    expect(respuesta.pasos).toEqual([{ paso: 'eco-1', texto: '' }]);
  });
});
