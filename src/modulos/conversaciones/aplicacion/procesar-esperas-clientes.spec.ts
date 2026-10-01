import { describe, expect, it } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { MarcaEsperaClienteEnMemoria } from '../../../../test/fakes/marca-espera-cliente-en-memoria.js';
import type { Configuracion } from '../../../plataforma/config/index.js';
import type { Conversacion, RepositorioConversacion } from '../puertos/repositorio-conversacion.js';
import { ProcesarEsperasClientes } from './procesar-esperas-clientes.js';
import { RegistroObservadoresEspera, type EventoEsperaCliente } from './registro-observadores-espera.js';

// Escenarios NTF7 de `openspec/changes/fase-08d-avisos-con-enlace/specs/notificaciones/spec.md`.

const MIN = 60_000;
const T0 = new Date('2026-10-01T10:00:00Z');
const CONFIG = { ESPERA_CLIENTE_MIN: 10 } as Configuracion;

function conversacion(id: string, estado: Conversacion['estado'] = 'humano'): Conversacion {
  return {
    id,
    contactoId: `contacto-${id}`,
    chatwootConversationId: 42,
    canal: 'whatsapp',
    estado,
    expiraControlEn: null,
    version: 1,
  };
}

class RepositorioFalso {
  constructor(private readonly filas: Map<string, Conversacion>) {}
  obtenerPorId(id: string): Promise<Conversacion | null> {
    return Promise.resolve(this.filas.get(id) ?? null);
  }
}

function armar(filas: Conversacion[] = [conversacion('conv-1')]) {
  const marca = new MarcaEsperaClienteEnMemoria();
  const clock = new ClockFalso(T0);
  const registro = new RegistroObservadoresEspera();
  const eventos: EventoEsperaCliente[] = [];
  let fallar = false;
  registro.registrar({
    alEsperarCliente: (evento) => {
      if (fallar) return Promise.reject(new Error('outbox caído'));
      eventos.push(evento);
      return Promise.resolve();
    },
  });
  const repositorio = new RepositorioFalso(new Map(filas.map((c) => [c.id, c])));
  const caso = new ProcesarEsperasClientes(
    marca,
    repositorio as unknown as RepositorioConversacion,
    registro,
    clock,
    CONFIG,
  );
  return {
    caso,
    marca,
    clock,
    eventos,
    avanzar: (minutos: number) => clock.avanzar(minutos * MIN),
    hacerQueFalleElAviso: (valor: boolean) => {
      fallar = valor;
    },
  };
}

describe('ProcesarEsperasClientes (NTF7, D5 de la Fase 08d)', () => {
  it('NTF7 — el cliente escribe y nadie responde: tras 11 minutos se avisa con hace cuánto esperó', async () => {
    const { caso, marca, avanzar, eventos } = armar();
    await marca.registrar('conv-1', T0);
    avanzar(11);

    await expect(caso.ejecutar()).resolves.toBe(1);

    expect(eventos).toEqual([
      { conversacionId: 'conv-1', contactoId: 'contacto-conv-1', desde: T0, esperaMin: 11 },
    ]);
  });

  it('NTF7 — antes de cumplirse el tiempo no se avisa', async () => {
    const { caso, marca, avanzar, eventos } = armar();
    await marca.registrar('conv-1', T0);
    avanzar(9);

    await expect(caso.ejecutar()).resolves.toBe(0);

    expect(eventos).toEqual([]);
  });

  it('NTF7 — una respuesta del asesor cancela la espera: no se avisa', async () => {
    const { caso, marca, avanzar, eventos } = armar();
    await marca.registrar('conv-1', T0);
    avanzar(4);
    await marca.cerrar('conv-1'); // el eco humano cierra la espera (CNV12)
    avanzar(11);

    await expect(caso.ejecutar()).resolves.toBe(0);

    expect(eventos).toEqual([]);
  });

  it('NTF7 — una espera avisa una sola vez, aunque el barrido corra de nuevo y el cliente siga sin respuesta', async () => {
    const { caso, marca, avanzar, eventos } = armar();
    await marca.registrar('conv-1', T0);
    avanzar(11);

    await caso.ejecutar();
    avanzar(5);
    await marca.registrar('conv-1', new Date(T0.getTime() + 14 * MIN)); // un mensaje más del cliente
    await expect(caso.ejecutar()).resolves.toBe(0);

    expect(eventos).toHaveLength(1);
  });

  it('NTF7 — un mensaje nuevo tras responder el asesor abre otra espera que avisa de nuevo', async () => {
    const { caso, marca, avanzar, eventos } = armar();
    await marca.registrar('conv-1', T0);
    avanzar(11);
    await caso.ejecutar();

    await marca.cerrar('conv-1'); // un asesor respondió
    const segundoMensaje = new Date(T0.getTime() + 12 * MIN);
    await marca.registrar('conv-1', segundoMensaje);
    avanzar(12);
    await caso.ejecutar();

    expect(eventos).toHaveLength(2);
    expect(eventos[1]?.desde).toEqual(segundoMensaje);
  });

  it('NTF7 — una conversación que ya volvió a bot no avisa y su espera se descarta', async () => {
    const { caso, marca, avanzar, eventos } = armar([conversacion('conv-1', 'bot')]);
    await marca.registrar('conv-1', T0);
    avanzar(11);

    await expect(caso.ejecutar()).resolves.toBe(0);

    expect(eventos).toEqual([]);
    expect(marca.pendientes.has('conv-1')).toBe(false);
  });

  it('NTF7 — en handoff pendiente el cliente que espera también provoca el aviso', async () => {
    const { caso, marca, avanzar, eventos } = armar([conversacion('conv-1', 'handoff_pendiente')]);
    await marca.registrar('conv-1', T0);
    avanzar(11);

    await expect(caso.ejecutar()).resolves.toBe(1);

    expect(eventos).toHaveLength(1);
  });

  it('NTF7 — una conversación que ya no existe descarta su espera sin avisar', async () => {
    const { caso, marca, avanzar, eventos } = armar([]);
    await marca.registrar('fantasma', T0);
    avanzar(11);

    await expect(caso.ejecutar()).resolves.toBe(0);

    expect(eventos).toEqual([]);
    expect(marca.pendientes.has('fantasma')).toBe(false);
  });

  it('NTF4 — si el aviso no se pudo encolar, la espera se devuelve y el siguiente barrido reintenta', async () => {
    const { caso, marca, avanzar, eventos, hacerQueFalleElAviso } = armar();
    await marca.registrar('conv-1', T0);
    avanzar(11);
    hacerQueFalleElAviso(true);

    await expect(caso.ejecutar()).resolves.toBe(0);
    expect(marca.pendientes.get('conv-1')).toEqual(T0);

    hacerQueFalleElAviso(false);
    avanzar(1);
    await expect(caso.ejecutar()).resolves.toBe(1);
    expect(eventos).toHaveLength(1);
  });

  it('un lote avisa a cada conversación vencida, no a las que aún no cumplen el tiempo', async () => {
    const { caso, marca, avanzar, eventos } = armar([conversacion('a'), conversacion('b'), conversacion('c')]);
    await marca.registrar('a', T0);
    await marca.registrar('b', new Date(T0.getTime() + 2 * MIN));
    await marca.registrar('c', new Date(T0.getTime() + 9 * MIN));
    avanzar(12);

    await expect(caso.ejecutar()).resolves.toBe(2);

    expect(eventos.map((e) => e.conversacionId)).toEqual(['a', 'b']);
  });
});
