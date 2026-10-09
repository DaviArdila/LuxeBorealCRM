import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';

/**
 * Versión del prompt que se registra en cada turno. Un cambio de prompt sube la versión. Cada archivo lleva el sufijo de la
 * última versión en que cambió: `seguridad.v1.md` y `estilo.v4.md` (Fase 12d) y `turno.v3.md`.
 */
const VERSION_PROMPT = 'v5';
const VERSION_SEGURIDAD = 'v1';
const VERSION_ESTILO = 'v4';
const VERSION_TURNO = 'v3';

/**
 * Carga una sola vez, al arrancar, los archivos versionados del prompt (D8 de la Fase 07b, AGT13): `seguridad`
 * (los seis límites del modelo y de los datos, sin negocio), `estilo` (solo el respaldo mínimo cuando la base no tiene
 * secciones, D1 de la Fase 08b) y `turno`. La ruta se resuelve con `import.meta.dirname`, así funciona igual desde `src/`
 * (tests) y desde `dist/` (`nest-cli.json` copia los `.md` al build). Un archivo ausente hace fallar el arranque, no el
 * primer mensaje de un cliente.
 */
@Injectable()
export class CargadorPrompts implements OnModuleInit {
  readonly version = VERSION_PROMPT;
  seguridad = '';
  estilo = '';
  turno = '';

  onModuleInit(): void {
    const carpeta = path.resolve(import.meta.dirname, '..', '..', 'prompts');
    this.seguridad = readFileSync(path.join(carpeta, `seguridad.${VERSION_SEGURIDAD}.md`), 'utf8');
    this.estilo = readFileSync(path.join(carpeta, `estilo.${VERSION_ESTILO}.md`), 'utf8');
    this.turno = readFileSync(path.join(carpeta, `turno.${VERSION_TURNO}.md`), 'utf8');
  }
}
