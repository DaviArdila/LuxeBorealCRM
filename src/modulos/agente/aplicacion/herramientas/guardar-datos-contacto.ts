import { z } from 'zod';
import type { Herramienta } from '../../dominio/herramienta.js';
import type { RepositorioContactoAgente } from '../../puertos/repositorio-contacto-agente.js';
import { definirHerramienta } from './definir-herramienta.js';

/** Un teléfono alterno real tiene al menos 7 dígitos; "este mismo" y similares no lo son (AGT10). */
const DIGITOS_MINIMOS_TELEFONO = 7;

const esquema = z.object({
  nombre_completo: z.string().min(1).describe('Nombre completo de quien recibe el pedido.'),
  telefono_contacto: z
    .string()
    .min(1)
    .describe('Teléfono de contacto que dio el cliente; si dijo "este mismo", envía exactamente eso.'),
  direccion: z.string().min(1).describe('Dirección de entrega completa.'),
  localidad: z.string().min(1).describe('Barrio o localidad de la dirección.'),
});

/**
 * `guardar_datos_contacto` (AGT10): guarda en el contacto de la conversación lo que el cliente dio
 * para el despacho. El contacto sale del contexto del turno, nunca de los argumentos del modelo; un
 * teléfono con menos de 7 dígitos no se guarda como alterno; y ningún valor va al log ni de vuelta al
 * modelo (R14).
 */
export function crearGuardarDatosContacto(contactos: RepositorioContactoAgente): Herramienta {
  return definirHerramienta(
    'guardar_datos_contacto',
    'Guarda los datos de despacho que el cliente dio: nombre completo, teléfono de contacto, dirección y localidad. Úsala solo cuando el cliente ya los dio todos.',
    esquema,
    async ({ nombre_completo, telefono_contacto, direccion, localidad }, ctx) => {
      const digitos = telefono_contacto.replace(/\D/g, '');
      await contactos.guardarDatosCapturados(ctx.contactoId, {
        nombre: nombre_completo.trim(),
        telefonoAlterno: digitos.length >= DIGITOS_MINIMOS_TELEFONO ? telefono_contacto.trim() : null,
        direccion: direccion.trim(),
        localidad: localidad.trim(),
      });
      return { paraElModelo: { guardado: true }, efectos: [{ tipo: 'datos-contacto-guardados' }] };
    },
  );
}
