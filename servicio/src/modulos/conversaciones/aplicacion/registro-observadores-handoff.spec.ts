import { Logger } from '@nestjs/common';
import { RegistroObservadoresHandoff, type EventoHandoff } from './registro-observadores-handoff.js';

// D7 de la Fase 08: los módulos de arriba (leads) se enteran de un handoff confirmado sin que
// `conversaciones` los importe. Un observador que falla no revierte el handoff ni frena a los demás.

const EVENTO: EventoHandoff = { conversacionId: 'conv-1', contactoId: 'contacto-1', motivo: 'tope-turnos', version: 0 };

describe('modulos/conversaciones/aplicacion — RegistroObservadoresHandoff (D7)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avisa a todos los observadores registrados, en el orden de registro', async () => {
    const registro = new RegistroObservadoresHandoff();
    const llamadas: string[] = [];
    registro.registrar({ alConfirmarHandoff: () => Promise.resolve(void llamadas.push('a')) });
    registro.registrar({ alConfirmarHandoff: () => Promise.resolve(void llamadas.push('b')) });

    await registro.notificar(EVENTO);

    expect(llamadas).toEqual(['a', 'b']);
  });

  it('un observador que lanza no impide a los demás ni hace fallar la notificación', async () => {
    const registro = new RegistroObservadoresHandoff();
    const llamadas: string[] = [];
    registro.registrar({ alConfirmarHandoff: () => Promise.reject(new Error('Telegram caído con dato secreto')) });
    registro.registrar({ alConfirmarHandoff: () => Promise.resolve(void llamadas.push('segundo')) });

    await expect(registro.notificar(EVENTO)).resolves.toBeUndefined();

    expect(llamadas).toEqual(['segundo']);
  });

  it('el aviso de un observador fallido solo lleva el evento y el nombre del error, nunca su mensaje (R14)', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const registro = new RegistroObservadoresHandoff();
    registro.registrar({ alConfirmarHandoff: () => Promise.reject(new Error('dato secreto')) });

    await registro.notificar(EVENTO);

    expect(JSON.stringify(aviso.mock.calls)).not.toContain('secreto');
    expect(aviso).toHaveBeenCalledWith({ evento: 'conversaciones.observador-handoff-fallo', error: 'Error' });
  });

  it('sin observadores no hace nada', async () => {
    await expect(new RegistroObservadoresHandoff().notificar(EVENTO)).resolves.toBeUndefined();
  });
});
