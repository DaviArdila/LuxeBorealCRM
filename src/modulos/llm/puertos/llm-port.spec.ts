import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { FakePuertoLlm } from '../../../../test/fakes/puerto-llm-falso.js';
import { validarLlamadasHerramienta } from '../dominio/validar-llamadas.js';
import type { DefinicionHerramienta, LlamadaHerramienta } from '../dominio/tipos-llm.js';
import type { LlmPort, SolicitudGeneracion } from './llm-port.js';

const esquemaBusqueda = z.object({ consulta: z.string() });

const herramientas: readonly DefinicionHerramienta[] = [
  {
    nombre: 'buscar_producto',
    descripcion: 'Busca un producto por texto',
    esquema: esquemaBusqueda,
    esquemaJson: z.toJSONSchema(esquemaBusqueda),
  },
];

// Un llamador que solo conoce `LlmPort` y sus tipos propios (LLM1).
async function pedirGeneracion(llm: LlmPort, solicitud: SolicitudGeneracion) {
  return llm.generar(solicitud);
}

function leerFuente(rutaRelativa: string): string {
  return readFileSync(fileURLToPath(new URL(rutaRelativa, import.meta.url)), 'utf8');
}

describe('modulos/llm/puertos — LlmPort', () => {
  it('LLM1 — Generación con tipos propios sin SDK en el contrato', async () => {
    const llm = new FakePuertoLlm();
    const llamada: LlamadaHerramienta = {
      id: 'c1',
      nombre: 'buscar_producto',
      argumentos: { consulta: 'reloj' },
    };
    llm.encolar({
      respuesta: {
        texto: 'Te busco el reloj',
        llamadasHerramienta: [llamada],
        uso: { tokensEntrada: 120, tokensSalida: 30, tokensCache: 0 },
      },
    });
    const solicitud: SolicitudGeneracion = {
      perfil: 'conversacion',
      systemPrompt: 'Eres el asistente de la tienda.',
      mensajes: [{ rol: 'usuario', texto: 'Busco un reloj' }],
      herramientas,
    };

    const respuesta = await pedirGeneracion(llm, solicitud);

    expect(respuesta.texto).toBe('Te busco el reloj');
    expect(respuesta.llamadasHerramienta).toEqual([llamada]);
    expect(respuesta.uso).toEqual({ tokensEntrada: 120, tokensSalida: 30, tokensCache: 0 });
    expect(llm.solicitudes[0]).toBe(solicitud);
    const fuentes = [
      leerFuente('./llm-port.ts'),
      leerFuente('../dominio/tipos-llm.ts'),
      leerFuente('../dominio/error-pasarela-llm.ts'),
    ];
    for (const fuente of fuentes) {
      expect(fuente).not.toMatch(/from\s+['"](ai|@openrouter\/[^'"]+)['"]/);
    }
  });

  it('LLM1 — Metadatos opacos del proveedor se transportan sin interpretar', async () => {
    const firma = { thoughtSignature: 'abc123', anidado: { nivel: [1, 2, 3] } };
    const referenciaUso = { usage: { cost: 0.0004 } };
    const llamada: LlamadaHerramienta = {
      id: 'c1',
      nombre: 'buscar_producto',
      argumentos: { consulta: 'reloj' },
      metadatosProveedor: firma,
    };
    const llm = new FakePuertoLlm();
    llm.encolar({
      respuesta: {
        llamadasHerramienta: [llamada],
        metadatosProveedor: referenciaUso,
      },
    });

    const respuesta = await pedirGeneracion(llm, {
      perfil: 'conversacion',
      mensajes: [{ rol: 'usuario', texto: 'hola' }],
    });
    const validadas = validarLlamadasHerramienta(respuesta.llamadasHerramienta ?? [], herramientas);

    expect(respuesta.metadatosProveedor).toBe(referenciaUso);
    expect(validadas.validas).toHaveLength(1);
    expect(validadas.validas[0]?.metadatosProveedor).toBe(firma);
  });
});
