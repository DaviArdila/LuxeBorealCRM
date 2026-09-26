import { auditarDependencias, type ResultadoAuditoria } from './auditar-dependencias.js';
import { buscarSecretosEnArbol, buscarSecretosEnHistorial } from './buscar-secretos.js';
import type { ResultadoBusquedaSecretos } from './buscar-secretos.js';
import { verificarCommits, type ResultadoVerificacionCommits } from './verificar-commits.js';
import { generarContrato, type ResultadoContrato } from './generar-contrato.js';
import { verificarDerivaContrato } from './verificar-deriva-contrato.js';
import { compararContrato, type ResultadoComparacionContrato } from './comparar-contrato.js';
import { validarFlujos, type ResultadoValidacionFlujos } from './validar-flujos.js';
import { sembrarGeografia, type ResultadoSemillaGeografia } from './sembrar-geografia.js';

/**
 * Único punto de entrada de línea de comandos para los scripts de esta fase (`package.json`:
 * `secretos`, `secretos:historial`, `commits`, `auditoria`, `contrato:generar`, `contrato:deriva`).
 * `scripts/buscar-secretos.ts`,
 * `verificar-commits.ts` y `auditar-dependencias.ts` exportan **solo** funciones — sin código de
 * nivel superior que se ejecute al importarlas — porque bajo `vite-node` (D12) el patrón habitual
 * `import.meta.url === file://${process.argv[1]}` para detectar "soy el entrypoint" no funciona:
 * `vite-node` reemplaza `process.argv[1]` por la ruta de su propio CLI (`vite-node/dist/cli.mjs`) y
 * nunca expone la ruta del script objetivo en `process.argv`, así que la comparación siempre da
 * falso (confirmado en la máquina real de esta tarea, checkpoint (d) de `tasks.md`; el mismo
 * módulo también lo cargan los tests de `test/fronteras/` bajo Vitest, así que un
 * `main()` sin guardia se ejecutaría también al importarlo desde un test). Aislar el disparo de
 * CLI en este único archivo — que ningún test importa — evita ambos problemas sin depender de una
 * variable de entorno (que además no sería portable entre `cmd.exe` y `bash`, D12).
 */
type Resultado =
  | ResultadoBusquedaSecretos
  | ResultadoVerificacionCommits
  | ResultadoAuditoria
  | ResultadoContrato
  | ResultadoComparacionContrato
  | ResultadoValidacionFlujos
  | ResultadoSemillaGeografia;

function imprimirResultado(resultado: Resultado): void {
  process.stdout.write(`${resultado.mensaje}\n`);
  if (!resultado.limpio) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [comando, ...resto] = process.argv.slice(2);

  switch (comando) {
    case 'secretos': {
      const modo = resto.includes('--historial') ? 'historial' : 'arbol';
      imprimirResultado(
        modo === 'historial' ? await buscarSecretosEnHistorial() : await buscarSecretosEnArbol(),
      );
      return;
    }
    case 'commits':
      imprimirResultado(await verificarCommits());
      return;
    case 'auditoria':
      imprimirResultado(await auditarDependencias());
      return;
    case 'contrato:generar':
      imprimirResultado(await generarContrato());
      return;
    case 'contrato:deriva':
      imprimirResultado(await verificarDerivaContrato());
      return;
    case 'contrato:diff':
      imprimirResultado(await compararContrato());
      return;
    case 'flujos':
      imprimirResultado(await validarFlujos());
      return;
    case 'semilla:geografia':
      imprimirResultado(await sembrarGeografia());
      return;
    default:
      process.stderr.write(
        `cli: comando desconocido "${comando ?? ''}". Comandos válidos: secretos, commits, ` +
          'auditoria, contrato:generar, contrato:deriva, contrato:diff, flujos, ' +
          'semilla:geografia.\n',
      );
      process.exitCode = 1;
  }
}

await main();
