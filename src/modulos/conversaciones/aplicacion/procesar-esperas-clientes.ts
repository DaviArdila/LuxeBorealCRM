import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURACION, type Configuracion } from '../../../plataforma/config/index.js';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { MARCA_ESPERA_CLIENTE, type MarcaEsperaCliente } from '../puertos/marca-espera-cliente.js';
import { REPOSITORIO_CONVERSACION, type RepositorioConversacion } from '../puertos/repositorio-conversacion.js';
import { RegistroObservadoresEspera } from './registro-observadores-espera.js';

const MS_POR_MINUTO = 60_000;
/** Tope por barrido: un aviso por conversación, sin inundar el grupo si se acumularon muchas. */
const MAXIMO_POR_BARRIDO = 50;

/**
 * Convierte las esperas vencidas de clientes bajo control humano en avisos (NTF7, D5 de la Fase 08d). Por cada
 * conversación cuyo primer mensaje sin respuesta supera `ESPERA_CLIENTE_MIN` minutos: relee la conversación, y si
 * sigue en `humano` o `handoff_pendiente` reclama el aviso de forma atómica (dos barridos nunca avisan dos veces) y
 * notifica a los observadores. Si la conversación ya volvió a `bot`, se resolvió o no existe, descarta la espera sin
 * avisar. Si algún observador falla, devuelve la espera para que el siguiente barrido reintente, igual que
 * `RecordarLeads`. Nunca lee el contenido de un mensaje (R14).
 */
@Injectable()
export class ProcesarEsperasClientes {
  constructor(
    @Inject(MARCA_ESPERA_CLIENTE) private readonly marca: MarcaEsperaCliente,
    @Inject(REPOSITORIO_CONVERSACION) private readonly repositorio: RepositorioConversacion,
    private readonly observadores: RegistroObservadoresEspera,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CONFIGURACION) private readonly configuracion: Pick<Configuracion, 'ESPERA_CLIENTE_MIN'>,
  ) {}

  /** Devuelve cuántos avisos quedaron notificados. */
  async ejecutar(): Promise<number> {
    const ahora = this.clock.ahora();
    const limite = new Date(ahora.getTime() - this.configuracion.ESPERA_CLIENTE_MIN * MS_POR_MINUTO);
    const vencidas = await this.marca.vencidas(limite, MAXIMO_POR_BARRIDO);

    let avisados = 0;
    for (const espera of vencidas) {
      const conversacion = await this.repositorio.obtenerPorId(espera.conversacionId);
      const bajoControlHumano =
        conversacion !== null && (conversacion.estado === 'humano' || conversacion.estado === 'handoff_pendiente');
      if (!bajoControlHumano) {
        await this.marca.cerrar(espera.conversacionId);
        continue;
      }
      if (!(await this.marca.reclamarAviso(espera.conversacionId))) {
        continue;
      }
      const cumplido = await this.observadores.notificar({
        conversacionId: conversacion.id,
        contactoId: conversacion.contactoId,
        desde: espera.desde,
        esperaMin: Math.floor((ahora.getTime() - espera.desde.getTime()) / MS_POR_MINUTO),
      });
      if (cumplido) {
        avisados += 1;
      } else {
        await this.marca.devolverAviso(espera);
      }
    }
    return avisados;
  }
}
