import { Logger } from '@nestjs/common';
import { ClockFalso } from '../../../../../test/fakes/clock-falso.js';
import { ContadoresSesionEnMemoria } from '../../../../../test/fakes/contadores-sesion-en-memoria.js';
import { RepositorioContactoAgenteEnMemoria } from '../../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { HistorialEnMemoria } from '../../../../../test/fakes/historial-en-memoria.js';
import { FakePuertoLlm } from '../../../../../test/fakes/puerto-llm-falso.js';
import { RepositorioParametroAgenteEnMemoria } from '../../../../../test/fakes/repositorio-parametro-agente-en-memoria.js';
import { RepositorioParametroLlmEnMemoria } from '../../../../../test/fakes/repositorio-parametro-llm-en-memoria.js';
import { ProductoNoDisponible, type ObtenerCatalogoCompacto, type ObtenerFichaProducto } from '../../../catalogo/index.js';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { ErrorPasarelaLlm, ObtenerMensajeTechoGasto } from '../../../llm/index.js';
import type { EfectoTurno } from '../../dominio/efectos.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { ArmarContextoInicial } from '../armar-contexto-inicial.js';
import { crearGuardarDatosContacto } from '../herramientas/guardar-datos-contacto.js';
import { CargadorPrompts } from '../../infraestructura/prompts/cargador-prompts.js';
import { BucleHerramientas } from '../bucle-herramientas.js';
import { EnsamblarPrompt } from '../ensamblar-prompt.js';
import { TextoHandoff } from '../texto-handoff.js';
import { RegistroHerramientas } from '../registro-herramientas.js';
import { ContenidoLlm } from './contenido-llm.js';

// Escenarios AGT4 (imágenes después del texto) y AGT6 de la spec de la Fase 07b, sobre el pipeline.

function turno(...mensajes: SolicitudTurno['mensajes'][number][]): SolicitudTurno {
  return turnoDeVersion(0, ...mensajes);
}

function turnoDeVersion(version: number, ...mensajes: SolicitudTurno['mensajes'][number][]): SolicitudTurno {
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes,
  };
}

const HOLA = { idMensaje: 'm1', tipoContenido: 'texto', texto: 'hola' } as const;

function herramienta(nombre: string, paraElModelo: unknown, efectos: readonly EfectoTurno[] = []): Herramienta {
  return {
    definicion: { nombre, descripcion: nombre, esquema: { safeParse: () => ({ success: true }) }, esquemaJson: {} },
    ejecutar: () => Promise.resolve({ paraElModelo, efectos }),
  };
}

function crear(herramientas: readonly Herramienta[] = [], historialTurnos = 6) {
  const llm = new FakePuertoLlm();
  const historial = new HistorialEnMemoria();
  const parametros = new RepositorioParametroAgenteEnMemoria();
  parametros.textos.set('mensaje_error_llm', 'TEXTO-ERROR');
  const parametrosLlm = new RepositorioParametroLlmEnMemoria();
  parametrosLlm.mensajeTechoGasto = 'TEXTO-TECHO';
  const bucle = new BucleHerramientas(
    llm,
    new RegistroHerramientas(herramientas),
    new ClockFalso(new Date('2026-09-30T12:00:00.000Z')),
    { LOCK_TURNO_TTL_S: 30, AGENTE_MAX_VUELTAS: 5 },
  );
  const cargador = new CargadorPrompts();
  cargador.onModuleInit();
  const prompt = new EnsamblarPrompt(
    cargador,
    { ejecutar: () => Promise.resolve('- SKU-1: Anillo') } as unknown as ObtenerCatalogoCompacto,
    { estaDentroDeHorario: () => Promise.resolve(true) },
  );
  const contactos = new RepositorioContactoAgenteEnMemoria();
  const ficha = { ejecutar: () => Promise.reject(new ProductoNoDisponible()) } as unknown as ObtenerFichaProducto;
  const politica = new ContenidoLlm(
    bucle,
    prompt,
    new ArmarContextoInicial(
      ficha,
      contactos,
      new ContadoresSesionEnMemoria(),
      { pendiente: () => Promise.resolve(false), completar: () => Promise.resolve() },
      parametros,
    ),
    parametros,
    new ObtenerMensajeTechoGasto(parametrosLlm),
    historial,
    { AGENTE_HISTORIAL_TURNOS: historialTurnos },
    new TextoHandoff({ estaDentroDeHorario: () => Promise.resolve(true) }, parametros),
  );
  return { llm, politica, historial, contactos };
}

describe('modulos/agente/aplicacion/politicas — ContenidoLlm', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('un texto final del modelo es un solo paso de texto que consume turno', async () => {
    const { llm, politica } = crear();
    llm.encolar({ respuesta: { texto: 'Hola, ¿en qué te ayudo?' } });

    const decision = await politica.evaluar(turno(HOLA));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: { pasos: [{ paso: 'llm-1', tipo: 'texto', texto: 'Hola, ¿en qué te ayudo?' }] },
      cuentaTurno: true,
    });
    expect(llm.solicitudes[0]?.mensajes.at(-1)).toEqual({ rol: 'usuario', texto: 'hola' });
  });

  it('AGT4 — Los efectos de imagen se agregan después del texto', async () => {
    const foto = herramienta('fotos', { enviadas: 1 }, [
      { tipo: 'enviar-imagen', claveObjeto: 'productos/p1/collage.jpg' },
    ]);
    const { llm, politica } = crear([foto]);
    llm.encolar(
      { respuesta: { llamadasHerramienta: [{ id: 'c1', nombre: 'fotos', argumentos: {} }] } },
      { respuesta: { texto: 'Mira estas fotos' } },
    );

    const decision = await politica.evaluar(turno(HOLA));

    expect(decision).toMatchObject({
      decision: 'responder',
      respuesta: {
        pasos: [
          { paso: 'llm-1', tipo: 'texto', texto: 'Mira estas fotos' },
          { paso: 'llm-img-1', tipo: 'imagen', claveObjeto: 'productos/p1/collage.jpg' },
        ],
      },
    });
  });

  it('AGT6 — El techo de gasto deriva con su propio texto', async () => {
    const { llm, politica } = crear();
    llm.encolar({ error: new ErrorPasarelaLlm('techo-alcanzado') });

    const decision = await politica.evaluar(turno(HOLA));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: 'TEXTO-TECHO' }],
        handoff: { motivo: 'techo-gasto' },
      },
      cuentaTurno: false,
    });
  });

  it('AGT6 — La caída del proveedor deriva con el texto de error', async () => {
    const { llm, politica } = crear();
    llm.encolar({ error: new ErrorPasarelaLlm('proveedor-caido') });

    const decision = await politica.evaluar(turno(HOLA));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: 'TEXTO-ERROR' }],
        handoff: { motivo: 'fallo-llm' },
      },
      cuentaTurno: false,
    });
  });

  it('argumentos inválidos y plazo agotado derivan con el texto de error', async () => {
    const { llm, politica } = crear();
    const invalida = { llamada: { id: 'c1', nombre: 'x', argumentos: {} }, causa: 'mal' };
    llm.encolar({ respuesta: { llamadasInvalidas: [invalida] } }, { respuesta: { llamadasInvalidas: [invalida] } });

    const decision = await politica.evaluar(turno(HOLA));

    expect(decision).toMatchObject({
      respuesta: { pasos: [{ texto: 'TEXTO-ERROR' }], handoff: { motivo: 'argumentos-invalidos' } },
    });
  });

  it('un turno sin texto ni ubicación no llama al LLM ni consume turno', async () => {
    const { llm, politica } = crear();

    const decision = await politica.evaluar(turno({ idMensaje: 'm1', tipoContenido: 'sticker', texto: '' }));

    expect(decision).toEqual({ decision: 'responder', respuesta: { pasos: [] }, cuentaTurno: false });
    expect(llm.solicitudes).toHaveLength(0);
  });

  it('D9 — Un monto sin rastro en las herramientas se avisa en el log sin copiar el texto (R14)', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { llm, politica } = crear();
    llm.encolar({ respuesta: { texto: 'Cuesta $999.000, ¿te interesa?' } });

    await politica.evaluar(turno(HOLA));

    expect(aviso).toHaveBeenCalledWith({ evento: 'agente.dinero-sin-rastro', montos: 1 });
  });

  it('AGT7 — El LLM recibe solo los últimos turnos de la sesión', async () => {
    const { llm, politica, historial } = crear([], 6);
    const sesion = { conversacionId: 'conv-1', version: 0 };
    for (let i = 1; i <= 8; i += 1) {
      await historial.agregar(sesion, `cliente ${String(i)}`, `bot ${String(i)}`);
    }
    llm.encolar({ respuesta: { texto: 'respuesta 9' } });

    await politica.evaluar(turno({ idMensaje: 'm9', tipoContenido: 'texto', texto: 'cliente 9' }));

    const mensajes = llm.solicitudes[0]?.mensajes ?? [];
    expect(mensajes).toHaveLength(13);
    expect(mensajes[0]).toEqual({ rol: 'usuario', texto: 'cliente 3' });
    expect(mensajes[11]).toEqual({ rol: 'asistente', texto: 'bot 8' });
    expect(mensajes[12]).toEqual({ rol: 'usuario', texto: 'cliente 9' });
  });

  it('AGT7 — El historial no guarda resultados de herramientas', async () => {
    const ficha = herramienta('ficha', { precio_texto: '$389.000' });
    const { llm, politica, historial } = crear([ficha]);
    llm.encolar(
      { respuesta: { llamadasHerramienta: [{ id: 'c1', nombre: 'ficha', argumentos: {} }] } },
      { respuesta: { texto: 'Cuesta $389.000' } },
    );

    await politica.evaluar(turno(HOLA));

    await expect(historial.leer({ conversacionId: 'conv-1', version: 0 }, 6)).resolves.toEqual([
      { rol: 'usuario', texto: 'hola' },
      { rol: 'asistente', texto: 'Cuesta $389.000' },
    ]);
  });

  it('AGT7 — Una sesión nueva arranca sin historial', async () => {
    const { llm, politica, historial } = crear();
    await historial.agregar({ conversacionId: 'conv-1', version: 0 }, 'viejo', 'viejo bot');
    llm.encolar({ respuesta: { texto: 'hola de nuevo' } });

    await politica.evaluar(turnoDeVersion(1, HOLA));

    expect(llm.solicitudes[0]?.mensajes).toEqual([{ rol: 'usuario', texto: 'hola' }]);
  });

  it('un turno derivado no se agrega al historial', async () => {
    const { llm, politica, historial } = crear();
    llm.encolar({ error: new ErrorPasarelaLlm('proveedor-caido') });

    await politica.evaluar(turno(HOLA));

    await expect(historial.leer({ conversacionId: 'conv-1', version: 0 }, 6)).resolves.toEqual([]);
  });

  it('R12 — Ubicación entrante: el LLM la recibe como ubicación compartida', async () => {
    const { llm, politica } = crear();
    llm.encolar({ respuesta: { texto: '¿En qué ciudad y departamento estás?' } });

    await politica.evaluar(turno({ idMensaje: 'm1', tipoContenido: 'ubicacion', texto: '' }));

    expect(llm.solicitudes[0]?.mensajes.at(-1)).toEqual({ rol: 'usuario', texto: '[ubicación compartida]' });
  });

  it('AGT13 — la versión del prompt queda en el log del turno sin su contenido', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { llm, politica } = crear();
    llm.encolar({ respuesta: { texto: 'hola' } });

    await politica.evaluar(turno(HOLA));

    expect(log).toHaveBeenCalledWith({ evento: 'agente.prompt', version: 'v1' });
  });

  it('AGT12 — el contexto inicial llega al modelo en el prompt del turno', async () => {
    const { llm, politica, contactos } = crear();
    contactos.nombres.set('contacto-1', 'Laura');
    llm.encolar({ respuesta: { texto: 'Hola Laura' } });

    await politica.evaluar(turno(HOLA));

    expect(llm.solicitudes[0]?.systemPrompt).toContain('Laura');
  });

  it('AGT10 — Los datos del contacto no aparecen en los logs', async () => {
    const registros: unknown[][] = [];
    for (const nivel of ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const) {
      vi.spyOn(Logger.prototype, nivel).mockImplementation((...args: unknown[]) => {
        registros.push(args);
      });
    }
    for (const nivel of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
        registros.push(args);
      });
    }
    const contactos = new RepositorioContactoAgenteEnMemoria();
    const { llm, politica } = crear([
      crearGuardarDatosContacto(contactos, { pendiente: () => Promise.resolve(false), completar: () => Promise.resolve() }),
    ]);
    llm.encolar(
      {
        respuesta: {
          llamadasHerramienta: [
            {
              id: 'c1',
              nombre: 'guardar_datos_contacto',
              argumentos: {
                nombre_completo: 'Laura Gómez Pérez',
                telefono_contacto: '3001234567',
                direccion: 'Calle 45 # 12-34',
                localidad: 'Chapinero',
              },
            },
          ],
        },
      },
      { respuesta: { texto: 'Listo, quedó guardado' } },
    );

    await politica.evaluar(turno(HOLA));

    const volcado = JSON.stringify(registros);
    for (const valor of ['Laura Gómez Pérez', '3001234567', 'Calle 45 # 12-34', 'Chapinero']) {
      expect(volcado).not.toContain(valor);
    }
  });

  it('AGT11 — La propuesta confirmada por la escala deriva: el turno termina en handoff lead-caliente con el texto de handoff', async () => {
    const derivar: Herramienta = {
      definicion: { nombre: 'marcar', descripcion: 'x', esquema: { safeParse: () => ({ success: true }) }, esquemaJson: {} },
      ejecutar: () => Promise.resolve({ paraElModelo: { derivado: true }, efectos: [{ tipo: 'lead-derivado', leadId: 'lead-1' }] }),
    };
    const { llm, politica, historial } = crear([derivar]);
    llm.encolar(
      { respuesta: { llamadasHerramienta: [{ id: 'c1', nombre: 'marcar', argumentos: {} }] } },
      { respuesta: { texto: 'Perfecto, ya te ayudo con eso' } },
    );

    const decision = await politica.evaluar(turno(HOLA));

    expect(decision).toEqual({
      decision: 'responder',
      respuesta: {
        pasos: [{ paso: 'handoff-1', tipo: 'texto', texto: '[mensaje_handoff]' }],
        handoff: { motivo: 'lead-caliente' },
      },
      cuentaTurno: false,
    });
    // Un turno derivado no entra al historial: la sesión termina aquí.
    await expect(historial.leer({ conversacionId: 'conv-1', version: 0 }, 6)).resolves.toEqual([]);
  });

  it('un lead propuesto que no se deriva no cambia la respuesta del modelo', async () => {
    const proponer: Herramienta = {
      definicion: { nombre: 'marcar', descripcion: 'x', esquema: { safeParse: () => ({ success: true }) }, esquemaJson: {} },
      ejecutar: () => Promise.resolve({ paraElModelo: { derivado: false }, efectos: [{ tipo: 'lead-propuesto', temperatura: 'tibio' }] }),
    };
    const { llm, politica } = crear([proponer]);
    llm.encolar(
      { respuesta: { llamadasHerramienta: [{ id: 'c1', nombre: 'marcar', argumentos: {} }] } },
      { respuesta: { texto: 'Sigo atendiéndote' } },
    );

    const decision = await politica.evaluar(turno(HOLA));

    expect(decision).toMatchObject({ respuesta: { pasos: [{ texto: 'Sigo atendiéndote' }] }, cuentaTurno: true });
  });
});
