/**
 * Ángulos que puede mostrar la foto de un producto (IMP14, Fase 08b). La lista vive en código y no en un
 * enum de la base: agregar un ángulo no exige migración (D3 del diseño de la 08b).
 */
export const ANGULOS_FOTO = ['frente', 'lateral_izquierdo', 'lateral_derecho', 'detalle', 'uso'] as const;

export type AnguloFoto = (typeof ANGULOS_FOTO)[number];

export function esAnguloFoto(valor: string): valor is AnguloFoto {
  return (ANGULOS_FOTO as readonly string[]).includes(valor);
}
