import type { GeneradorRespuesta, SolicitudTurno } from '../../../src/modulos/conversaciones/index.js';
import type { LlmPort } from '../../../src/modulos/llm/index.js';
import type { PrismaService } from '../../../src/plataforma/prisma/index.js';
import { FakePuertoLlm } from '../../fakes/puerto-llm-falso.js';
import { evaluarAserciones, type ResultadoAsercion } from './aserciones.js';
import type { CasoEval } from './esquema-caso.js';
import { encolarGuion } from './guion.js';
import type { GrabadorLlm } from './grabador-llm.js';
import { fijarPoliticas } from './sembrar.js';

export interface EntradaEjecucion {
  readonly caso: CasoEval;
  readonly generador: GeneradorRespuesta;
  readonly grabador: GrabadorLlm;
  readonly prisma: PrismaService;
  /** Modo real: el LLM de verdad (el guion se ignora). Sin él se usa el guion del turno. */
  readonly llmReal?: LlmPort;
  /** Recibe el id de cada conversación creada, para asociar el costo y los modelos al caso. */
  readonly alCrearConversacion?: (conversacionId: string) => void;
}

let secuencia = 0;

/**
 * Corre un caso de punta a punta (D1): crea el contacto y la conversación, aplica la semilla del caso
 * y, por cada turno, arma la solicitud, llama al generador del turno y evalúa las aserciones sobre lo
 * que grabó el puerto del LLM. Cada ejecución usa una conversación nueva, así el historial y los
 * contadores de sesión del caso anterior no influyen.
 */
export async function ejecutarCaso({ caso, generador, grabador, prisma, llmReal, alCrearConversacion }: EntradaEjecucion): Promise<readonly ResultadoAsercion[]> {
  secuencia += 1;
  const contacto = await prisma.contacto.create({
    data: { chatwootContactId: 800_000 + secuencia * 7 + Math.floor(Math.random() * 5), nombre: caso.contacto?.nombre ?? null },
  });
  const conversacion = await prisma.conversacion.create({
    data: { contactoId: contacto.id, chatwootConversationId: 900_000 + secuencia * 7 + Math.floor(Math.random() * 5), canal: 'whatsapp', estado: 'bot' },
  });
  alCrearConversacion?.(conversacion.id);
  if (caso.semilla?.politicas !== undefined) {
    await fijarPoliticas(prisma, caso.semilla.politicas);
  }

  const resultados: ResultadoAsercion[] = [];
  for (const [indice, turno] of caso.turnos.entries()) {
    if (llmReal !== undefined) {
      grabador.usar(llmReal);
    } else {
      const llm = new FakePuertoLlm();
      if (turno.guion !== undefined) {
        encolarGuion(llm, `${caso.id}-t${String(indice + 1)}`, turno.guion);
      }
      grabador.usar(llm);
    }
    grabador.reiniciar();

    const solicitud: SolicitudTurno = {
      contexto: {
        conversacionId: conversacion.id,
        contactoId: contacto.id,
        canal: 'whatsapp',
        version: conversacion.version,
        capacidades: { mensajeSalienteCuesta: true, admiteImagen: true },
      },
      mensajes: turno.mensajes.map((mensaje, i) => ({ idMensaje: `${caso.id}-${String(indice)}-${String(i)}`, ...mensaje })),
    };
    const respuesta = await generador.generar(solicitud);
    const texto = respuesta.pasos.flatMap((paso) => (paso.tipo === 'texto' ? [paso.texto] : [])).join('\n');
    const grabacion = grabador.grabacion(texto, respuesta.handoff?.motivo ?? null);
    resultados.push(...evaluarAserciones(grabacion, turno.aserciones));
  }
  return resultados;
}
