import type { SolicitudGeneracion } from '../dominio/tipos-llm.js';
import type { LimiteIntento, ResultadoAdaptador } from '../puertos/adaptador-llm.js';
import { AdaptadorAiSdk, type ProveedorLlm } from './adaptador-ai-sdk.js';
import { AdaptadorEnrutador } from './adaptador-enrutador.js';

const SOLICITUD: SolicitudGeneracion = {
  perfil: 'conversacion',
  mensajes: [{ rol: 'usuario', texto: 'hola' }],
};
const LIMITE: LimiteIntento = { maxTokens: 400, abort: new AbortController().signal };
const RESULTADO: ResultadoAdaptador = {
  texto: 'ok',
  uso: { tokensEntrada: 1, tokensSalida: 1, tokensCache: 0 },
};

function proveedorFalso(nombre: string): ProveedorLlm {
  return {
    nombre,
    crearModelo: () => {
      throw new Error('no se crea un modelo real en este test');
    },
    normalizarUso: () => RESULTADO.uso,
  };
}

class GenericoFalso {
  readonly llamadas: { proveedor: string; modelo: string }[] = [];
  error: Error | undefined;

  generarConModelo(
    proveedor: ProveedorLlm,
    modelo: string,
  ): Promise<ResultadoAdaptador> {
    this.llamadas.push({ proveedor: proveedor.nombre, modelo });
    return this.error === undefined ? Promise.resolve(RESULTADO) : Promise.reject(this.error);
  }
}

function crear() {
  const generico = new GenericoFalso();
  const enrutador = new AdaptadorEnrutador(
    [proveedorFalso('anthropic'), proveedorFalso('openai')],
    generico as unknown as AdaptadorAiSdk,
  );
  return { generico, enrutador };
}

describe('modulos/llm/infraestructura — AdaptadorEnrutador (LLM15, LLM16, LLM26)', () => {
  it('LLM15 — Un id con prefijo se llama directo al proveedor indicado', async () => {
    const { generico, enrutador } = crear();

    const resultado = await enrutador.generarConModelo('openai:gpt-6-luna', SOLICITUD, LIMITE);
    await enrutador.generarConModelo('anthropic:claude-haiku-5-5', SOLICITUD, LIMITE);

    expect(resultado).toBe(RESULTADO);
    expect(generico.llamadas).toEqual([
      { proveedor: 'openai', modelo: 'gpt-6-luna' },
      { proveedor: 'anthropic', modelo: 'claude-haiku-5-5' },
    ]);
  });

  it('LLM26 — Un id sin prefijo registrado se rechaza sin llamar a ningún proveedor', async () => {
    const { generico, enrutador } = crear();

    await expect(
      enrutador.generarConModelo('meta-llama/llama-3-8b:free', SOLICITUD, LIMITE),
    ).rejects.toThrow(/proveedor registrado/);
    await expect(enrutador.generarConModelo('openai/gpt-5.6-luna', SOLICITUD, LIMITE)).rejects.toThrow(
      /proveedor registrado/,
    );
    expect(generico.llamadas).toHaveLength(0);
  });

  it('propaga tal cual el error del adaptador genérico, sin envolverlo ni reintentar', async () => {
    const { generico, enrutador } = crear();
    generico.error = new Error('fallo del proveedor');

    await expect(enrutador.generarConModelo('openai:gpt-6-luna', SOLICITUD, LIMITE)).rejects.toBe(
      generico.error,
    );
    expect(generico.llamadas).toHaveLength(1);
  });

  it('un proveedor que no se construyó falla sin llamar al SDK y sin nombrar secretos', async () => {
    const generico = new GenericoFalso();
    const enrutador = new AdaptadorEnrutador(
      [proveedorFalso('anthropic')],
      generico as unknown as AdaptadorAiSdk,
    );

    await expect(enrutador.generarConModelo('openai:gpt-6-luna', SOLICITUD, LIMITE)).rejects.toThrow(
      /openai/,
    );
    expect(generico.llamadas).toHaveLength(0);
  });
});
