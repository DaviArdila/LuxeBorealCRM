import { Injectable } from '@nestjs/common';
import type { ColaEventosEntrantes } from '../puertos/cola-eventos-entrantes.js';

/**
 * Doble temporal del puerto {@link ColaEventosEntrantes} (T3 de `tasks.md`, D16 de `design.md`):
 * `CanalesModule` necesita un provider real para `COLA_EVENTOS_ENTRANTES` antes de que exista
 * `plataforma/colas` (T4), pero el webhook de esta tarea no depende de que el evento se procese de
 * verdad — solo de que quede registrado en `evento_entrante` (D5). `encolar` no hace nada; T4
 * sustituye este archivo por `ColaEventosEntrantesBullmq` en `canales.module.ts`, sin tocar
 * `RegistrarEventoEntrante` (que solo conoce el puerto, nunca esta clase).
 */
@Injectable()
export class ColaEventosEntrantesDoble implements ColaEventosEntrantes {
  // Sin parámetro `id` (D16): un método con menos parámetros sigue satisfiendo la interfaz
  // (comparación estructural de TypeScript) y evita declarar un parámetro sin usar.
  async encolar(): Promise<void> {
    // Intencionalmente vacío: el barrido del inbox (T4) recogerá cualquier fila pendiente.
  }
}
