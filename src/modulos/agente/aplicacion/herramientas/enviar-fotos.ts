import { z } from 'zod';
import type { Configuracion } from '../../../../plataforma/config/index.js';
import { ProductoNoDisponible, type ObtenerFotosProducto } from '../../../catalogo/index.js';
import type { EfectoTurno } from '../../dominio/efectos.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import type { ContadoresSesion } from '../../puertos/contadores-sesion.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  id_producto: z.string().min(1).describe('El id del producto del que se mandan fotos.'),
  modo: z
    .enum(['collage', 'individuales'])
    .describe('"collage" manda una sola imagen con todas las fotos (por defecto); "individuales" manda una por foto.'),
});

const sinEnvio = (error: string) => ({ paraElModelo: { enviadas: 0, error }, efectos: [] as EfectoTurno[] });

/**
 * `enviar_fotos` (AGT9): pide las claves a `ObtenerFotosProducto` y las devuelve como efectos
 * `enviar-imagen`; el modelo solo ve cuántas se enviaron (nunca claves ni URLs) y un error explícito
 * cuando no hay nada que enviar, para que no afirme haber mandado algo. El collage es una sola
 * imagen; las individuales respetan `AGENTE_FOTOS_INDIVIDUALES_MAX` por sesión. La clave sale del
 * catálogo, nunca de los argumentos del modelo (matriz de amenazas).
 */
export function crearEnviarFotos(
  obtenerFotos: ObtenerFotosProducto,
  contadores: ContadoresSesion,
  configuracion: Pick<Configuracion, 'AGENTE_FOTOS_INDIVIDUALES_MAX'>,
): Herramienta {
  return definirHerramienta(
    'enviar_fotos',
    'Envía al cliente las fotos de un producto. Usa modo "collage" por defecto (una sola imagen); "individuales" solo si el cliente pide ver las fotos por separado.',
    esquema,
    async ({ id_producto, modo }, ctx) => {
      const tope = configuracion.AGENTE_FOTOS_INDIVIDUALES_MAX;
      const restantes =
        modo === 'individuales' ? Math.max(0, tope - (await contadores.fotosIndividuales(ctx.sesion))) : tope;
      if (modo === 'individuales' && restantes === 0) {
        return sinEnvio('Ya se enviaron todas las fotos individuales permitidas en esta conversación.');
      }

      let fotos;
      try {
        fotos = await obtenerFotos.ejecutar(id_producto, restantes);
      } catch (error) {
        if (error instanceof ProductoNoDisponible) {
          return sinEnvio('Ese producto no existe o no está disponible.');
        }
        throw error;
      }

      if (modo === 'collage') {
        return fotos.claveCollage === null
          ? sinEnvio('Ese producto no tiene collage; prueba con el modo "individuales" si tiene fotos.')
          : {
              paraElModelo: { enviadas: 1 },
              efectos: [{ tipo: 'enviar-imagen', claveObjeto: fotos.claveCollage }],
            };
      }
      if (fotos.clavesFotos.length === 0) {
        return sinEnvio('Ese producto no tiene fotos.');
      }
      await contadores.sumarFotosIndividuales(ctx.sesion, fotos.clavesFotos.length);
      return {
        paraElModelo: { enviadas: fotos.clavesFotos.length },
        efectos: fotos.clavesFotos.map((claveObjeto): EfectoTurno => ({ tipo: 'enviar-imagen', claveObjeto })),
      };
    },
  );
}
