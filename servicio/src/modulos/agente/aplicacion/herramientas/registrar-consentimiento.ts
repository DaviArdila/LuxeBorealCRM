import { z } from 'zod';
import type { Herramienta } from '../../dominio/herramienta.js';
import type { RepositorioContactoAgente } from '../../puertos/repositorio-contacto-agente.js';
import { definirHerramienta } from './definir-herramienta.js';

// `strictObject`: un argumento adicional (por ejemplo un id de contacto) se rechaza (AGT25).
const esquema = z.strictObject({
  acepta: z.boolean().describe('true si el cliente aceptó el tratamiento de sus datos; false si lo rechazó.'),
});

/**
 * `registrar_consentimiento` (AGT25, PRV1): guarda en el contacto de la conversación la respuesta del cliente al
 * tratamiento de datos. El contacto sale del contexto del turno, nunca de los argumentos; la fecha la pone el
 * repositorio con el `Clock`. No deja nada en logs: ni el mensaje del cliente ni sus datos (R14). Si la escritura
 * falla lanza, y el bucle lo devuelve al modelo como error de herramienta: nada se da por registrado.
 */
export function crearRegistrarConsentimiento(contactos: RepositorioContactoAgente): Herramienta {
  return definirHerramienta(
    'registrar_consentimiento',
    'Registra la respuesta explícita del cliente a la pregunta de aceptación del tratamiento de datos: ' +
      'acepta=true si dijo que sí, acepta=false si dijo que no. No la uses por inferencia ni sin que el cliente haya respondido.',
    esquema,
    async ({ acepta }, ctx) => {
      await contactos.registrarConsentimiento(ctx.contactoId, acepta);
      return { paraElModelo: { registrado: true, acepta }, efectos: [] };
    },
  );
}
