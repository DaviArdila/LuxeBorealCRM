// Fixture de fronteras (regla 14 — ai-solo-en-infraestructura-llm, permitido): el único lugar
// donde el SDK y los providers de los proveedores pueden aparecer.
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

export const adaptadorPermitido = { generateText, createAnthropic, createOpenAI };
