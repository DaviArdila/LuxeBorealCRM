/**
 * Manejador de outbox (D10) que traduce cada fila producida por `SalidaCanalOutbox` a una llamada
 * del `ADAPTADOR_CANAL` (D9, D12). Registrado en `canales.module.ts` (`onModuleInit`) para los tres
 * `tipo` de `salida-canal-outbox.ts`: la misma instancia atiende `canal.mensaje`, `canal.estado` y
 * `canal.etiquetas` (D10 no exige un manejador por `tipo`, solo un registro sin colisiones).
 *
 * D5 (07b) — imagen: una fila con `datos.claveObjeto` lee los bytes de `medios` (MED10) y llama
 * `enviarImagen`; la reconciliación y la guardia CAN9 valen igual que para el texto (CAN10).
 *
 * D13 — reconciliación: si el intento actual **no** es el primero (`entrada.intento > 1`), hubo un
 * intento previo cuyo resultado no se conoce con certeza (timeout, *lease* vencido, proceso caído
 * entre el `POST` y la marca de enviado). Antes de reenviar un mensaje se consulta
 * `existeMensajeConMarca`: si Chatwoot ya lo creó, la fila se marca entregada sin un segundo `POST`
 * (T1 confirmó contra Chatwoot v4.17.1 real que `content_attributes` se persiste y es consultable
 * por `GET`, y que Chatwoot no deduplica esto por sí mismo). Cambiar de estado y agregar etiquetas
 * son idempotentes por naturaleza (D13) y no necesitan esta consulta.
 *
 * CAN9 (D7 de la 07a): un mensaje que declara `datos.requiereEstado` consulta la guardia registrada
 * justo antes de enviarse; si niega, el paso falla como `permanente` y el outbox aborta el resto de
 * la secuencia. Sin `requiereEstado` o sin guardia registrada se envía como antes. La guardia va
 * después de la reconciliación de D13: un paso que ya salió no debe marcarse como fallido.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { EstadoConversacionCanal } from '../dominio/evento-canal.js';
import { FalloPublicacion, type EntradaOutbox, type ManejadorOutbox } from '../../../plataforma/outbox/index.js';
import { ALMACENAMIENTO, ObjetoNoEncontrado, type Almacenamiento, type ObjetoAlmacenado } from '../../medios/index.js';
import { ADAPTADOR_CANAL, FalloCanal, type AdaptadorCanal } from '../puertos/adaptador-canal.js';
import { RegistroGuardiaEnvioCanal } from './registro-guardia-envio-canal.js';
import { TIPO_OUTBOX_ESTADO, TIPO_OUTBOX_ETIQUETAS, TIPO_OUTBOX_MENSAJE } from './salida-canal-outbox.js';

function idConversacionDeDatos(datos: Readonly<Record<string, unknown>>, tipo: string): string {
  const valor = datos.idConversacion;
  if (typeof valor !== 'string' || valor.length === 0) {
    throw new Error(`Fila de outbox "${tipo}" con datos malformados: falta "idConversacion".`);
  }
  return valor;
}

function textoEfimero(efimero: Readonly<Record<string, unknown>> | undefined): string {
  const valor = efimero?.texto;
  if (typeof valor !== 'string') {
    throw new Error(`Fila de outbox "${TIPO_OUTBOX_MENSAJE}" sin texto efímero ("efimero.texto").`);
  }
  return valor;
}

/** Leyenda de una imagen (D5): opcional, sin ella el adjunto viaja sin texto. */
function leyendaEfimera(efimero: Readonly<Record<string, unknown>> | undefined): string | undefined {
  const valor = efimero?.leyenda;
  return typeof valor === 'string' ? valor : undefined;
}

function estadoDeDatos(datos: Readonly<Record<string, unknown>>): Exclude<EstadoConversacionCanal, 'pospuesta'> {
  const valor = datos.estado;
  if (valor !== 'abierta' && valor !== 'pendiente' && valor !== 'resuelta') {
    throw new Error(`Fila de outbox "${TIPO_OUTBOX_ESTADO}" con "estado" inválido: ${String(valor)}.`);
  }
  return valor;
}

function etiquetasDeDatos(datos: Readonly<Record<string, unknown>>): readonly string[] {
  const valor = datos.etiquetas;
  if (!Array.isArray(valor) || !valor.every((etiqueta): etiqueta is string => typeof etiqueta === 'string')) {
    throw new Error(`Fila de outbox "${TIPO_OUTBOX_ETIQUETAS}" con "etiquetas" inválidas.`);
  }
  return valor;
}

@Injectable()
export class PublicarEfectoCanal implements ManejadorOutbox {
  constructor(
    @Inject(ADAPTADOR_CANAL) private readonly adaptador: AdaptadorCanal,
    private readonly registroGuardia: RegistroGuardiaEnvioCanal,
    @Inject(ALMACENAMIENTO) private readonly almacenamiento: Almacenamiento,
  ) {}

  async publicar(entrada: EntradaOutbox): Promise<void> {
    switch (entrada.tipo) {
      case TIPO_OUTBOX_MENSAJE:
        await this.publicarMensaje(entrada);
        return;
      case TIPO_OUTBOX_ESTADO:
        await this.publicarEstado(entrada);
        return;
      case TIPO_OUTBOX_ETIQUETAS:
        await this.publicarEtiquetas(entrada);
        return;
      default:
        // Defensivo: `RegistroManejadoresOutbox` solo entrega a esta instancia los tres `tipo` con
        // los que se registró en `canales.module.ts`; un cuarto `tipo` sería un error de cableado.
        throw new FalloPublicacion('permanente', `tipo de outbox no reconocido por canales: ${entrada.tipo}`);
    }
  }

  /**
   * D13: en el primer intento se envía directo; desde el segundo, se reconcilia antes de reenviar
   * (`entrada.intento` ya viene incrementado por el reclamo que trajo esta llamada, D10).
   */
  private async publicarMensaje(entrada: EntradaOutbox): Promise<void> {
    const idConversacion = idConversacionDeDatos(entrada.datos, TIPO_OUTBOX_MENSAJE);

    if (entrada.intento > 1) {
      const yaExiste = await this.conFalloPublicacion(() =>
        this.adaptador.existeMensajeConMarca(idConversacion, entrada.claveIdempotencia),
      );
      if (yaExiste) {
        return;
      }
    }

    await this.consultarGuardia(idConversacion, entrada.datos);

    // D5 (07b): una fila con `claveObjeto` es una imagen; los bytes se leen ahora, no al encolar.
    const claveObjeto = entrada.datos.claveObjeto;
    if (typeof claveObjeto === 'string') {
      const objeto = await this.leerObjeto(claveObjeto);
      const leyenda = leyendaEfimera(entrada.efimero);
      await this.conFalloPublicacion(() =>
        this.adaptador.enviarImagen(
          idConversacion,
          objeto.contenido,
          objeto.contentType,
          leyenda,
          entrada.claveIdempotencia,
        ),
      );
      return;
    }

    const texto = textoEfimero(entrada.efimero);
    await this.conFalloPublicacion(() =>
      this.adaptador.enviarTexto(idConversacion, texto, entrada.claveIdempotencia),
    );
  }

  /**
   * MED10: un objeto que ya no existe no aparece solo en un reintento (`permanente`); cualquier otro
   * fallo del almacenamiento se reintenta (`transitorio`). El mensaje no lleva detalles del proveedor.
   */
  private async leerObjeto(claveObjeto: string): Promise<ObjetoAlmacenado> {
    try {
      return await this.almacenamiento.leer(claveObjeto);
    } catch (error) {
      if (error instanceof ObjetoNoEncontrado) {
        throw new FalloPublicacion('permanente', 'objeto-no-encontrado');
      }
      throw new FalloPublicacion('transitorio', 'almacenamiento-no-disponible');
    }
  }

  private async consultarGuardia(idConversacion: string, datos: Readonly<Record<string, unknown>>): Promise<void> {
    const requiereEstado = datos.requiereEstado;
    if (typeof requiereEstado !== 'string') return;
    const guardia = this.registroGuardia.obtener();
    if (guardia === undefined) return;
    if (!(await guardia.puedeEnviar(idConversacion, requiereEstado))) {
      throw new FalloPublicacion('permanente', 'estado-cambio');
    }
  }

  private async publicarEstado(entrada: EntradaOutbox): Promise<void> {
    const idConversacion = idConversacionDeDatos(entrada.datos, TIPO_OUTBOX_ESTADO);
    const estado = estadoDeDatos(entrada.datos);
    await this.conFalloPublicacion(() => this.adaptador.cambiarEstado(idConversacion, estado));
  }

  private async publicarEtiquetas(entrada: EntradaOutbox): Promise<void> {
    const idConversacion = idConversacionDeDatos(entrada.datos, TIPO_OUTBOX_ETIQUETAS);
    const etiquetas = etiquetasDeDatos(entrada.datos);
    await this.conFalloPublicacion(() => this.adaptador.agregarEtiquetas(idConversacion, etiquetas));
  }

  /** Traduce `FalloCanal` (D12) a `FalloPublicacion` (D10) para que `PublicadorOutbox` lo clasifique. */
  private async conFalloPublicacion<T>(accion: () => Promise<T>): Promise<T> {
    try {
      return await accion();
    } catch (error) {
      if (error instanceof FalloCanal) {
        throw new FalloPublicacion(error.naturaleza, error.causa, error.esperaSugeridaS);
      }
      throw error;
    }
  }
}
