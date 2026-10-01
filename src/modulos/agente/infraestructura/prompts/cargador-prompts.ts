import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Injectable, type OnModuleInit } from '@nestjs/common';

/** Versión de los archivos de `prompts/`: el sufijo `.v1.md`. Un cambio de prompt sube la versión. */
const VERSION_PROMPT = 'v2';

/**
 * Carga una sola vez, al arrancar, los archivos versionados del prompt (D8 de la Fase 07b, AGT13): `reglas`
 * (lo no negociable), `estilo` (tono y formato, lo que el dueño ajusta; D1 de la Fase 08b) y `turno`. La
 * ruta se resuelve con `import.meta.dirname`, así funciona igual desde `src/` (tests) y desde `dist/`
 * (`nest-cli.json` copia los `.md` al build). Un archivo ausente hace fallar el arranque, no el
 * primer mensaje de un cliente.
 */
@Injectable()
export class CargadorPrompts implements OnModuleInit {
  readonly version = VERSION_PROMPT;
  reglas = '';
  estilo = '';
  turno = '';

  onModuleInit(): void {
    const carpeta = path.resolve(import.meta.dirname, '..', '..', 'prompts');
    this.reglas = readFileSync(path.join(carpeta, `reglas.${VERSION_PROMPT}.md`), 'utf8');
    this.estilo = readFileSync(path.join(carpeta, `estilo.${VERSION_PROMPT}.md`), 'utf8');
    this.turno = readFileSync(path.join(carpeta, `turno.${VERSION_PROMPT}.md`), 'utf8');
  }
}
