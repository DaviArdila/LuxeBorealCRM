// Fixture de fronteras (regla 14 — ai-solo-en-infraestructura-llm, permitido): el único lugar
// donde el SDK del proveedor y su provider de OpenRouter pueden aparecer.
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText } from 'ai';

export const adaptadorPermitido = { generateText, createOpenRouter, createOpenAI };
