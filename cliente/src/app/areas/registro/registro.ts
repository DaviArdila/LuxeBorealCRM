import type { DefinicionArea } from '../../nucleo/definicion-area';
import { AREA_ASISTENTE } from '../asistente/area';
import { AREA_CONFIGURACION } from '../configuracion/area';

/**
 * Lista de áreas: lo único que el shell conoce de ellas (D9). Agregar un área es una carpeta nueva
 * en `areas/` y una línea aquí.
 */
export const REGISTRO_DE_AREAS: readonly DefinicionArea[] = [AREA_ASISTENTE, AREA_CONFIGURACION];
