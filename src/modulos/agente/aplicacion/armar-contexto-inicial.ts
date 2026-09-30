import { Inject, Injectable } from '@nestjs/common';
import { ObtenerFichaProducto } from '../../catalogo/index.js';
import type { SesionHerramienta } from '../dominio/herramienta.js';
import { CONTADORES_SESION, type ContadoresSesion } from '../puertos/contadores-sesion.js';
import {
  REPOSITORIO_CONTACTO_AGENTE,
  type RepositorioContactoAgente,
} from '../puertos/repositorio-contacto-agente.js';

const PATRON_SKU = /SKU-[A-Z0-9-]+/i;

export interface EntradaContextoInicial {
  readonly sesion: SesionHerramienta;
  readonly contactoId: string;
  readonly textoCliente: string;
}

/**
 * Contexto inicial del turno (D7 de la Fase 07b, AGT12; SPEC del prototipo §3.3 y §3.7): instrucciones
 * de texto para la parte variable del prompt. En el primer turno de la conversación, un SKU activo en
 * el mensaje se indica como producto de entrada; si el contacto ya tiene nombre, se le indica al
 * modelo que lo salude por él sin asumir su interés. Nunca incluye otro dato personal, y un fallo al
 * leer el catálogo o el contacto degrada al caso genérico en vez de romper el turno.
 */
@Injectable()
export class ArmarContextoInicial {
  constructor(
    private readonly ficha: ObtenerFichaProducto,
    @Inject(REPOSITORIO_CONTACTO_AGENTE) private readonly contactos: RepositorioContactoAgente,
    @Inject(CONTADORES_SESION) private readonly contadores: ContadoresSesion,
  ) {}

  async ejecutar(entrada: EntradaContextoInicial): Promise<readonly string[]> {
    const instrucciones: string[] = [];
    const producto = await this.productoDeEntrada(entrada);
    if (producto !== null) {
      instrucciones.push(
        `El cliente llegó interesado en el producto "${producto.nombre}" (id: ${producto.id}). ` +
          'Salúdalo y ofrécele la ficha de ese producto; los datos los obtienes con obtener_ficha.',
      );
    }
    const nombre = await this.nombreDelContacto(entrada.contactoId);
    if (nombre !== null) {
      instrucciones.push(
        `El cliente se llama ${nombre}: salúdalo por su nombre. No asumas que quiere lo mismo que la última vez.`,
      );
    }
    return instrucciones;
  }

  private async productoDeEntrada(
    { sesion, textoCliente }: EntradaContextoInicial,
  ): Promise<{ id: string; nombre: string } | null> {
    const sku = PATRON_SKU.exec(textoCliente)?.[0];
    if (sku === undefined || sesion.version !== 0) {
      return null;
    }
    try {
      if ((await this.contadores.turnos(sesion)) !== 0) {
        return null;
      }
      const ficha = await this.ficha.ejecutar(sku.toUpperCase());
      return { id: ficha.id, nombre: ficha.nombre };
    } catch {
      // Producto inexistente, inactivo o catálogo caído: consulta genérica.
      return null;
    }
  }

  private async nombreDelContacto(contactoId: string): Promise<string | null> {
    try {
      const nombre = (await this.contactos.leerNombre(contactoId))?.trim();
      return nombre === undefined || nombre.length === 0 ? null : nombre;
    } catch {
      return null;
    }
  }
}
