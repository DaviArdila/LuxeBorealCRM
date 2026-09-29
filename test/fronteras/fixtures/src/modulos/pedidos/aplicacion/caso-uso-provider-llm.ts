// Fixture de fronteras (regla 14 — ai-solo-en-infraestructura-llm, violación): tampoco el provider
// de OpenRouter puede importarse fuera de `modulos/llm/infraestructura/`.
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export const casoUsoProviderLlm = createOpenRouter;
