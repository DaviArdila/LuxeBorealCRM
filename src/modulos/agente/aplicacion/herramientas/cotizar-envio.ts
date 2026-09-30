import { z } from 'zod';
import type { CotizarEnvio } from '../../../catalogo/index.js';
import type { Herramienta } from '../../dominio/herramienta.js';
import { cotizacionParaElModelo } from './contrato-modelo.js';
import { definirHerramienta } from './definir-herramienta.js';

const esquema = z.object({
  id_producto: z.string().min(1).describe('El id o el SKU del producto que se quiere enviar.'),
  departamento: z.string().min(1).describe('Departamento de destino, como lo dijo el cliente.'),
  ciudad: z.string().nullish().describe('Ciudad o municipio de destino, si el cliente la dio.'),
});

/**
 * `cotizar_envio` (AGT8): envuelve `CotizarEnvio`. Devuelve el rango aproximado y los días ya
 * formateados, si hay contra entrega y, en ese caso, la política literal (CAT10); sin cobertura
 * devuelve el mensaje del negocio y deja el efecto `sin-cobertura`, que después desactiva la
 * evaluación del lead (AGT11).
 */
export function crearCotizarEnvio(cotizar: CotizarEnvio): Herramienta {
  return definirHerramienta(
    'cotizar_envio',
    'Cotiza el envío de un producto a un destino: rango aproximado de costo, días de entrega y si hay contra entrega. Si no hay cobertura lo indica.',
    esquema,
    async ({ id_producto, departamento, ciudad }) => {
      const cotizacion = await cotizar.ejecutar(id_producto, { departamento, ciudad: ciudad ?? null });
      return {
        paraElModelo: cotizacionParaElModelo(cotizacion),
        efectos: cotizacion.cobertura ? [] : [{ tipo: 'sin-cobertura' }],
      };
    },
  );
}
