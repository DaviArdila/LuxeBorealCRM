import { Inject, Injectable } from '@nestjs/common';
import { normalizarLugar } from '../../../../compartido/texto/index.js';
import { validarOpcionesBotones, type SolicitudTurno } from '../../../conversaciones/index.js';
import { TEXTOS_ASISTENTE, textoDeRespaldo, type ClaveSistema, type TextosAsistente } from '../../../asistente/index.js';
import { decidirNoTextuales } from '../../dominio/decidir-no-textuales.js';
import type { DecisionPolitica, EstadoTurno, PoliticaTurno } from '../../dominio/politica-turno.js';
import {
  REPOSITORIO_CONTACTO_AGENTE,
  type EstadoConsentimiento,
  type RepositorioContactoAgente,
} from '../../puertos/repositorio-contacto-agente.js';

/** Frases que cuentan como «sí» tras normalizar (sin acentos, mayúsculas ni signos). Reconocimiento por frase exacta. */
const AFIRMATIVAS = new Set([
  'si', 'sip', 'acepto', 'autorizo', 'si acepto', 'si autorizo', 'si lo autorizo', 'si la autorizo', 'si la doy',
  'si doy mi autorizacion', 'de acuerdo', 'claro', 'dale', 'listo', 'vale', 'ok', 'okay', 'yes', '1',
]);

/** Frases que cuentan como «no» tras normalizar. */
const NEGATIVAS = new Set(['no', 'nop', 'nel', 'no acepto', 'no autorizo', 'no gracias', 'no quiero', 'no lo autorizo', 'no la doy', '2']);

type Respuesta = 'si' | 'no' | 'otra';

/** Los títulos de los botones que se mostraron: el clic llega como un texto con el título, sin id (Chatwoot lo descarta). */
interface Titulos {
  readonly si: string;
  readonly no: string;
}

/**
 * Entiende la respuesta al aviso por el texto del último mensaje de la ráfaga (R14: el contenido no se registra en ningún lado).
 * Además de las frases conocidas, un texto igual al título de un botón vigente cuenta como ese botón, aunque el dueño lo haya
 * editado a una frase que el parser no conoce.
 */
function entender(solicitud: SolicitudTurno, titulos: Titulos): Respuesta {
  const ultimo = solicitud.mensajes.filter((mensaje) => mensaje.tipoContenido === 'texto').at(-1);
  if (ultimo === undefined) return 'otra';
  const frase = normalizarLugar(ultimo.texto);
  if (frase === normalizarLugar(titulos.si)) return 'si';
  if (frase === normalizarLugar(titulos.no)) return 'no';
  if (/^si+$/.test(frase) || AFIRMATIVAS.has(frase)) return 'si';
  return NEGATIVAS.has(frase) ? 'no' : 'otra';
}

/**
 * Barrera de consentimiento (ADR-0028, PRV1, AGT29): primera política del pipeline. Un contacto `aceptado` pasa; uno
 * `pendiente` o `rechazado` no llega al LLM. Un SÍ registra la aceptación y confirma; un NO registra el rechazo y explica que
 * sin autorización no se puede continuar; cualquier otra cosa repite el aviso (pendiente) o el recordatorio (rechazado) con
 * «Responde SÍ o NO». Si falla la lectura o el registro del estado, falla cerrado: responde el recordatorio y no pasa al modelo.
 * Los audios, imágenes y stickers los sigue resolviendo R12 (no llegan al modelo); una ubicación sola recibe el recordatorio.
 * Los textos son casos del sistema editables (R15); el tiempo de la respuesta lo pone el repositorio con el `Clock` (PRV1).
 * El aviso y el recordatorio salen con dos botones de respuesta («Sí, autorizo» / «No autorizo», también datos editables de
 * hasta 20 caracteres) y conservan «Responde SÍ o NO» en el cuerpo como respaldo; el clic llega como el título del botón.
 */
@Injectable()
export class PoliticaConsentimiento implements PoliticaTurno {
  constructor(
    @Inject(REPOSITORIO_CONTACTO_AGENTE) private readonly contactos: RepositorioContactoAgente,
    @Inject(TEXTOS_ASISTENTE) private readonly textos: TextosAsistente,
  ) {}

  async evaluar(solicitud: SolicitudTurno, turno: EstadoTurno = {}): Promise<DecisionPolitica> {
    const { contactoId } = solicitud.contexto;
    let estado: EstadoConsentimiento | null;
    try {
      estado = await this.contactos.consentimientoDe(contactoId);
    } catch {
      estado = null;
    }
    // Si el turno sigue, el resto del pipeline reutiliza esta lectura en vez de repetirla (una sola por turno).
    if (estado !== null) turno.consentimiento = estado;
    if (estado === 'aceptado') return { decision: 'seguir' };

    // R12 resuelve audio, imagen y sticker sin llegar al modelo; solo la ubicación sola sigue hacia el LLM.
    if (decidirNoTextuales(solicitud.mensajes.map((mensaje) => mensaje.tipoContenido)).accion !== 'seguir') {
      return { decision: 'seguir' };
    }

    if (estado === null) return this.responderConBotones('consentimiento_recordatorio');
    const respuesta = entender(solicitud, await this.titulosDeBotones());
    if (respuesta === 'otra') {
      return this.responderConBotones(estado === 'pendiente' ? 'consentimiento_aviso' : 'consentimiento_recordatorio');
    }
    try {
      await this.contactos.registrarConsentimiento(contactoId, respuesta === 'si');
    } catch {
      return this.responderConBotones('consentimiento_recordatorio');
    }
    return this.responder(respuesta === 'si' ? 'consentimiento_aceptado' : 'consentimiento_rechazado');
  }

  /**
   * Los títulos vigentes (datos del dueño, R15). Si no cumplen el límite del canal (1 a 20 caracteres, sin repetirse) rigen los
   * de respaldo del código: nunca se trunca un título en silencio ni se pierde el aviso.
   */
  private async titulosDeBotones(): Promise<Titulos> {
    const guardados = {
      si: await this.textos.textoDelSistema('consentimiento_boton_si'),
      no: await this.textos.textoDelSistema('consentimiento_boton_no'),
    };
    try {
      const [si, no] = validarOpcionesBotones([guardados.si, guardados.no]);
      return { si: si ?? guardados.si, no: no ?? guardados.no };
    } catch {
      return { si: textoDeRespaldo('consentimiento_boton_si'), no: textoDeRespaldo('consentimiento_boton_no') };
    }
  }

  private async responderConBotones(clave: ClaveSistema): Promise<DecisionPolitica> {
    const texto = await this.textos.textoDelSistema(clave);
    const { si, no } = await this.titulosDeBotones();
    return {
      decision: 'responder',
      respuesta: { pasos: [{ paso: 'consentimiento-1', tipo: 'botones', texto, opciones: [si, no] }] },
      cuentaTurno: false, // R13: igual que el texto simple
    };
  }

  private async responder(clave: ClaveSistema): Promise<DecisionPolitica> {
    const texto = await this.textos.textoDelSistema(clave);
    // La barrera no consume turnos de la sesión (R13): un contacto sin autorización no llega al tope.
    return { decision: 'responder', respuesta: { pasos: [{ paso: 'consentimiento-1', tipo: 'texto', texto }] }, cuentaTurno: false };
  }
}
