import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistroObservadoresEspera, type EventoEsperaCliente } from './registro-observadores-espera.js';

// Mismo patrón que `RegistroObservadoresHandoff` (D7 de la Fase 08), con una diferencia: aquí `notificar` dice si
// todos los observadores cumplieron, para que el barrido deshaga el reclamo y reintente (NTF7).

const EVENTO: EventoEsperaCliente = {
  conversacionId: 'conv-1',
  contactoId: 'contacto-1',
  desde: new Date('2026-10-01T10:00:00Z'),
  esperaMin: 11,
};

describe('modulos/conversaciones/aplicacion — RegistroObservadoresEspera (D5 de la Fase 08d)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('avisa a todos los observadores registrados, en orden, y devuelve true', async () => {
    const registro = new RegistroObservadoresEspera();
    const llamadas: string[] = [];
    registro.registrar({ alEsperarCliente: () => Promise.resolve(void llamadas.push('a')) });
    registro.registrar({ alEsperarCliente: () => Promise.resolve(void llamadas.push('b')) });

    await expect(registro.notificar(EVENTO)).resolves.toBe(true);

    expect(llamadas).toEqual(['a', 'b']);
  });

  it('un observador que lanza no frena a los demás y la notificación devuelve false', async () => {
    const registro = new RegistroObservadoresEspera();
    const llamadas: string[] = [];
    registro.registrar({ alEsperarCliente: () => Promise.reject(new Error('Telegram caído con dato secreto')) });
    registro.registrar({ alEsperarCliente: () => Promise.resolve(void llamadas.push('segundo')) });

    await expect(registro.notificar(EVENTO)).resolves.toBe(false);

    expect(llamadas).toEqual(['segundo']);
  });

  it('el aviso de un observador fallido solo lleva el evento y el nombre del error, nunca su mensaje (R14)', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const registro = new RegistroObservadoresEspera();
    registro.registrar({ alEsperarCliente: () => Promise.reject(new Error('dato secreto')) });

    await registro.notificar(EVENTO);

    expect(JSON.stringify(aviso.mock.calls)).not.toContain('secreto');
    expect(aviso).toHaveBeenCalledWith({ evento: 'conversaciones.observador-espera-fallo', error: 'Error' });
  });

  it('sin observadores no hace nada y devuelve true', async () => {
    await expect(new RegistroObservadoresEspera().notificar(EVENTO)).resolves.toBe(true);
  });
});
