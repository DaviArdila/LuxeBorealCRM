import { ContadoresSesionEnMemoria } from '../../../../../test/fakes/contadores-sesion-en-memoria.js';
import { TextosAsistenteEnMemoria } from '../../../../../test/fakes/textos-asistente-en-memoria.js';
import type { MensajeTurno, SolicitudTurno, TipoContenidoTurno } from '../../../conversaciones/index.js';
import { TextoHandoff } from '../texto-handoff.js';
import { PoliticaNoTextuales } from './politica-no-textuales.js';

const SESION = { conversacionId: 'conv-1', version: 3 };

function turno(...tipos: TipoContenidoTurno[]): SolicitudTurno {
  const mensajes: MensajeTurno[] = tipos.map((tipoContenido, i) => ({
    idMensaje: `m${String(i)}`,
    tipoContenido,
    texto: tipoContenido === 'texto' ? 'hola' : '',
  }));
  return {
    contexto: {
      conversacionId: SESION.conversacionId,
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version: SESION.version,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes,
  };
}

function crear(dentroDeHorario = true) {
  const contadores = new ContadoresSesionEnMemoria();
  const parametros = new TextosAsistenteEnMemoria();
  const horario = { estaDentroDeHorario: () => Promise.resolve(dentroDeHorario) };
  const politica = new PoliticaNoTextuales(contadores, parametros, new TextoHandoff(horario, parametros));
  return { politica, contadores, parametros };
}

function unTexto(texto: string) {
  return { pasos: [{ paso: expect.any(String) as string, tipo: 'texto' as const, texto }] };
}

describe('PoliticaNoTextuales', () => {
  it('R12 — Primer audio del cliente', async () => {
    const { politica } = crear();

    const decision = await politica.evaluar(turno('audio'));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: unTexto('[mensaje_pedir_texto_audio]'),
      cuentaTurno: true,
    });
  });

  it('R12 — Segundo audio consecutivo', async () => {
    const { politica } = crear();
    await politica.evaluar(turno('audio'));

    const decision = await politica.evaluar(turno('audio'));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: { ...unTexto('[mensaje_handoff]'), handoff: { motivo: 'audio-repetido' } },
      cuentaTurno: true,
    });
  });

  it('R12 — Segundo audio consecutivo fuera de horario usa el texto de handoff fuera de horario', async () => {
    const { politica } = crear(false);
    await politica.evaluar(turno('audio'));

    const decision = await politica.evaluar(turno('audio'));

    expect(decision).toMatchObject({
      respuesta: { ...unTexto('[mensaje_handoff_fuera_horario]'), handoff: { motivo: 'audio-repetido' } },
    });
  });

  it('R12 — Un texto entre dos audios reinicia la cuenta', async () => {
    const { politica } = crear();
    await politica.evaluar(turno('audio'));
    expect(await politica.evaluar(turno('texto'))).toEqual({ decision: 'seguir' });

    const decision = await politica.evaluar(turno('audio'));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: unTexto('[mensaje_pedir_texto_audio]'),
      cuentaTurno: true,
    });
  });

  it('R12 — Imagen entrante', async () => {
    const { politica } = crear();

    const decision = await politica.evaluar(turno('imagen'));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: unTexto('[mensaje_imagen_no_procesada]'),
      cuentaTurno: true,
    });
  });

  it.each<TipoContenidoTurno>(['sticker', 'documento', 'otro'])(
    'R12 — Tipo no manejado (%s): se ignora sin pasos y sin consumir turno',
    async (tipo) => {
      const { politica } = crear();

      const decision = await politica.evaluar(turno(tipo));

      expect(decision).toEqual({ decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false });
    },
  );

  it('R12 — Ráfaga con texto y audio sigue el flujo del texto', async () => {
    const { politica, contadores } = crear();

    const decision = await politica.evaluar(turno('texto', 'audio'));

    expect(decision).toEqual({ decision: 'seguir' });
    expect(contadores.audios(SESION)).toBe(0);
  });

  it('una ubicación sigue el flujo normal sin tocar la cuenta de audios', async () => {
    const { politica, contadores } = crear();
    await politica.evaluar(turno('audio'));

    expect(await politica.evaluar(turno('ubicacion'))).toEqual({ decision: 'seguir' });
    expect(contadores.audios(SESION)).toBe(1);
  });

  it('AGT3 — el texto que responde sale del repositorio de parámetros, no de la política', async () => {
    const { politica, parametros } = crear();
    parametros.textos.set('mensaje_pedir_texto_audio', 'Escríbeme por favor');

    const decision = await politica.evaluar(turno('audio'));

    expect(decision).toMatchObject({ respuesta: unTexto('Escríbeme por favor') });
  });
});
