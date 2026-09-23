/**
 * Carga `.env` (raíz del proyecto) con `process.loadEnvFile` de Node 24, fuera de producción.
 * `process.loadEnvFile` no sobrescribe variables ya definidas en `process.env` (comportamiento
 * nativo de Node, verificado en `design.md` D8); si `.env` no existe, no hace nada — no es un
 * error, es el caso normal en producción y en CI. Se llama desde `main.ts` antes de crear la app.
 */
export function cargarArchivoEntorno(
  entorno: Readonly<Record<string, string | undefined>> = process.env,
): void {
  if (entorno.NODE_ENV === 'production') {
    return;
  }

  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if (esArchivoNoEncontrado(error)) {
      return;
    }
    throw error;
  }
}

function esArchivoNoEncontrado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
