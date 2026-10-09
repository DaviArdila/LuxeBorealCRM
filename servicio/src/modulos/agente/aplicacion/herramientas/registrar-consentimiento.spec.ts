import { ClockFalso } from '../../../../../test/fakes/clock-falso.js';
import { RepositorioContactoAgenteEnMemoria } from '../../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { crearRegistrarConsentimiento } from './registrar-consentimiento.js';

// Escenarios AGT25 de `openspec/changes/fase-12d-derivar-sin-silencio/specs/agente/spec.md`.

const CONTEXTO = { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'contacto-7', efectosPrevios: [] };

describe('modulos/agente/aplicacion/herramientas — registrar_consentimiento', () => {
  it('AGT25 — El cliente acepta y queda registrado', async () => {
    const reloj = new ClockFalso(new Date('2026-10-09T10:00:00.000Z'));
    const repositorio = new RepositorioContactoAgenteEnMemoria(reloj);

    const resultado = await crearRegistrarConsentimiento(repositorio).ejecutar({ acepta: true }, CONTEXTO);

    expect(repositorio.consentimientos.get('contacto-7')).toEqual({
      aceptadoEn: new Date('2026-10-09T10:00:00.000Z'),
      rechazadoEn: null,
    });
    expect(resultado.paraElModelo).toEqual({ registrado: true, acepta: true });
    expect(resultado.efectos).toEqual([]);
  });

  it('AGT25 — El cliente rechaza y queda registrado', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    const resultado = await crearRegistrarConsentimiento(repositorio).ejecutar({ acepta: false }, CONTEXTO);

    await expect(repositorio.consentimientoDe('contacto-7')).resolves.toBe('rechazado');
    expect(resultado.paraElModelo).toEqual({ registrado: true, acepta: false });
  });

  it('AGT25 — El contacto sale del contexto y no de los argumentos', () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();

    // La validación del esquema lanza antes de tocar el repositorio; el bucle lo devuelve al modelo como error.
    expect(() =>
      crearRegistrarConsentimiento(repositorio).ejecutar({ acepta: true, contacto_id: 'otro-contacto' }, CONTEXTO),
    ).toThrow();

    expect(repositorio.consentimientos.size).toBe(0);
  });

  it('AGT25 — Repetir la aceptación conserva la fecha original', async () => {
    const reloj = new ClockFalso(new Date('2026-10-09T10:00:00.000Z'));
    const repositorio = new RepositorioContactoAgenteEnMemoria(reloj);
    const herramienta = crearRegistrarConsentimiento(repositorio);
    await herramienta.ejecutar({ acepta: true }, CONTEXTO);

    reloj.fijar(new Date('2026-10-09T11:00:00.000Z'));
    await herramienta.ejecutar({ acepta: true }, CONTEXTO);

    expect(repositorio.consentimientos.get('contacto-7')?.aceptadoEn).toEqual(new Date('2026-10-09T10:00:00.000Z'));
  });

  it('AGT25 — Un fallo al guardar el consentimiento no se da por registrado', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    repositorio.fallo = new Error('base caída');

    await expect(crearRegistrarConsentimiento(repositorio).ejecutar({ acepta: true }, CONTEXTO)).rejects.toThrow(
      'base caída',
    );

    repositorio.fallo = null;
    await expect(repositorio.consentimientoDe('contacto-7')).resolves.toBe('pendiente');
  });

  it('AGT25 — Su definición exige un booleano y su descripción dice que registra la respuesta explícita del cliente', () => {
    const { definicion } = crearRegistrarConsentimiento(new RepositorioContactoAgenteEnMemoria());

    expect(definicion.nombre).toBe('registrar_consentimiento');
    expect(definicion.descripcion).toMatch(/respuesta explícita/);
    expect(definicion.esquema.safeParse({ acepta: true }).success).toBe(true);
    expect(definicion.esquema.safeParse({ acepta: 'sí' }).success).toBe(false);
    expect(definicion.esquema.safeParse({}).success).toBe(false);
  });
});
