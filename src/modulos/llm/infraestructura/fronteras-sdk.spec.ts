import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// LLM20: la regla de fronteras (`npm run fronteras`) impide importar un SDK fuera de esta carpeta;
// este test fija además la estructura interna: un archivo por SDK de proveedor y `ai` solo en el
// adaptador genérico.

const RAIZ = import.meta.dirname;

function archivosDeProduccion(directorio: string): string[] {
  return readdirSync(directorio, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      return archivosDeProduccion(ruta);
    }
    return entrada.name.endsWith('.ts') && !entrada.name.endsWith('.spec.ts') ? [ruta] : [];
  });
}

const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;

function paquetesImportados(archivo: string): string[] {
  const codigo = readFileSync(archivo, 'utf8');
  return [...codigo.matchAll(IMPORT)].map((coincidencia) => coincidencia[1] ?? '');
}

function archivosQueImportan(patron: RegExp): string[] {
  return archivosDeProduccion(RAIZ)
    .filter((archivo) => paquetesImportados(archivo).some((paquete) => patron.test(paquete)))
    .map((archivo) => archivo.slice(RAIZ.length + 1).replaceAll('\\', '/'));
}

describe('modulos/llm/infraestructura — SDK de cada proveedor en un solo archivo (LLM20)', () => {
  it('LLM20 — Cada SDK de proveedor aparece en un solo archivo', () => {
    const paquetes = new Set(
      archivosDeProduccion(RAIZ)
        .flatMap(paquetesImportados)
        .filter((paquete) => /^(@ai-sdk|@openrouter)\//.test(paquete)),
    );

    expect(paquetes.size).toBeGreaterThan(0);
    for (const paquete of paquetes) {
      expect(archivosQueImportan(new RegExp(`^${paquete}$`)), paquete).toHaveLength(1);
    }
  });

  it('LLM20 — `ai` solo aparece en el adaptador genérico', () => {
    expect(archivosQueImportan(/^ai$/)).toEqual(['adaptador-ai-sdk.ts']);
  });
});
