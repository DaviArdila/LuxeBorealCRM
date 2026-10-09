import { z } from 'zod';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import { ANGULOS_FOTO, ProductoNoDisponible, type ObtenerFotosProducto } from '../../../catalogo/index.js';
import type { EfectoTurno } from '../../dominio/efectos.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import type { ContadoresSesion } from '../../puertos/contadores-sesion.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  id_producto: z.string().min(1).describe('El id del producto del que se manda una foto.'),
  angulo: z
    .enum(ANGULOS_FOTO)
    .optional()
    .describe('Solo si el cliente pide ver otro ángulo; los disponibles salen de obtener_ficha. Sin ángulo se manda la foto principal.'),
});

const sinEnvio = (error: string) => ({ paraElModelo: { enviadas: 0, error }, efectos: [] as EfectoTurno[] });

/**
 * `enviar_fotos` (AGT9): manda **una** foto por llamada: la principal, o la del ángulo que pida el cliente
 * (la lista de ángulos disponibles la da `obtener_ficha`). La clave y el pie de foto salen del catálogo
 * (`ObtenerFotosProducto`, AGT17), nunca de los argumentos del modelo (matriz de amenazas): el modelo solo
 * ve cuántas se enviaron y un error explícito cuando no hay nada que enviar, para que no afirme haber
 * mandado algo. `AGENTE_FOTOS_INDIVIDUALES_MAX` limita las fotos enviadas por sesión (R13).
 */
export function crearEnviarFotos(
  obtenerFotos: ObtenerFotosProducto,
  contadores: ContadoresSesion,
  configuracion: Pick<Configuracion, 'AGENTE_FOTOS_INDIVIDUALES_MAX'>,
): Herramienta {
  return definirHerramienta(
    'enviar_fotos',
    'Envía al cliente una foto de un producto: la principal, o la del ángulo que se indique.',
    esquema,
    async ({ id_producto, angulo }, ctx) => {
      if ((await contadores.fotosIndividuales(ctx.sesion)) >= configuracion.AGENTE_FOTOS_INDIVIDUALES_MAX) {
        return sinEnvio('Ya se enviaron todas las fotos permitidas en esta conversación.');
      }

      let fotos;
      try {
        fotos = await obtenerFotos.ejecutar(id_producto, angulo);
      } catch (error) {
        if (error instanceof ProductoNoDisponible) {
          return sinEnvio('Ese producto no existe o no está disponible.');
        }
        throw error;
      }

      if (fotos.foto === null) {
        if (angulo !== undefined && fotos.angulosDisponibles.length > 0) {
          return sinEnvio(`Ese producto no tiene foto de ángulo "${angulo}". Ángulos disponibles: ${fotos.angulosDisponibles.join(', ')}.`);
        }
        return sinEnvio(angulo === undefined ? 'Ese producto no tiene fotos.' : `Ese producto no tiene foto de ángulo "${angulo}".`);
      }
      await contadores.sumarFotosIndividuales(ctx.sesion, 1);
      return {
        paraElModelo: { enviadas: 1 },
        efectos: [{ tipo: 'enviar-imagen', claveObjeto: fotos.foto.claveObjeto, leyenda: fotos.leyenda }],
      };
    },
  );
}
