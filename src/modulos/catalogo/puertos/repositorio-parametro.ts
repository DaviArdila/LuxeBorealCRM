/**
 * Token de inyección del puerto {@link RepositorioParametroCatalogo} (design.md D4: puerto propio
 * de `catalogo`, sin un módulo `configuracion` compartido).
 */
export const REPOSITORIO_PARAMETRO_CATALOGO = Symbol('REPOSITORIO_PARAMETRO_CATALOGO');

/**
 * Puerto de lectura de los parámetros del negocio (R15) que necesita `catalogo`: factor
 * volumétrico, recargo contraentrega y el mensaje de fuera de cobertura. Cada método ya devuelve
 * el valor validado y con su valor por defecto aplicado (design.md, "Data Flow": el factor llega
 * listo a `pesoFacturableG`, sin pasar por una validación adicional en `aplicacion/`) — el
 * adaptador Prisma documenta el criterio de "no configurado" de cada uno.
 */
export interface RepositorioParametroCatalogo {
  obtenerFactorVolumetrico(): Promise<number>;
  obtenerRecargoContraentregaPct(): Promise<number>;
  obtenerMensajeFueraCobertura(): Promise<string>;
}
