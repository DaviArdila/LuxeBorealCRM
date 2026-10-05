// Fixture de fronteras (regla 14 — ai-solo-en-infraestructura-llm, violación): fuera de
// `modulos/llm/infraestructura/` MUST NOT importarse el SDK de un proveedor de LLM.
import { generateText } from 'ai';

export const casoUsoSdkLlm = generateText;
