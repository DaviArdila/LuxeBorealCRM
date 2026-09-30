import { Logger } from '@nestjs/common';
import { ClockFalso } from '../../../../../test/fakes/clock-falso.js';
import { FakePuertoLlm } from '../../../../../test/fakes/puerto-llm-falso.js';
import { RepositorioParametroAgenteEnMemoria } from '../../../../../test/fakes/repositorio-parametro-agente-en-memoria.js';
import { RepositorioParametroLlmEnMemoria } from '../../../../../test/fakes/repositorio-parametro-llm-en-memoria.js';
import type { SolicitudTurno } from '../../../conversaciones/index.js';
import { ErrorPasarelaLlm, ObtenerMensajeTechoGasto } from '../../../llm/index.js';
import type { EfectoTurno } from '../../dominio/efectos.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { BucleHerramientas } from '../bucle-herramientas.js';
import { EnsamblarPrompt } from '../ensamblar-prompt.js';
import { RegistroHerramientas } from '../registro-herramientas.js';
import { ContenidoLlm } from './contenido-llm.js';

// Escenarios AGT4 (imágenes después del texto) y AGT6 de la spec de la Fase 07b, sobre el pipeline.

function turno(...mensajes: SolicitudTurno['mensajes'][number][]): SolicitudTurno {
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version: 0,
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

function crear(herramientas: readonly Herramienta[] = []) {
  const llm = new FakePuertoLlm();
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
  const politica = new ContenidoLlm(bucle, new EnsamblarPrompt(), parametros, new ObtenerMensajeTechoGasto(parametrosLlm));
  return { llm, politica };
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
});
