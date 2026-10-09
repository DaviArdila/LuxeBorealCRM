import { RepositorioContactoAgenteEnMemoria } from '../../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { z } from 'zod';
import type { Herramienta } from '../../dominio/herramienta.js';
import type { CapturaLead } from '../../puertos/captura-lead.js';
import type { EvaluadorLead } from '../../puertos/evaluador-lead.js';
import { conConsentimiento, HERRAMIENTAS_QUE_ESCRIBEN_DATOS, protegerEscrituras } from './con-consentimiento.js';
import { crearGuardarDatosContacto } from './guardar-datos-contacto.js';
import { crearMarcarLeadCaliente } from './marcar-lead-caliente.js';

// Escenarios AGT26 (puerta) y los de «sin consentimiento» de AGT10, AGT11 y LDS2 de
// `openspec/changes/fase-12d-derivar-sin-silencio/specs/`.

const CONTEXTO = { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'contacto-7', efectosPrevios: [] };
const SIN_CAPTURA: CapturaLead = { pendiente: () => Promise.resolve(false), completar: () => Promise.resolve() };
const DATOS = {
  nombre_completo: 'Laura Gómez Pérez',
  telefono_contacto: '3001234567',
  direccion: 'Calle 45 # 12-34 apto 301',
  localidad: 'Chapinero',
};
const LEAD = { temperatura: 'caliente', senales: ['pide_pagar'], resumen: 'Quiere el anillo', id_producto: null } as const;

function evaluadorContado() {
  const estado = { consultas: 0 };
  const doble: EvaluadorLead = {
    evaluar: () => {
      estado.consultas += 1;
      return Promise.resolve({ derivado: true, accion: 'derivar', leadId: 'lead-1' });
    },
  };
  return { doble, estado };
}

function herramientaInformativa(nombre: string): Herramienta {
  const esquema = z.object({});
  return {
    definicion: { nombre, descripcion: 'informa', esquema, esquemaJson: z.toJSONSchema(esquema) },
    ejecutar: () => Promise.resolve({ paraElModelo: { ok: nombre }, efectos: [] }),
  };
}

describe('modulos/agente/aplicacion/herramientas — puerta de consentimiento', () => {
  it('AGT26 — Sin respuesta, guardar datos no guarda', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    const herramienta = conConsentimiento(crearGuardarDatosContacto(repositorio, SIN_CAPTURA), repositorio);

    const resultado = await herramienta.ejecutar(DATOS, CONTEXTO);

    expect(repositorio.guardados.size).toBe(0);
    expect(resultado.paraElModelo).toEqual({ requiereConsentimiento: true });
    expect(resultado.efectos).toEqual([]);
  });

  it('AGT10 — Sin consentimiento los datos no se guardan y la captura pendiente no se completa', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    const completadas: string[] = [];
    const captura: CapturaLead = {
      pendiente: () => Promise.resolve(true),
      completar: (id) => {
        completadas.push(id);
        return Promise.resolve();
      },
    };

    await conConsentimiento(crearGuardarDatosContacto(repositorio, captura), repositorio).ejecutar(DATOS, CONTEXTO);

    expect(repositorio.guardados.size).toBe(0);
    expect(completadas).toEqual([]);
  });

  it('AGT26 — Con rechazo, el lead tampoco se registra', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    await repositorio.registrarConsentimiento('contacto-7', false);
    const { doble, estado } = evaluadorContado();

    const resultado = await conConsentimiento(crearMarcarLeadCaliente(doble), repositorio).ejecutar(LEAD, CONTEXTO);

    expect(estado.consultas).toBe(0);
    expect(resultado.paraElModelo).toEqual({ requiereConsentimiento: true });
    expect(resultado.efectos).toEqual([]);
  });

  it('AGT11 — Sin consentimiento el lead no se registra', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    const { doble, estado } = evaluadorContado();

    const resultado = await conConsentimiento(crearMarcarLeadCaliente(doble), repositorio).ejecutar(LEAD, CONTEXTO);

    expect(resultado.paraElModelo).toEqual({ requiereConsentimiento: true });
    expect(estado.consultas).toBe(0);
  });

  it('LDS2 — Sin consentimiento no se crea el lead: el evaluador no se consulta y no hay efecto de aviso', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    const { doble, estado } = evaluadorContado();

    const resultado = await conConsentimiento(crearMarcarLeadCaliente(doble), repositorio).ejecutar(LEAD, CONTEXTO);

    expect(estado.consultas).toBe(0);
    expect(resultado.efectos).toEqual([]);
  });

  it('AGT26 — Con aceptación la herramienta guarda', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria().aceptar('contacto-7');
    const herramienta = conConsentimiento(crearGuardarDatosContacto(repositorio, SIN_CAPTURA), repositorio);

    const resultado = await herramienta.ejecutar(DATOS, CONTEXTO);

    expect(repositorio.guardados.get('contacto-7')?.nombre).toBe('Laura Gómez Pérez');
    expect(resultado.paraElModelo).toEqual({ guardado: true });
  });

  it('AGT26 — Con aceptación el lead sí llega al evaluador', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria().aceptar('contacto-7');
    const { doble, estado } = evaluadorContado();

    await conConsentimiento(crearMarcarLeadCaliente(doble), repositorio).ejecutar(LEAD, CONTEXTO);

    expect(estado.consultas).toBe(1);
  });

  it('AGT26 — Las herramientas de información funcionan sin consentimiento', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    await repositorio.registrarConsentimiento('contacto-7', false);
    const nombres = ['buscar_producto', 'obtener_ficha', 'cotizar_envio', 'consultar_caso', 'enviar_fotos', 'derivar_a_asesor'];

    const protegidas = protegerEscrituras(nombres.map(herramientaInformativa), repositorio);

    for (const herramienta of protegidas) {
      await expect(herramienta.ejecutar({}, CONTEXTO)).resolves.toEqual({
        paraElModelo: { ok: herramienta.definicion.nombre },
        efectos: [],
      });
    }
  });

  it('AGT26 — Si falla la consulta del consentimiento no se guarda', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria().aceptar('contacto-7');
    repositorio.fallo = new Error('base caída');

    const resultado = await conConsentimiento(crearGuardarDatosContacto(repositorio, SIN_CAPTURA), repositorio).ejecutar(
      DATOS,
      CONTEXTO,
    );

    expect(repositorio.guardados.size).toBe(0);
    expect(resultado.paraElModelo).toEqual({ requiereConsentimiento: true });
  });

  it('AGT26 — Toda herramienta que escribe datos del cliente queda envuelta por la puerta', async () => {
    const repositorio = new RepositorioContactoAgenteEnMemoria();
    const { doble } = evaluadorContado();
    const todas = [crearGuardarDatosContacto(repositorio, SIN_CAPTURA), crearMarcarLeadCaliente(doble)];

    const protegidas = protegerEscrituras(todas, repositorio);

    expect(HERRAMIENTAS_QUE_ESCRIBEN_DATOS).toEqual(['guardar_datos_contacto', 'marcar_lead_caliente']);
    for (const nombre of HERRAMIENTAS_QUE_ESCRIBEN_DATOS) {
      const herramienta = protegidas.find((candidata) => candidata.definicion.nombre === nombre);
      await expect(herramienta?.ejecutar(nombre === 'marcar_lead_caliente' ? LEAD : DATOS, CONTEXTO)).resolves.toMatchObject({
        paraElModelo: { requiereConsentimiento: true },
      });
    }
  });
});
