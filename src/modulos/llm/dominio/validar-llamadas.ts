import type {
  DefinicionHerramienta,
  IncidenciaEsquema,
  LlamadaHerramienta,
  LlamadaInvalida,
} from './tipos-llm.js';

export interface ResultadoValidacionLlamadas {
  readonly validas: readonly LlamadaHerramienta[];
  readonly invalidas: readonly LlamadaInvalida[];
}

function describirIncidencias(incidencias: readonly IncidenciaEsquema[]): string {
  return incidencias
    .map((incidencia) => {
      const campo = incidencia.path.length > 0 ? incidencia.path.map(String).join('.') : 'argumentos';
      return `${campo}: ${incidencia.message}`;
    })
    .join('; ');
}

// Comprueba la forma, no el contenido: una llamada válida pasa idéntica (misma referencia, sin
// aplicar defaults ni recortar claves) y una inválida nunca se sustituye por `{}` (A7, LLM2).
export function validarLlamadasHerramienta(
  llamadas: readonly LlamadaHerramienta[],
  definiciones: readonly DefinicionHerramienta[],
): ResultadoValidacionLlamadas {
  const porNombre = new Map(definiciones.map((definicion) => [definicion.nombre, definicion]));
  const validas: LlamadaHerramienta[] = [];
  const invalidas: LlamadaInvalida[] = [];

  for (const llamada of llamadas) {
    const definicion = porNombre.get(llamada.nombre);
    if (definicion === undefined) {
      invalidas.push({
        llamada,
        causa: `herramienta "${llamada.nombre}" no definida en la solicitud`,
      });
      continue;
    }
    const resultado = definicion.esquema.safeParse(llamada.argumentos);
    if (resultado.success) {
      validas.push(llamada);
    } else {
      invalidas.push({ llamada, causa: describirIncidencias(resultado.error.issues) });
    }
  }

  return { validas, invalidas };
}
