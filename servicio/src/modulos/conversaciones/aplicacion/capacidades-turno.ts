import { perfilDeCapacidades } from '../../canales/index.js';
import type { CapacidadesSalida } from '../puertos/generador-respuesta.js';
import type { CanalConversacion } from '../puertos/repositorio-conversacion.js';

/**
 * Traduce el perfil del canal (CAN8) a lo que el generador necesita (D5, CNV7). Un canal sin perfil
 * soportado recibe capacidades conservadoras en costo (el mensaje saliente cuesta) y permisivas en
 * imagen: sirve al inbox local de pruebas (`otro`) sin dejar al agente sin información. El perfil
 * aún no distingue adjuntos salientes; `admiteImagen` se deriva de que el canal maneje imágenes.
 */
export function capacidadesTurno(canal: CanalConversacion): CapacidadesSalida {
  const perfil = perfilDeCapacidades(canal);
  if (!perfil.soportado) return { mensajeSalienteCuesta: true, admiteImagen: true };
  return {
    mensajeSalienteCuesta: perfil.mensajeSalienteTieneCosto,
    admiteImagen: perfil.adjuntosEntrantes.includes('imagen'),
  };
}
