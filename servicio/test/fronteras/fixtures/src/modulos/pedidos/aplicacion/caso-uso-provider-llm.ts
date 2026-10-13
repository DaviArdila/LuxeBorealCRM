// Fixture de fronteras (regla 14 — ai-solo-en-infraestructura-llm, violación): tampoco el provider
// de un proveedor (`@ai-sdk/*`) puede importarse fuera de `modulos/llm/infraestructura/`.
import { createAnthropic } from '@ai-sdk/anthropic';

export const casoUsoProviderLlm = createAnthropic;
