import { Logger } from '@nestjs/common';
import type { EventoCanal } from '../dominio/evento-canal.js';
import type { ColaEventosEntrantes } from '../puertos/cola-eventos-entrantes.js';
import type { RepositorioEventoEntrante, ResultadoRegistro } from '../puertos/repositorio-evento-entrante.js';
import { RegistrarEventoEntrante } from './registrar-evento-entrante.js';

const EVENTO: EventoCanal = {
  v: 1,
  eventoProveedor: 'message_created',
  conversacion: { idExterno: '42', idContactoExterno: null, canal: 'whatsapp', canalProveedor: 'Channel::Whatsapp' },
  tipo: 'mensaje-entrante',
  idMensaje: '99',
  tipoContenido: 'texto',
};

/** Doble de {@link RepositorioEventoEntrante}: solo `registrar` importa a este caso de uso. */
class RepositorioEventoEntranteFalso implements RepositorioEventoEntrante {
  constructor(private readonly resultado: ResultadoRegistro) {}
  registrar(): Promise<ResultadoRegistro> {
    return Promise.resolve(this.resultado);
  }
  iniciarIntento(): Promise<EventoCanal | null> {
    throw new Error('no usado por RegistrarEventoEntrante');
  }
  marcarProcesado(): Promise<void> {
    throw new Error('no usado por RegistrarEventoEntrante');
  }
  marcarMuerto(): Promise<void> {
    throw new Error('no usado por RegistrarEventoEntrante');
  }
  listarPendientesAntesDe(): Promise<readonly string[]> {
    throw new Error('no usado por RegistrarEventoEntrante');
  }
}

/** Doble de {@link ColaEventosEntrantes} que resuelve, rechaza o cuelga a voluntad del test. */
class ColaEventosEntrantesFalsa implements ColaEventosEntrantes {
  llamadas: string[] = [];
  constructor(private readonly comportamiento: 'exito' | 'rechazo' | 'colgada') {}

  async encolar(id: string): Promise<void> {
    this.llamadas.push(id);
    if (this.comportamiento === 'exito') return;
    if (this.comportamiento === 'rechazo') throw new Error('Redis caído (simulado)');
    await new Promise<void>(() => {
      // Nunca resuelve: simula una cola más lenta que el tope de 200 ms.
    });
  }
}

describe('modulos/canales/aplicacion/RegistrarEventoEntrante (D5)', () => {
  it('R4 — un evento nuevo se registra, encola y responde "registrado"', async () => {
    const cola = new ColaEventosEntrantesFalsa('exito');
    const caso = new RegistrarEventoEntrante(
      new RepositorioEventoEntranteFalso({ resultado: 'nuevo', id: 'evento-1' }),
      cola,
    );

    const estado = await caso.ejecutar({ origen: 'chatwoot', idExterno: 'mensaje:99', payload: EVENTO });

    expect(estado).toBe('registrado');
    expect(cola.llamadas).toEqual(['evento-1']);
  });

  it('R4 — Reintento del proveedor sobre un evento entrante: un duplicado responde "duplicado" sin encolar', async () => {
    const cola = new ColaEventosEntrantesFalsa('exito');
    const caso = new RegistrarEventoEntrante(new RepositorioEventoEntranteFalso({ resultado: 'duplicado' }), cola);

    const estado = await caso.ejecutar({ origen: 'chatwoot', idExterno: 'mensaje:99', payload: EVENTO });

    expect(estado).toBe('duplicado');
    expect(cola.llamadas).toEqual([]);
  });

  it('D5 — un fallo al encolar se loguea sin PII y no impide responder "registrado"', async () => {
    const cola = new ColaEventosEntrantesFalsa('rechazo');
    // `RegistrarEventoEntrante` usa `Logger` de `@nestjs/common` sin DI (hallazgo de esta tarea
    // con `@nestjs/testing`, ver su TSDoc); se espía el método de instancia directamente.
    const espiaWarn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const caso = new RegistrarEventoEntrante(
      new RepositorioEventoEntranteFalso({ resultado: 'nuevo', id: 'evento-2' }),
      cola,
    );

    const estado = await caso.ejecutar({ origen: 'chatwoot', idExterno: 'mensaje:99', payload: EVENTO });

    expect(estado).toBe('registrado');
    // Espera a que el rechazo de `encolar` (una promesa ya en curso, D5) se propague al `.catch`
    // adjunto antes de comprobar el log, para no depender del orden exacto de microtasks.
    await new Promise((resolver) => setTimeout(resolver, 0));
    expect(espiaWarn).toHaveBeenCalledOnce();
    expect(JSON.stringify(espiaWarn.mock.calls)).not.toMatch(/texto|mensaje:99/);
    espiaWarn.mockRestore();
  });

  it('CAN1 — una cola más lenta que el tope de 200 ms no bloquea la respuesta "registrado"', async () => {
    const cola = new ColaEventosEntrantesFalsa('colgada');
    const caso = new RegistrarEventoEntrante(
      new RepositorioEventoEntranteFalso({ resultado: 'nuevo', id: 'evento-3' }),
      cola,
    );

    const inicio = performance.now();
    const estado = await caso.ejecutar({ origen: 'chatwoot', idExterno: 'mensaje:99', payload: EVENTO });
    const duracionMs = performance.now() - inicio;

    expect(estado).toBe('registrado');
    expect(duracionMs).toBeLessThan(500);
  });
});
