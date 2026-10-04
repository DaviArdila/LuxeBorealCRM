import { ejecutarHerramienta, IMAGEN_ACTIONLINT, resolverRaizRepositorio } from './herramientas.js';

/**
 * `flujos` (CI6, D10). Valida estáticamente `.github/workflows/` con `actionlint` (vía Docker,
 * imagen fijada D10) para detectar un YAML de workflow mal formado o una acción inexistente sin
 * necesidad de un remoto real donde ejecutarlo (Q4 de `proposal.md`).
 */
export interface ResultadoValidacionFlujos {
  readonly limpio: boolean;
  readonly mensaje: string;
}

export async function validarFlujos(
  raiz: string = resolverRaizRepositorio(),
): Promise<ResultadoValidacionFlujos> {
  const resultado = await ejecutarHerramienta(IMAGEN_ACTIONLINT, ['-color'], {
    montarDesde: raiz,
    directorioTrabajo: '/repo',
  });

  if (resultado.codigo === 0) {
    return {
      limpio: true,
      mensaje: 'flujos: .github/workflows/ pasa actionlint sin errores.',
    };
  }
  return {
    limpio: false,
    mensaje: `flujos: actionlint encontró problemas:\n${resultado.salida}${resultado.salidaError}`,
  };
}
