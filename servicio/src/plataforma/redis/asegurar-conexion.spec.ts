import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asegurarConexion, PLAZO_CONEXION_MS } from './asegurar-conexion.js';

/**
 * Cliente falso con la parte del contrato de `ioredis` que usa `asegurarConexion`: `status`,
 * `connect()` y los eventos `ready`/`error`/`end`. Como el `connect()` real, pasa a `connecting` de
 * forma síncrona y rechaza con "Redis is already connecting/connected" si ya está en curso
 * (`node_modules/ioredis/built/Redis.js`, `connect()`).
 */
class ClienteFalso extends EventEmitter {
  status: string;
  llamadasConnect = 0;

  constructor(estadoInicial: string) {
    super();
    this.status = estadoInicial;
  }

  connect(): Promise<void> {
    this.llamadasConnect += 1;
    if (this.status === 'connecting' || this.status === 'connect' || this.status === 'ready') {
      return Promise.reject(new Error('Redis is already connecting/connected'));
    }
    this.status = 'connecting';
    return new Promise((resolver, rechazar) => {
      const alListo = (): void => {
        this.off('error', alError);
        resolver();
      };
      const alError = (error: Error): void => {
        this.off('ready', alListo);
        rechazar(error);
      };
      this.once('ready', alListo);
      this.once('error', alError);
    });
  }

  /** Simula que el socket terminó de conectar. */
  quedarListo(): void {
    this.status = 'ready';
    this.emit('ready');
  }

  oyentesPendientes(): number {
    return this.listenerCount('ready') + this.listenerCount('error') + this.listenerCount('end');
  }
}

/** Deja correr las microtareas pendientes sin avanzar temporizadores. */
async function vaciarMicrotareas(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('asegurarConexion', () => {
  it('con el cliente ready no llama a connect', async () => {
    const cliente = new ClienteFalso('ready');

    await asegurarConexion(cliente);

    expect(cliente.llamadasConnect).toBe(0);
    expect(cliente.oyentesPendientes()).toBe(0);
  });

  it.each(['wait', 'close', 'end'])('con el cliente en %s llama a connect y espera el ready', async (estado) => {
    const cliente = new ClienteFalso(estado);
    let resuelta = false;

    const promesa = asegurarConexion(cliente).then(() => {
      resuelta = true;
    });
    await vaciarMicrotareas();
    expect(cliente.llamadasConnect).toBe(1);
    expect(resuelta).toBe(false);

    cliente.quedarListo();
    await promesa;

    expect(resuelta).toBe(true);
    expect(cliente.oyentesPendientes()).toBe(0);
  });

  it.each(['connecting', 'connect', 'reconnecting'])(
    'con el cliente en %s espera el ready sin volver a llamar a connect',
    async (estado) => {
      const cliente = new ClienteFalso(estado);
      let resuelta = false;

      const promesa = asegurarConexion(cliente).then(() => {
        resuelta = true;
      });
      await vaciarMicrotareas();
      expect(resuelta).toBe(false);

      cliente.quedarListo();
      await promesa;

      expect(resuelta).toBe(true);
      expect(cliente.llamadasConnect).toBe(0);
      expect(cliente.oyentesPendientes()).toBe(0);
    },
  );

  it('dos llamadas concurrentes sobre un cliente en wait conectan una sola vez y ambas esperan el ready', async () => {
    const cliente = new ClienteFalso('wait');

    const ambas = Promise.all([asegurarConexion(cliente), asegurarConexion(cliente)]);
    await vaciarMicrotareas();
    cliente.quedarListo();
    await ambas;

    expect(cliente.llamadasConnect).toBe(1);
    expect(cliente.oyentesPendientes()).toBe(0);
  });

  it('si connect rechaza porque otra llamada ya conecta, espera el ready en vez de fallar', async () => {
    const cliente = new ClienteFalso('wait');
    // Carrera entre la lectura de `status` y `connect()`: el cliente informa `wait` pero otra
    // llamada ya puso la conexión en curso.
    cliente.connect = vi.fn(() => {
      cliente.status = 'connecting';
      return Promise.reject(new Error('Redis is already connecting/connected'));
    });

    const promesa = asegurarConexion(cliente);
    await vaciarMicrotareas();
    cliente.quedarListo();

    await expect(promesa).resolves.toBeUndefined();
    expect(cliente.oyentesPendientes()).toBe(0);
  });

  it('rechaza si llega un error mientras espera el ready', async () => {
    const cliente = new ClienteFalso('connecting');

    const promesa = asegurarConexion(cliente);
    await vaciarMicrotareas();
    cliente.emit('error', new Error('ECONNREFUSED'));

    await expect(promesa).rejects.toThrow('ECONNREFUSED');
    expect(cliente.oyentesPendientes()).toBe(0);
  });

  it('rechaza si el cliente termina (end) mientras espera el ready', async () => {
    const cliente = new ClienteFalso('reconnecting');

    const promesa = asegurarConexion(cliente);
    await vaciarMicrotareas();
    cliente.status = 'end';
    cliente.emit('end');

    await expect(promesa).rejects.toThrow(/terminó/);
    expect(cliente.oyentesPendientes()).toBe(0);
  });

  it('rechaza al vencer el plazo si el ready nunca llega', async () => {
    vi.useFakeTimers();
    const cliente = new ClienteFalso('connecting');

    const promesa = asegurarConexion(cliente);
    const verificacion = expect(promesa).rejects.toThrow(/plazo/);
    await vi.advanceTimersByTimeAsync(PLAZO_CONEXION_MS);

    await verificacion;
    expect(cliente.oyentesPendientes()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('acepta un plazo propio', async () => {
    vi.useFakeTimers();
    const cliente = new ClienteFalso('connecting');

    const promesa = asegurarConexion(cliente, 50);
    const verificacion = expect(promesa).rejects.toThrow(/plazo/);
    await vi.advanceTimersByTimeAsync(50);

    await verificacion;
  });

  it('al resolver limpia el temporizador del plazo', async () => {
    vi.useFakeTimers();
    const cliente = new ClienteFalso('connecting');

    const promesa = asegurarConexion(cliente);
    await vaciarMicrotareas();
    cliente.quedarListo();
    await promesa;

    expect(vi.getTimerCount()).toBe(0);
  });
});
