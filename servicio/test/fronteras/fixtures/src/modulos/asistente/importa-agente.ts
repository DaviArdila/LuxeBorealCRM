// Fixture de fronteras (T5 de fase-12, regla 16, violación): `asistente` no importa a sus consumidores, ni siquiera su
// barril (D2 de la Fase 12): la lista de casos del sistema vive en `asistente` y los demás importan sus claves.
import { agenteFicticio } from '../agente/index.js';

export const importaAgente = agenteFicticio;
