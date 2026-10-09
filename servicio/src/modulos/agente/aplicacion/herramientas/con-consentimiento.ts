import type { Herramienta } from '../../dominio/herramienta.js';
import type { RepositorioContactoAgente } from '../../puertos/repositorio-contacto-agente.js';

/** Las herramientas que guardan o registran datos del cliente: sin aceptación no escriben nada (AGT26, R14). */
export const HERRAMIENTAS_QUE_ESCRIBEN_DATOS: readonly string[] = ['guardar_datos_contacto', 'marcar_lead_caliente'];

/**
 * Puerta de consentimiento en código (AGT26, D7 de la Fase 12d): comprueba antes de ejecutar el cuerpo de la herramienta y
 * no depende de lo que diga el modelo. Sin aceptación —sin respuesta, con rechazo o si la consulta falla— responde
 * `requiereConsentimiento` sin escribir ni emitir efectos.
 */
export function conConsentimiento(herramienta: Herramienta, contactos: RepositorioContactoAgente): Herramienta {
  return {
    definicion: herramienta.definicion,
    ejecutar: async (argumentos, ctx) => {
      const aceptado = await contactos
        .consentimientoDe(ctx.contactoId)
        .then((estado) => estado === 'aceptado')
        .catch(() => false);
      if (!aceptado) {
        return { paraElModelo: { requiereConsentimiento: true }, efectos: [] };
      }
      return herramienta.ejecutar(argumentos, ctx);
    },
  };
}

/** Envuelve con la puerta, por nombre, cada herramienta de {@link HERRAMIENTAS_QUE_ESCRIBEN_DATOS}; deja las demás igual. */
export function protegerEscrituras(
  herramientas: readonly Herramienta[],
  contactos: RepositorioContactoAgente,
): readonly Herramienta[] {
  return herramientas.map((herramienta) =>
    HERRAMIENTAS_QUE_ESCRIBEN_DATOS.includes(herramienta.definicion.nombre)
      ? conConsentimiento(herramienta, contactos)
      : herramienta,
  );
}
