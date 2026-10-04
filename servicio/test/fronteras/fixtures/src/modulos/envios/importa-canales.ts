// Fixture de fronteras (T6 de fase-05-conversaciones, regla 13, violación): ningún módulo salvo
// conversaciones importa el barril de canales (previsto para SALIDA_CANAL, D9/D15).
import { salidaCanalFicticia } from '../canales/index.js';

export const importaCanales = salidaCanalFicticia;
