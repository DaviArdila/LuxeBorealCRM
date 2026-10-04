import { InjectionToken } from '@angular/core';
import type { DefinicionArea } from './definicion-area';

/**
 * Las áreas que el shell muestra en el menú (D9). `app.config.ts` lo provee desde
 * `areas/registro/registro.ts`; los tests proveen áreas de prueba sin tocar el shell.
 */
export const AREAS_REGISTRADAS = new InjectionToken<readonly DefinicionArea[]>('AREAS_REGISTRADAS');
