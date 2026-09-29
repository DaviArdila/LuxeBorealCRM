// Los tipos del contrato viven en `dominio/` (y `puertos/llm-port.ts` los re-exporta) porque la
// regla de fronteras 3 impide que `dominio/` importe de `puertos/`. Ninguno depende de un SDK.

export type RolMensajeLlm = 'usuario' | 'asistente';

export interface LlamadaHerramienta {
  readonly id: string;
  readonly nombre: string;
  readonly argumentos: unknown;
  // Opaco ida y vuelta (p. ej. thoughtSignature de Gemini): el gateway nunca lo lee (D8, B7).
  readonly metadatosProveedor?: unknown;
}

export interface ResultadoHerramienta {
  readonly idLlamada: string;
  readonly nombre: string;
  readonly resultado: unknown;
  readonly esError: boolean;
}

export interface MensajeLlm {
  readonly rol: RolMensajeLlm;
  readonly texto?: string;
  readonly llamadasHerramienta?: readonly LlamadaHerramienta[];
  readonly resultadosHerramienta?: readonly ResultadoHerramienta[];
}

export interface IncidenciaEsquema {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

export type ResultadoValidacionEsquema =
  | { readonly success: true }
  | { readonly success: false; readonly error: { readonly issues: readonly IncidenciaEsquema[] } };

// Forma estructural de un esquema Zod: `dominio/` no puede importar `zod` (regla de fronteras 3).
export interface EsquemaArgumentos {
  safeParse(dato: unknown): ResultadoValidacionEsquema;
}

export interface DefinicionHerramienta {
  readonly nombre: string;
  readonly descripcion: string;
  readonly esquema: EsquemaArgumentos;
  readonly esquemaJson: Record<string, unknown>;
}

export type PerfilLlm = 'conversacion' | 'evals';

export interface SolicitudGeneracion {
  readonly perfil: PerfilLlm;
  readonly mensajes: readonly MensajeLlm[];
  // Parámetro separado, nunca el primer mensaje (D1).
  readonly systemPrompt?: string;
  readonly herramientas?: readonly DefinicionHerramienta[];
  readonly conversacionId?: string;
}

export interface UsoReportado {
  readonly tokensEntrada: number;
  readonly tokensSalida: number;
  readonly tokensCache: number;
}

export interface LlamadaInvalida {
  readonly llamada: LlamadaHerramienta;
  readonly causa: string;
}

export interface RespuestaGeneracion {
  readonly texto?: string;
  // Solo las que validan contra su esquema (D13).
  readonly llamadasHerramienta?: readonly LlamadaHerramienta[];
  readonly llamadasInvalidas?: readonly LlamadaInvalida[];
  readonly uso?: UsoReportado;
  readonly metadatosProveedor?: unknown;
}
