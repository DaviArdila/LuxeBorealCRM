import { RepositorioContactoAgenteEnMemoria } from '../../../../../test/fakes/repositorio-contacto-agente-en-memoria.js';
import { TextosAsistenteEnMemoria } from '../../../../../test/fakes/textos-asistente-en-memoria.js';
import type { MensajeTurno, SolicitudTurno, TipoContenidoTurno } from '../../../conversaciones/index.js';
import { PoliticaConsentimiento } from './politica-consentimiento.js';

// Escenarios AGT29 y PRV7-PRV8 (ADR-0028): la barrera previa al LLM.

/** Un valor igual a un tipo no textual (audio, imagen, ubicacion, sticker) es ese mensaje; cualquier otro es un texto. */
function solicitud(...mensajes: string[]): SolicitudTurno {
  const tipos: readonly TipoContenidoTurno[] = ['audio', 'imagen', 'ubicacion', 'sticker'];
  const lista: MensajeTurno[] = mensajes.map((valor, i) => {
    const tipo = tipos.find((t) => t === valor);
    return { idMensaje: `m${String(i)}`, tipoContenido: tipo ?? 'texto', texto: tipo === undefined ? valor : '' };
  });
  return {
    contexto: {
      conversacionId: 'conv-1',
      contactoId: 'contacto-1',
      canal: 'whatsapp',
      version: 0,
      capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
    },
    mensajes: lista,
  };
}

function crear(estado: 'pendiente' | 'aceptado' | 'rechazado' = 'pendiente') {
  const contactos = new RepositorioContactoAgenteEnMemoria();
  if (estado === 'aceptado') contactos.aceptar('contacto-1');
  if (estado === 'rechazado') void contactos.registrarConsentimiento('contacto-1', false);
  contactos.registros = 0;
  const textos = new TextosAsistenteEnMemoria();
  return { politica: new PoliticaConsentimiento(contactos, textos), contactos };
}

function texto(clave: string) {
  return {
    decision: 'responder',
    respuesta: { pasos: [{ paso: expect.any(String) as string, tipo: 'texto', texto: `[${clave}]` }] },
    cuentaTurno: false,
  };
}

describe('modulos/agente/aplicacion/politicas — PoliticaConsentimiento (ADR-0028)', () => {
  it('AGT29 — Un contacto que ya aceptó pasa al siguiente eslabón sin escribir nada', async () => {
    const { politica, contactos } = crear('aceptado');

    await expect(politica.evaluar(solicitud('hola, busco un collar'))).resolves.toEqual({ decision: 'seguir' });
    expect(contactos.registros).toBe(0);
  });

  it('AGT29 — Un contacto pendiente recibe el aviso y el modelo no interviene', async () => {
    const { politica, contactos } = crear('pendiente');

    await expect(politica.evaluar(solicitud('hola, cuánto cuesta el collar?'))).resolves.toEqual(texto('consentimiento_aviso'));
    expect(contactos.registros).toBe(0);
  });

  it('AGT29 — Un contacto que rechazó recibe el recordatorio', async () => {
    const { politica } = crear('rechazado');

    await expect(politica.evaluar(solicitud('hola otra vez'))).resolves.toEqual(texto('consentimiento_recordatorio'));
  });

  it.each(['sí', 'Si', 'SÍ.', ' acepto ', '1', 'ok', 'Sí, acepto', 'siii'])('AGT29 — «%s» registra la aceptación y confirma', async (respuesta) => {
    const { politica, contactos } = crear('pendiente');

    await expect(politica.evaluar(solicitud(respuesta))).resolves.toEqual(texto('consentimiento_aceptado'));
    await expect(contactos.consentimientoDe('contacto-1')).resolves.toBe('aceptado');
  });

  it.each(['no', 'No.', '2', 'no acepto', 'No, gracias'])('AGT29 — «%s» registra el rechazo y explica que sin autorización no se continúa', async (respuesta) => {
    const { politica, contactos } = crear('pendiente');

    await expect(politica.evaluar(solicitud(respuesta))).resolves.toEqual(texto('consentimiento_rechazado'));
    await expect(contactos.consentimientoDe('contacto-1')).resolves.toBe('rechazado');
  });

  it('AGT29 — Quien rechazó puede aceptar después con un sí', async () => {
    const { politica, contactos } = crear('rechazado');

    await expect(politica.evaluar(solicitud('sí'))).resolves.toEqual(texto('consentimiento_aceptado'));
    await expect(contactos.consentimientoDe('contacto-1')).resolves.toBe('aceptado');
  });

  it('AGT29 — Una respuesta ambigua repite el aviso y no registra nada', async () => {
    const { politica, contactos } = crear('pendiente');

    await expect(politica.evaluar(solicitud('claro, pero antes dime el precio'))).resolves.toEqual(texto('consentimiento_aviso'));
    expect(contactos.registros).toBe(0);
  });

  it('AGT29 — En una ráfaga decide el último texto', async () => {
    const { politica } = crear('pendiente');

    await expect(politica.evaluar(solicitud('hola', 'sí'))).resolves.toEqual(texto('consentimiento_aceptado'));
  });

  it('AGT29 — Si falla la lectura del estado no pasa al modelo y responde el recordatorio', async () => {
    const { politica, contactos } = crear('aceptado');
    contactos.fallo = new Error('base caída');

    await expect(politica.evaluar(solicitud('hola'))).resolves.toEqual(texto('consentimiento_recordatorio'));
  });

  it('AGT29 — Si falla el registro del sí no confirma y no pasa al modelo', async () => {
    const { politica, contactos } = crear('pendiente');
    contactos.registrarConsentimiento = () => Promise.reject(new Error('base caída'));

    await expect(politica.evaluar(solicitud('sí'))).resolves.toEqual(texto('consentimiento_recordatorio'));
  });

  it.each<TipoContenidoTurno>(['audio', 'imagen', 'sticker'])('R12 — Un %s de un contacto sin aceptar lo resuelve R12, sin modelo', async (tipo) => {
    const { politica } = crear('pendiente');

    await expect(politica.evaluar(solicitud(tipo))).resolves.toEqual({ decision: 'seguir' });
  });

  it('AGT29 — Una ubicación sola de un contacto sin aceptar recibe el recordatorio-aviso', async () => {
    const { politica } = crear('pendiente');

    await expect(politica.evaluar(solicitud('ubicacion'))).resolves.toEqual(texto('consentimiento_aviso'));
  });
});
