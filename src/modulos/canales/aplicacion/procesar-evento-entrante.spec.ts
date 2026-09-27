import { describe, expect, it } from 'vitest';
import type { EventoCanal } from '../dominio/evento-canal.js';
import type { ConsumidorEventosCanal } from '../puertos/consumidor-eventos-canal.js';
import type { RepositorioEventoEntrante, ResultadoRegistro } from '../puertos/repositorio-evento-entrante.js';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { ProcesarEventoEntrante } from './procesar-evento-entrante.js';
import { RegistroConsumidorEventosCanal } from './registro-consumidor-eventos-canal.js';

const EVENTO: EventoCanal = {
  v: 1,
  eventoProveedor: 'message_created',
  conversacion: { idExterno: '42', idContactoExterno: null, canal: 'whatsapp', canalProveedor: 'Channel::Whatsapp' },
  tipo: 'mensaje-entrante',
  idMensaje: '99',
  tipoContenido: 'texto',
};

/** Doble de {@link RepositorioEventoEntrante} que registra cada llamada para verificarlas. */
class RepositorioEventoEntranteFalso implements RepositorioEventoEntrante {
  readonly marcadosProcesados: { readonly id: string; readonly ahora: Date }[] = [];
  readonly marcadosMuertos: { readonly id: string; readonly error: string }[] = [];

  constructor(private readonly evento: EventoCanal | null = EVENTO) {}

  registrar(): Promise<ResultadoRegistro> {
    throw new Error('no usado por ProcesarEventoEntrante');
  }
  iniciarIntento(): Promise<EventoCanal | null> {
    return Promise.resolve(this.evento);
  }
  marcarProcesado(id: string, ahora: Date): Promise<void> {
    this.marcadosProcesados.push({ id, ahora });
    return Promise.resolve();
  }
  marcarMuerto(id: string, error: string): Promise<void> {
    this.marcadosMuertos.push({ id, error });
    return Promise.resolve();
  }
  listarPendientesAntesDe(): Promise<readonly string[]> {
    throw new Error('no usado por ProcesarEventoEntrante');
  }
}

/** Doble de {@link ConsumidorEventosCanal} cuyo resultado decide el test. */
class ConsumidorFalso implements ConsumidorEventosCanal {
  llamadas = 0;
  constructor(private readonly comportamiento: 'exito' | 'fallo') {}

  consumir(): Promise<void> {
    this.llamadas += 1;
    if (this.comportamiento === 'fallo') {
      throw new TypeError('fallo simulado del consumidor');
    }
    return Promise.resolve();
  }
}

function casoDeUso(
  repositorio: RepositorioEventoEntranteFalso,
  consumidor: ConsumidorFalso,
  clock: ClockFalso = new ClockFalso(new Date('2026-01-01T00:00:00Z')),
): ProcesarEventoEntrante {
  const registro = new RegistroConsumidorEventosCanal(consumidor);
  return new ProcesarEventoEntrante(repositorio, clock, registro);
}

describe('modulos/canales/aplicacion/ProcesarEventoEntrante (D7)', () => {
  it('un evento pendiente se consume y se marca procesado con la hora del CLOCK', async () => {
    const repositorio = new RepositorioEventoEntranteFalso();
    const consumidor = new ConsumidorFalso('exito');
    const clock = new ClockFalso(new Date('2026-02-02T10:00:00Z'));
    const caso = casoDeUso(repositorio, consumidor, clock);

    await caso.ejecutar('evento-1', false);

    expect(consumidor.llamadas).toBe(1);
    expect(repositorio.marcadosProcesados).toEqual([
      { id: 'evento-1', ahora: new Date('2026-02-02T10:00:00Z') },
    ]);
    expect(repositorio.marcadosMuertos).toEqual([]);
  });

  it('D7 — iniciarIntento null (ya procesada o muerta) termina sin llamar al consumidor', async () => {
    const repositorio = new RepositorioEventoEntranteFalso(null);
    const consumidor = new ConsumidorFalso('exito');
    const caso = casoDeUso(repositorio, consumidor);

    await caso.ejecutar('evento-2', false);

    expect(consumidor.llamadas).toBe(0);
    expect(repositorio.marcadosProcesados).toEqual([]);
  });

  it('un fallo del consumidor en un intento que no es el último no marca error y relanza', async () => {
    const repositorio = new RepositorioEventoEntranteFalso();
    const consumidor = new ConsumidorFalso('fallo');
    const caso = casoDeUso(repositorio, consumidor);

    await expect(caso.ejecutar('evento-3', false)).rejects.toThrow('fallo simulado del consumidor');

    expect(repositorio.marcadosMuertos).toEqual([]);
    expect(repositorio.marcadosProcesados).toEqual([]);
  });

  it('CAN4 — un fallo del consumidor en el último intento marca error con <Clase>, nunca el message libre', async () => {
    const repositorio = new RepositorioEventoEntranteFalso();
    const consumidor = new ConsumidorFalso('fallo');
    const caso = casoDeUso(repositorio, consumidor);

    await expect(caso.ejecutar('evento-4', true)).rejects.toThrow();

    expect(repositorio.marcadosMuertos).toEqual([{ id: 'evento-4', error: 'TypeError' }]);
    expect(repositorio.marcadosMuertos[0]?.error).not.toContain('fallo simulado del consumidor');
  });

  it('delega en el consumidor registrado a través de RegistroConsumidorEventosCanal, no en el de por defecto', async () => {
    const repositorio = new RepositorioEventoEntranteFalso();
    const porDefecto = new ConsumidorFalso('exito');
    const propio = new ConsumidorFalso('exito');
    const registro = new RegistroConsumidorEventosCanal(porDefecto);
    registro.registrar(propio);
    const caso = new ProcesarEventoEntrante(repositorio, new ClockFalso(), registro);

    await caso.ejecutar('evento-5', false);

    expect(propio.llamadas).toBe(1);
    expect(porDefecto.llamadas).toBe(0);
  });
});
