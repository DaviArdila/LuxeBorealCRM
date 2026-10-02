import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { FakePuertoLlm } from '../../../../test/fakes/puerto-llm-falso.js';
import { ErrorPasarelaLlm } from '../../llm/index.js';
import type { LlamadaHerramienta, LlamadaInvalida, LlmPort, RespuestaGeneracion, SolicitudGeneracion } from '../../llm/index.js';
import type { EfectoTurno } from '../dominio/efectos.js';
import type { Herramienta } from '../dominio/herramienta.js';
import { BucleHerramientas, type EntradaBucle } from './bucle-herramientas.js';
import { RegistroHerramientas } from './registro-herramientas.js';

// Escenarios AGT4, AGT5 y AGT6 de `openspec/changes/archive/2026-09-30-fase-07b-agente-llm-herramientas/specs/agente/spec.md`
// y R1 «El LLM necesita datos de un producto». El bucle se prueba con nombres inventados: no conoce
// ninguna de las siete herramientas reales (A4).

const INICIO = new Date('2026-09-30T12:00:00.000Z');
const CONFIG = { LOCK_TURNO_TTL_S: 30, AGENTE_MAX_VUELTAS: 5 };
const ENTRADA: EntradaBucle = {
  sesion: { conversacionId: 'conv-1', version: 0 },
  contactoId: 'contacto-1',
  systemPrompt: 'prompt',
  mensajes: [{ rol: 'usuario', texto: 'hola' }],
};

function herramienta(
  nombre: string,
  ejecutar: Herramienta['ejecutar'] = () => Promise.resolve({ paraElModelo: { ok: nombre }, efectos: [] }),
): Herramienta {
  return {
    definicion: {
      nombre,
      descripcion: `herramienta ${nombre}`,
      esquema: { safeParse: () => ({ success: true }) },
      esquemaJson: { type: 'object' },
    },
    ejecutar,
  };
}

function llamada(id: string, nombre: string, argumentos: unknown = {}): LlamadaHerramienta {
  return { id, nombre, argumentos };
}

function pideHerramientas(...llamadas: LlamadaHerramienta[]): { respuesta: RespuestaGeneracion } {
  return { respuesta: { llamadasHerramienta: llamadas } };
}

function texto(t: string): { respuesta: RespuestaGeneracion } {
  return { respuesta: { texto: t } };
}

function invalida(id: string, nombre: string): { respuesta: RespuestaGeneracion } {
  const llamadaInvalida: LlamadaInvalida = { llamada: llamada(id, nombre, { mal: true }), causa: 'ciudad: requerido' };
  return { respuesta: { llamadasInvalidas: [llamadaInvalida] } };
}

function crear(herramientas: readonly Herramienta[], config = CONFIG) {
  const llm = new FakePuertoLlm();
  const clock = new ClockFalso(INICIO);
  const bucle = new BucleHerramientas(llm, new RegistroHerramientas(herramientas), clock, config);
  return { llm, clock, bucle };
}

describe('modulos/agente/aplicacion — BucleHerramientas (AGT4)', () => {
  it('AGT4 — El modelo encadena herramientas y termina con texto', async () => {
    const orden: string[] = [];
    const { llm, bucle } = crear([
      herramienta('buscar', () => {
        orden.push('buscar');
        return Promise.resolve({ paraElModelo: { id: 'p1' }, efectos: [] });
      }),
      herramienta('ficha', () => {
        orden.push('ficha');
        return Promise.resolve({ paraElModelo: { nombre: 'Collar' }, efectos: [] });
      }),
    ]);
    llm.encolar(pideHerramientas(llamada('c1', 'buscar')), pideHerramientas(llamada('c2', 'ficha')), texto('Aquí va'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(orden).toEqual(['buscar', 'ficha']);
    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'Aquí va' });
    expect(llm.solicitudes).toHaveLength(3);
    const ultimo = llm.solicitudes[2]?.mensajes.at(-1);
    expect(ultimo?.resultadosHerramienta).toEqual([
      { idLlamada: 'c2', nombre: 'ficha', resultado: { nombre: 'Collar' }, esError: false },
    ]);
  });

  it('AGT4 — Los efectos de imagen se acumulan y el modelo solo recibe lo que la herramienta le dejó ver', async () => {
    const efecto: EfectoTurno = { tipo: 'enviar-imagen', claveObjeto: 'productos/p1/collage.jpg' };
    const { llm, bucle } = crear([
      herramienta('fotos', () => Promise.resolve({ paraElModelo: { enviadas: 1 }, efectos: [efecto] })),
    ]);
    llm.encolar(pideHerramientas(llamada('c1', 'fotos')), texto('Listo'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', efectos: [efecto] });
    const paraElModelo = llm.solicitudes[1]?.mensajes.at(-1)?.resultadosHerramienta?.[0]?.resultado;
    expect(paraElModelo).toEqual({ enviadas: 1 });
  });

  it('las herramientas ven los efectos que dejaron las anteriores del mismo turno', async () => {
    const vistos: (readonly EfectoTurno[])[] = [];
    const { llm, bucle } = crear([
      herramienta('primera', () => Promise.resolve({ paraElModelo: {}, efectos: [{ tipo: 'sin-cobertura', mensaje: 'm' }] })),
      herramienta('segunda', (_args, ctx) => {
        vistos.push(ctx.efectosPrevios);
        return Promise.resolve({ paraElModelo: {}, efectos: [] });
      }),
    ]);
    llm.encolar(pideHerramientas(llamada('c1', 'primera')), pideHerramientas(llamada('c2', 'segunda')), texto('ok'));

    await bucle.ejecutar(ENTRADA);

    expect(vistos).toEqual([[{ tipo: 'sin-cobertura', mensaje: 'm' }]]);
  });

  it('AGT4 — Una herramienta desconocida vuelve al modelo como error', async () => {
    const { llm, bucle } = crear([herramienta('buscar')]);
    llm.encolar(pideHerramientas(llamada('c1', 'inventada')), texto('sigo'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'sigo' });
    const devuelto = llm.solicitudes[1]?.mensajes.at(-1)?.resultadosHerramienta?.[0];
    expect(devuelto).toMatchObject({ idLlamada: 'c1', nombre: 'inventada', esError: true });
    expect(JSON.stringify(devuelto?.resultado)).toContain('inventada');
  });

  it('AGT4 — Dos llamadas inválidas en el mismo turno derivan a humano', async () => {
    const { llm, bucle } = crear([herramienta('cotizar')]);
    llm.encolar(invalida('c1', 'cotizar'), invalida('c2', 'cotizar'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toEqual({ tipo: 'derivar', motivo: 'argumentos-invalidos' });
    expect(llm.solicitudes).toHaveLength(2);
  });

  it('la primera llamada inválida solo se devuelve al modelo con la causa', async () => {
    const { llm, bucle } = crear([herramienta('cotizar')]);
    llm.encolar(invalida('c1', 'cotizar'), texto('corregido'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'corregido' });
    const devuelto = llm.solicitudes[1]?.mensajes.at(-1)?.resultadosHerramienta?.[0];
    expect(devuelto).toMatchObject({ idLlamada: 'c1', nombre: 'cotizar', esError: true });
    expect(JSON.stringify(devuelto?.resultado)).toContain('ciudad: requerido');
  });

  it('una herramienta que lanza se devuelve al modelo como error y el turno continúa', async () => {
    const { llm, bucle } = crear([herramienta('rota', () => Promise.reject(new Error('base caída con dato secreto')))]);
    llm.encolar(pideHerramientas(llamada('c1', 'rota')), texto('sigo'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'sigo' });
    const devuelto = llm.solicitudes[1]?.mensajes.at(-1)?.resultadosHerramienta?.[0];
    expect(devuelto?.esError).toBe(true);
    expect(JSON.stringify(devuelto?.resultado)).not.toContain('secreto');
  });

  it('R1 — El LLM necesita datos de un producto: solo recibe las herramientas registradas', async () => {
    const { llm, bucle } = crear([herramienta('buscar'), herramienta('ficha')]);
    llm.encolar(texto('hola'));

    await bucle.ejecutar(ENTRADA);

    const solicitud = llm.solicitudes[0];
    expect(solicitud?.perfil).toBe('conversacion');
    expect(solicitud?.herramientas?.map((definicion) => definicion.nombre)).toEqual(['buscar', 'ficha']);
    expect(solicitud?.systemPrompt).toBe('prompt');
    expect(solicitud?.conversacionId).toBe('conv-1');
  });

  it('un texto final vacío no se envía: deriva como fallo del LLM', async () => {
    const { llm, bucle } = crear([herramienta('buscar')]);
    llm.encolar(texto('   '));

    await expect(bucle.ejecutar(ENTRADA)).resolves.toEqual({ tipo: 'derivar', motivo: 'fallo-llm' });
  });

  it('el bucle no contiene el nombre de ninguna de las siete herramientas (A4)', () => {
    const fuente = readFileSync(new URL('./bucle-herramientas.ts', import.meta.url), 'utf8');
    for (const nombre of [
      'buscar_producto',
      'obtener_ficha',
      'cotizar_envio',
      'enviar_fotos',
      'marcar_lead_caliente',
      'guardar_datos_contacto',
      'consultar_politica',
    ]) {
      expect(fuente).not.toContain(nombre);
    }
  });
});

describe('modulos/agente/aplicacion — BucleHerramientas (AGT5, plazo y vueltas)', () => {
  it('AGT5 — Cada llamada recibe solo el tiempo que le queda al turno', async () => {
    const clock = new ClockFalso(INICIO);
    const solicitudes: SolicitudGeneracion[] = [];
    const llm: LlmPort = {
      generar(solicitud) {
        solicitudes.push(solicitud);
        if (solicitudes.length === 1) {
          clock.avanzar(10_000);
          return Promise.resolve({ llamadasHerramienta: [llamada('c1', 'buscar')] });
        }
        return Promise.resolve({ texto: 'listo' });
      },
    };
    const bucle = new BucleHerramientas(llm, new RegistroHerramientas([herramienta('buscar')]), clock, CONFIG);

    await bucle.ejecutar(ENTRADA);

    expect(solicitudes.map((s) => s.plazoMs)).toEqual([25_000, 15_000]);
  });

  it('AGT5 — Agotar las vueltas sin texto final deriva a humano', async () => {
    const { llm, bucle } = crear([herramienta('buscar')]);
    for (let i = 0; i < 8; i += 1) {
      llm.encolar(pideHerramientas(llamada(`c${String(i)}`, 'buscar')));
    }

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toEqual({ tipo: 'derivar', motivo: 'plazo-agotado' });
    expect(llm.solicitudes).toHaveLength(5);
  });

  it('un plazo ya agotado antes de una vuelta no llama al LLM', async () => {
    const clock = new ClockFalso(INICIO);
    let llamadas = 0;
    const llm: LlmPort = {
      generar() {
        llamadas += 1;
        clock.avanzar(26_000);
        return Promise.resolve({ llamadasHerramienta: [llamada('c1', 'buscar')] });
      },
    };
    const bucle = new BucleHerramientas(llm, new RegistroHerramientas([herramienta('buscar')]), clock, CONFIG);

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toEqual({ tipo: 'derivar', motivo: 'plazo-agotado' });
    expect(llamadas).toBe(1);
  });

  it('un timeout de la pasarela con el plazo del turno agotado se reporta como plazo-agotado', async () => {
    const clock = new ClockFalso(INICIO);
    const llm: LlmPort = {
      generar() {
        clock.avanzar(25_000);
        return Promise.reject(new ErrorPasarelaLlm('timeout'));
      },
    };
    const bucle = new BucleHerramientas(llm, new RegistroHerramientas([]), clock, CONFIG);

    await expect(bucle.ejecutar(ENTRADA)).resolves.toEqual({ tipo: 'derivar', motivo: 'plazo-agotado' });
  });
});

describe('modulos/agente/aplicacion — BucleHerramientas (AGT6, fallos de la pasarela)', () => {
  it('AGT6 — El techo de gasto deriva con su propio motivo', async () => {
    const { llm, bucle } = crear([]);
    llm.encolar({ error: new ErrorPasarelaLlm('techo-alcanzado') });

    await expect(bucle.ejecutar(ENTRADA)).resolves.toEqual({ tipo: 'derivar', motivo: 'techo-gasto' });
  });

  it('AGT6 — La caída del proveedor deriva como fallo del LLM', async () => {
    const { llm, bucle } = crear([]);
    llm.encolar({ error: new ErrorPasarelaLlm('proveedor-caido') });

    await expect(bucle.ejecutar(ENTRADA)).resolves.toEqual({ tipo: 'derivar', motivo: 'fallo-llm' });
  });

  it('cualquier otra excepción del LLM también deriva y nunca se propaga', async () => {
    const { bucle } = crear([]);

    await expect(bucle.ejecutar(ENTRADA)).resolves.toEqual({ tipo: 'derivar', motivo: 'fallo-llm' });
  });
});

describe('modulos/agente/aplicacion — BucleHerramientas, guarda de dinero sin rastro (R1, R2)', () => {
  const ficha = herramienta('ficha', () => Promise.resolve({ paraElModelo: { precio_texto: '$271.000' }, efectos: [] }));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sin montos sin rastro no hay reintento: el texto sale tal cual', async () => {
    const { llm, bucle } = crear([ficha]);
    llm.encolar(pideHerramientas(llamada('c1', 'ficha')), texto('Cuesta $271.000, llega en 2 días desde 2024.'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'Cuesta $271.000, llega en 2 días desde 2024.' });
    expect(llm.solicitudes).toHaveLength(2);
  });

  it('un monto sin rastro dispara un reintento con un mensaje correctivo y sale el texto corregido', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { llm, bucle } = crear([ficha]);
    llm.encolar(texto('Cuesta $999.000'), texto('Confirmo el precio con un asesor.'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'Confirmo el precio con un asesor.' });
    expect(llm.solicitudes).toHaveLength(2);
    const correctivo = llm.solicitudes[1]?.mensajes.at(-1);
    expect(correctivo).toMatchObject({ rol: 'usuario' });
    expect(JSON.stringify(correctivo)).toMatch(/no sale de ninguna herramienta/);
    expect(JSON.stringify(correctivo)).not.toContain('999');
    expect(aviso).toHaveBeenCalledWith({ evento: 'agente.dinero-sin-rastro', montos: 1, reintento: true });
  });

  it('el reintento puede llamar una herramienta y su resultado da rastro al monto', async () => {
    const { llm, bucle } = crear([ficha]);
    llm.encolar(texto('Cuesta $271.000'), pideHerramientas(llamada('c1', 'ficha')), texto('Cuesta $271.000'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'Cuesta $271.000' });
    expect(llm.solicitudes).toHaveLength(3);
  });

  it('si el monto sin rastro persiste, deriva y nunca devuelve el texto original', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { llm, bucle } = crear([ficha]);
    llm.encolar(texto('Cuesta $999.000'), texto('Mejor $888.000'), texto('no debe pedirse'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toEqual({ tipo: 'derivar', motivo: 'dinero-sin-rastro' });
    expect(llm.solicitudes).toHaveLength(2);
    expect(aviso).toHaveBeenCalledWith({ evento: 'agente.dinero-sin-rastro', montos: 1, reintento: false });
    expect(JSON.stringify(aviso.mock.calls)).not.toMatch(/999|888/);
  });

  it('una cifra que dijo el cliente en el turno y el bot repite no dispara reintento ni traspaso', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { llm, bucle } = crear([ficha]);
    llm.encolar(texto('Con tus $300.000 podemos buscar algo'));

    const resultado = await bucle.ejecutar({ ...ENTRADA, textosDelCliente: ['Mi presupuesto es $300.000'] });

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'Con tus $300.000 podemos buscar algo' });
    expect(llm.solicitudes).toHaveLength(1);
    expect(aviso).not.toHaveBeenCalled();
  });

  it('una cifra inventada sigue bloqueando aunque el cliente haya dicho otra', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { llm, bucle } = crear([ficha]);
    llm.encolar(texto('Cuesta $999.000'), texto('Mejor $888.000'));

    const resultado = await bucle.ejecutar({ ...ENTRADA, textosDelCliente: ['tengo 200 mil pesos'] });

    expect(resultado).toEqual({ tipo: 'derivar', motivo: 'dinero-sin-rastro' });
    expect(llm.solicitudes).toHaveLength(2);
  });

  it('el reintento respeta el plazo del turno: con el plazo agotado no llama al LLM', async () => {
    const clock = new ClockFalso(INICIO);
    const solicitudes: SolicitudGeneracion[] = [];
    const llm: LlmPort = {
      generar(solicitud) {
        solicitudes.push(solicitud);
        clock.avanzar(26_000);
        return Promise.resolve({ texto: 'Cuesta $999.000' });
      },
    };
    const bucle = new BucleHerramientas(llm, new RegistroHerramientas([]), clock, CONFIG);

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toEqual({ tipo: 'derivar', motivo: 'plazo-agotado' });
    expect(solicitudes).toHaveLength(1);
  });

  it('el techo de gasto en el reintento deriva por techo-gasto', async () => {
    const { llm, bucle } = crear([]);
    llm.encolar(texto('$999.000'), { error: new ErrorPasarelaLlm('techo-alcanzado') });

    await expect(bucle.ejecutar(ENTRADA)).resolves.toEqual({ tipo: 'derivar', motivo: 'techo-gasto' });
  });

  it.each([
    ['días', 'Llega en 2 días.'],
    ['años', 'Desde 2024 trabajamos así.'],
    ['teléfonos', 'Escríbenos al 3001234567.'],
    ['miles sin moneda', 'Tenemos 15 mil seguidores.'],
  ])('falso positivo conocido (%s) no bloquea ni reintenta', async (_nombre, frase) => {
    const { llm, bucle } = crear([]);
    llm.encolar(texto(frase));

    await expect(bucle.ejecutar(ENTRADA)).resolves.toMatchObject({ tipo: 'texto', texto: frase });
    expect(llm.solicitudes).toHaveLength(1);
  });

  it('un desglose con rastro, $271.000 (259.000 + 12.000), no bloquea', async () => {
    const desglose = herramienta('desglose', () =>
      Promise.resolve({ paraElModelo: { total: 271000, producto: 259000, envio: 12000 }, efectos: [] }),
    );
    const { llm, bucle } = crear([desglose]);
    llm.encolar(pideHerramientas(llamada('c1', 'desglose')), texto('Son $271.000 (259.000 + 12.000).'));

    const resultado = await bucle.ejecutar(ENTRADA);

    expect(resultado).toMatchObject({ tipo: 'texto', texto: 'Son $271.000 (259.000 + 12.000).' });
    expect(llm.solicitudes).toHaveLength(2);
  });
});
