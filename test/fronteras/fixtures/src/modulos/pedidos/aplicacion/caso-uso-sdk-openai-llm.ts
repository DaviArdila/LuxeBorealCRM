// Fixture de fronteras (regla 14 — ai-solo-en-infraestructura-llm, violación, LLM20): fuera de
// `modulos/llm/infraestructura/` MUST NOT importarse el SDK de ningún proveedor `@ai-sdk/*`.
import { createOpenAI } from '@ai-sdk/openai';

export const casoUsoSdkOpenAiLlm = createOpenAI;
