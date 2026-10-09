import { Inject, Injectable, Logger } from '@nestjs/common';
import { SALIDA_CANAL, type SalidaCanal } from '../../canales/index.js';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { espejoEstadoCanal } from '../dominio/espejo-estado-canal.js';
import { calcularTransicion, type EstadoAtencion, type OrigenTransicion } from '../dominio/maquina-estados.js';
import { MARCA_ASESOR_AVISADO, type MarcaAsesorAvisado } from '../puertos/marca-asesor-avisado.js';
import { MARCA_ESPERA_CLIENTE, type MarcaEsperaCliente } from '../puertos/marca-espera-cliente.js';
import {
  REPOSITORIO_CONVERSACION,
  type Conversacion,
  type RepositorioConversacion,
} from '../puertos/repositorio-conversacion.js';

/** Un segundo conflicto de versión sobre la misma fila: señal real, no algo para reintentar más (D2). */
/** Etiqueta que Chatwoot muestra en las conversaciones derivadas por un lead (CNV11). */
export const ETIQUETA_LEAD_CALIENTE = 'lead-caliente';

export class ConflictoDeVersionPersistente extends Error {
  constructor(id: string) {
    super(`Conflicto de versión persistente al transicionar la conversación ${id} (D2).`);
    this.name = 'ConflictoDeVersionPersistente';
  }
}

/**
 * Orquesta D3 (dominio) + D2 (repositorio): calcula la transición sobre el estado recibido y la
 * persiste con bloqueo optimista. Ante un conflicto de versión (otra escritura ganó primero),
 * relee el estado fresco por id y **reintenta una sola vez**, recalculando la transición sobre ese
 * estado; un segundo conflicto propaga {@link ConflictoDeVersionPersistente} (D2: el lock de D7 ya
 * reduce la probabilidad de dos escritores concurrentes, así que un segundo conflicto es una señal,
 * no algo para reintentar indefinidamente).
 *
 * Tras persistir, espeja el estado en el canal por el outbox (CNV8, D3 de la 07a; tabla en
 * `espejoEstadoCanal`). El espejo se encola **después** de la escritura, no en la misma transacción
 * (`RegistroOutbox.agregar` no acepta un cliente transaccional): una caída entre las dos escrituras
 * pierde el espejo, y la clave por versión hace idempotente cualquier reintento.
 */
@Injectable()
export class TransicionarConversacion {
  private readonly logger = new Logger(TransicionarConversacion.name);

  constructor(
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION) private readonly configuracion: Configuracion,
    @Inject(SALIDA_CANAL) private readonly salidaCanal: SalidaCanal,
    @Inject(MARCA_ESPERA_CLIENTE) private readonly marcaEspera: MarcaEsperaCliente,
    @Inject(MARCA_ASESOR_AVISADO) private readonly marcaAsesorAvisado: MarcaAsesorAvisado,
  ) {}

  async ejecutar(
    conversacion: Conversacion,
    destino: EstadoAtencion,
    origen: OrigenTransicion,
  ): Promise<Conversacion> {
    const transicionada = await this.persistir(conversacion, destino, origen);
    await this.cerrarEspera(transicionada, origen);
    await this.limpiarAvisos(transicionada);
    await this.espejar(transicionada, origen);
    return transicionada;
  }

  /**
   * CNV12 (Fase 08d): la espera del cliente termina cuando la conversación vuelve a `bot` (por vencimiento, porque
   * Chatwoot la pasó a pendiente o la resolvió) o cuando un asesor escribe (eco humano). Es de apoyo: si el
   * almacén falla, la transición ya está confirmada y solo queda un `warn`; el barrido de esperas recoge lo que quede.
   */
  private async cerrarEspera(transicionada: Conversacion, origen: OrigenTransicion): Promise<void> {
    if (transicionada.estado !== 'bot' && origen !== 'eco_humano') return;
    try {
      await this.marcaEspera.cerrar(transicionada.id);
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.espera-cliente-cierre-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
  }

  /**
   * CNV14 (Fase 12d): las marcas de «asesor avisado» valen una sesión bot. Se borran cuando la conversación pasa a
   * `humano` (eco humano u `open`) y cuando vuelve a `bot`; pasar a `handoff_pendiente` no las toca. Es de apoyo: si el
   * almacén falla, la transición ya está confirmada y solo queda un `warn` (el TTL de respaldo las vence).
   */
  private async limpiarAvisos(transicionada: Conversacion): Promise<void> {
    if (transicionada.estado !== 'bot' && transicionada.estado !== 'humano') return;
    try {
      await this.marcaAsesorAvisado.limpiar(transicionada.id);
    } catch (error) {
      this.logger.warn({
        evento: 'conversaciones.asesor-avisado-limpieza-fallo',
        error: error instanceof Error ? error.name : 'desconocido',
      });
    }
  }

  private async persistir(
    conversacion: Conversacion,
    destino: EstadoAtencion,
    origen: OrigenTransicion,
  ): Promise<Conversacion> {
    const primerIntento = await this.intentar(conversacion, destino, origen);
    if (primerIntento !== null) return primerIntento;

    const fresca = await this.repositorio.obtenerPorId(conversacion.id);
    if (fresca === null) {
      throw new Error(`Conversación ${conversacion.id} ya no existe al reintentar la transición (D2).`);
    }

    const reintento = await this.intentar(fresca, destino, origen);
    if (reintento === null) {
      throw new ConflictoDeVersionPersistente(conversacion.id);
    }
    return reintento;
  }

  private async espejar(transicionada: Conversacion, origen: OrigenTransicion): Promise<void> {
    const estado = espejoEstadoCanal(transicionada.estado, origen);
    if (estado === null) return;
    // Sin ':' — `claveEstado` (canales) restringe `idOperacion` a `[A-Za-z0-9_-]`.
    await this.salidaCanal.cambiarEstado({
      idConversacion: String(transicionada.chatwootConversationId),
      idOperacion: `espejo-v${transicionada.version}`,
      estado,
    });
    // CNV11: un handoff por lead marca la conversación para que el asesor la distinga en la bandeja.
    if (origen === 'lead_caliente') {
      await this.salidaCanal.agregarEtiquetas({
        idConversacion: String(transicionada.chatwootConversationId),
        idOperacion: `etiqueta-lead-v${transicionada.version}`,
        etiquetas: [ETIQUETA_LEAD_CALIENTE],
      });
    }
  }

  private async intentar(
    conversacion: Conversacion,
    destino: EstadoAtencion,
    origen: OrigenTransicion,
  ): Promise<Conversacion | null> {
    const ahora = this.clock.ahora();
    const resultado = calcularTransicion(
      conversacion.estado,
      destino,
      origen,
      ahora,
      this.configuracion.HUMANO_TTL_HORAS,
      this.configuracion.HANDOFF_TTL_MIN,
    );
    return this.repositorio.transicionar(
      conversacion.id,
      conversacion.version,
      resultado.destino,
      origen,
      resultado.expiraControlEn,
      ahora,
    );
  }
}
