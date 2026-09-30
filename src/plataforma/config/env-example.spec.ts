import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { cargarConfiguracion } from './cargar-configuracion.js';
import { esquemaConfiguracion } from './esquema.js';

// `.env.example` es la plantilla que se copia a `.env` (PLT1): si se desalinea del esquema, el primer
// arranque local falla o se queda sin documentar una variable.

const contenido = readFileSync('.env.example', 'utf8');

// Una variable opcional puede venir comentada (`# CLAVE=`) para no enviar un valor vacío.
const documentadas = new Set(
  [...contenido.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((coincidencia) => coincidencia[1]),
);

describe('plataforma/config — .env.example', () => {
  it('documenta cada variable del esquema de configuración', () => {
    const claves = Object.keys(esquemaConfiguracion.shape);

    const sinDocumentar = claves.filter((clave) => !documentadas.has(clave));

    expect(claves.length).toBeGreaterThan(50);
    expect(sinDocumentar).toEqual([]);
  });

  it('no documenta variables que el esquema no conoce', () => {
    const claves = new Set(Object.keys(esquemaConfiguracion.shape));

    const sobrantes = [...documentadas].filter((clave) => !claves.has(clave));

    expect(sobrantes).toEqual([]);
  });

  it('copiado a .env produce una configuración válida de desarrollo', () => {
    const entorno = parseEnv(contenido);

    const configuracion = cargarConfiguracion(entorno);

    expect(configuracion.NODE_ENV).toBe('development');
    expect(configuracion.LLM_CONVERSACION_MODELOS).toEqual(['openai/gpt-6-luna']);
    expect(configuracion.LLM_TECHO_MENSUAL_USD).toBe(10);
    expect(configuracion.LOCK_TURNO_TTL_S).toBe(30);
  });
});
