import { Logger } from '@nestjs/common';
import { RegistroObservadoresAviso, type EventoAviso } from './registro-observadores-aviso.js';

// CNV13: mismo patrón que el registro de handoff; además informa si algún observador falló para que
// `ProcesarTurno` pueda liberar la marca (CNV14).

const EVENTO: EventoAviso = { conversacionId: 'conv-1', contactoId: 'contacto-1', motivo: 'pide-asesor', version: 0 };

describe('modulos/conversaciones/aplicacion — RegistroObservadoresAviso', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CNV13 — avisa a todos los observadores en el orden de registro y responde que todo salió bien', async () => {
    const registro = new RegistroObservadoresAviso();
    const llamadas: string[] = [];
    registro.registrar({ alAvisarAsesor: () => Promise.resolve(void llamadas.push('a')) });
    registro.registrar({ alAvisarAsesor: () => Promise.resolve(void llamadas.push('b')) });

    await expect(registro.notificar(EVENTO)).resolves.toBe(true);

    expect(llamadas).toEqual(['a', 'b']);
  });

  it('CNV13 — un observador que lanza no frena a los demás y la notificación responde que falló', async () => {
    const registro = new RegistroObservadoresAviso();
    const llamadas: string[] = [];
    registro.registrar({ alAvisarAsesor: () => Promise.reject(new Error('Telegram caído con dato secreto')) });
    registro.registrar({ alAvisarAsesor: () => Promise.resolve(void llamadas.push('segundo')) });

    await expect(registro.notificar(EVENTO)).resolves.toBe(false);

    expect(llamadas).toEqual(['segundo']);
  });

  it('CNV13 — el warn de un observador fallido solo lleva el evento y el nombre del error (R14)', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const registro = new RegistroObservadoresAviso();
    registro.registrar({ alAvisarAsesor: () => Promise.reject(new Error('dato secreto')) });

    await registro.notificar(EVENTO);

    expect(JSON.stringify(aviso.mock.calls)).not.toContain('secreto');
    expect(aviso).toHaveBeenCalledWith({ evento: 'conversaciones.observador-aviso-fallo', error: 'Error' });
  });

  it('sin observadores no hace nada y responde que todo salió bien', async () => {
    await expect(new RegistroObservadoresAviso().notificar(EVENTO)).resolves.toBe(true);
  });
});
