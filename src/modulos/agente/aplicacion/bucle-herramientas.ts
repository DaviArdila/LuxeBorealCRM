import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { ErrorPasarelaLlm, LLM_PORT } from '../../llm/index.js';
import type {
  LlamadaHerramienta,
  LlmPort,
  MensajeLlm,
  ResultadoHerramienta,
} from '../../llm/index.js';
import { contarMontosSinRastro } from '../dominio/auditar-dinero.js';
import type { EfectoTurno } from '../dominio/efectos.js';
import type { SesionHerramienta } from '../dominio/herramienta.js';
import { RegistroHerramientas } from './registro-herramientas.js';

/** Margen que el turno deja del lock para registrar el uso y liberarlo (ADR-0018). */
const MARGEN_LOCK_S = 5;
/** Segunda llamada inválida del turno = el modelo no se corrige: se deriva (AGT4). */
const INVALIDAS_PARA_DERIVAR = 2;
/**
 * Mensaje de sistema (rol `usuario`: el puerto solo tiene dos roles) del único reintento por dinero sin
 * rastro. No repite el texto ni el monto que escribió el modelo (R14: nada del cliente ni de la respuesta).
 */
const MENSAJE_CORRECTIVO_DINERO =
  'Aviso del sistema: tu respuesta anterior incluía un monto en pesos que no sale de ninguna herramienta ' +
  'llamada en este turno, y no se envió al cliente. Escribe de nuevo la respuesta: si necesitas un precio, ' +
  'llama la herramienta que corresponda y cita su texto exacto; si no puedes obtenerlo, no menciones ' +
  'cifras y ofrece confirmarlo con un asesor.';

export interface EntradaBucle {
  readonly sesion: SesionHerramienta;
  readonly contactoId: string;
  readonly systemPrompt: string;
  readonly mensajes: readonly MensajeLlm[];
}

export type MotivoDerivacionBucle =
  | 'fallo-llm'
  | 'techo-gasto'
  | 'argumentos-invalidos'
  | 'plazo-agotado'
  /** R1/R2: el texto final citó dinero sin rastro en las herramientas aun después del único reintento. */
  | 'dinero-sin-rastro';

export type ResultadoBucle =
  | {
      readonly tipo: 'texto';
      readonly texto: string;
      readonly efectos: readonly EfectoTurno[];
      /** Lo que las herramientas le dijeron al modelo en el turno: insumo de la auditoría de dinero (D9). */
      readonly resultadosParaElModelo: readonly unknown[];
    }
  | { readonly tipo: 'derivar'; readonly motivo: MotivoDerivacionBucle };

/**
 * Bucle de herramientas del agente (D1-D2 de la Fase 07b, AGT4-AGT6): llama a `LLM_PORT` con las
 * definiciones del registro, ejecuta lo que el modelo pida y le devuelve los resultados hasta obtener
 * un texto final. No conoce el nombre de ninguna herramienta (A4): solo el registro. Respeta un plazo
 * de turno de `LOCK_TURNO_TTL_S − 5` s medido con el `Clock` y un tope de vueltas; cualquier fallo se
 * convierte en una derivación tipada, nunca en una excepción hacia `conversaciones`.
 */
@Injectable()
export class BucleHerramientas {
  private readonly logger = new Logger(BucleHerramientas.name);

  constructor(
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    private readonly registro: RegistroHerramientas,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION)
    private readonly configuracion: Pick<Configuracion, 'LOCK_TURNO_TTL_S' | 'AGENTE_MAX_VUELTAS'>,
  ) {}

  async ejecutar(entrada: EntradaBucle): Promise<ResultadoBucle> {
    const inicioMs = this.clock.ahora().getTime();
    const plazoTurnoMs = (this.configuracion.LOCK_TURNO_TTL_S - MARGEN_LOCK_S) * 1000;
    const restanteMs = () => plazoTurnoMs - (this.clock.ahora().getTime() - inicioMs);

    const mensajes: MensajeLlm[] = [...entrada.mensajes];
    const efectos: EfectoTurno[] = [];
    const resultadosParaElModelo: unknown[] = [];
    const definiciones = this.registro.definiciones();
    let invalidas = 0;
    let reintentoDinero = false;

    for (let vuelta = 0; vuelta < this.configuracion.AGENTE_MAX_VUELTAS; vuelta += 1) {
      const plazoMs = restanteMs();
      if (plazoMs <= 0) {
        return { tipo: 'derivar', motivo: 'plazo-agotado' };
      }

      let respuesta;
      try {
        respuesta = await this.llm.generar({
          perfil: 'conversacion',
          systemPrompt: entrada.systemPrompt,
          mensajes,
          herramientas: definiciones,
          conversacionId: entrada.sesion.conversacionId,
          plazoMs,
        });
      } catch (error) {
        return { tipo: 'derivar', motivo: this.motivoDeFallo(error, restanteMs()) };
      }

      const validas = respuesta.llamadasHerramienta ?? [];
      const rechazadas = respuesta.llamadasInvalidas ?? [];
      if (validas.length === 0 && rechazadas.length === 0) {
        const texto = respuesta.texto?.trim() ?? '';
        if (texto.length === 0) {
          return { tipo: 'derivar', motivo: 'fallo-llm' };
        }
        // R1/R2: un monto sin rastro en las herramientas del turno no llega al cliente. Un solo reintento con
        // un mensaje correctivo (usa la misma vuelta, el mismo plazo y el mismo techo de gasto); si persiste,
        // se deriva. Riesgo conocido: un falso positivo cuesta una llamada más o, si persiste, un traspaso.
        const montos = contarMontosSinRastro(texto, resultadosParaElModelo);
        if (montos === 0) {
          return { tipo: 'texto', texto, efectos, resultadosParaElModelo };
        }
        // D9, R14: solo la cantidad y si hubo reintento; el texto de la respuesta nunca va al log.
        this.logger.warn({ evento: 'agente.dinero-sin-rastro', montos, reintento: !reintentoDinero });
        if (reintentoDinero) {
          return { tipo: 'derivar', motivo: 'dinero-sin-rastro' };
        }
        reintentoDinero = true;
        mensajes.push({ rol: 'asistente', texto }, { rol: 'usuario', texto: MENSAJE_CORRECTIVO_DINERO });
        continue;
      }

      mensajes.push({
        rol: 'asistente',
        ...(respuesta.texto === undefined ? {} : { texto: respuesta.texto }),
        llamadasHerramienta: [...validas, ...rechazadas.map((rechazada) => rechazada.llamada)],
      });

      invalidas += rechazadas.length;
      const resultados: ResultadoHerramienta[] = rechazadas.map((rechazada) =>
        errorDeHerramienta(rechazada.llamada, `Argumentos inválidos para "${rechazada.llamada.nombre}": ${rechazada.causa}`),
      );
      if (invalidas >= INVALIDAS_PARA_DERIVAR) {
        return { tipo: 'derivar', motivo: 'argumentos-invalidos' };
      }

      for (const llamada of validas) {
        const herramienta = this.registro.obtener(llamada.nombre);
        if (herramienta === undefined) {
          invalidas += 1;
          resultados.push(errorDeHerramienta(llamada, `La herramienta "${llamada.nombre}" no existe.`));
          continue;
        }
        try {
          const resultado = await herramienta.ejecutar(llamada.argumentos, {
            sesion: entrada.sesion,
            contactoId: entrada.contactoId,
            efectosPrevios: [...efectos],
          });
          efectos.push(...resultado.efectos);
          resultadosParaElModelo.push(resultado.paraElModelo);
          resultados.push({
            idLlamada: llamada.id,
            nombre: llamada.nombre,
            resultado: resultado.paraElModelo,
            esError: false,
          });
        } catch {
          // Nunca se propaga ni se copia el mensaje: podría traer datos del cliente (R14).
          resultados.push(errorDeHerramienta(llamada, `La herramienta "${llamada.nombre}" falló; sigue sin ella.`));
        }
      }
      if (invalidas >= INVALIDAS_PARA_DERIVAR) {
        return { tipo: 'derivar', motivo: 'argumentos-invalidos' };
      }
      mensajes.push({ rol: 'usuario', resultadosHerramienta: resultados });
    }
    return { tipo: 'derivar', motivo: 'plazo-agotado' };
  }

  private motivoDeFallo(error: unknown, restanteMs: number): MotivoDerivacionBucle {
    if (error instanceof ErrorPasarelaLlm) {
      if (error.codigo === 'techo-alcanzado') {
        return 'techo-gasto';
      }
      if (error.codigo === 'timeout' && restanteMs <= 0) {
        return 'plazo-agotado';
      }
    }
    return 'fallo-llm';
  }
}

function errorDeHerramienta(llamada: LlamadaHerramienta, mensaje: string): ResultadoHerramienta {
  return { idLlamada: llamada.id, nombre: llamada.nombre, resultado: { error: mensaje }, esError: true };
}
