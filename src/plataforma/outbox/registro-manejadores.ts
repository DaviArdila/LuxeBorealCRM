import { Injectable } from '@nestjs/common';
import type { ManejadorOutbox } from './tipos.js';

/**
 * Registro de manejadores del outbox genérico por `tipo` (D10 de `design.md`): mismo patrón de
 * inversión de dependencia que `RegistroConsumidorEventosCanal` de `modulos/canales` (D8) — "el de
 * abajo no conoce al de arriba" — aplicado aquí a `plataforma/outbox`, que MUST NOT importar
 * `modulos/` (regla de fronteras 7). A diferencia de D8 (un solo consumidor "de por defecto"), aquí
 * cada `tipo` es independiente: la Fase 04/T7 registra `'canal.mensaje'`, `'canal.estado'` y
 * `'canal.etiquetas'` por separado. Registrar dos veces el mismo `tipo` es un error de
 * programación: nadie decide cuál de los dos manejadores gana.
 */
@Injectable()
export class RegistroManejadoresOutbox {
  private readonly manejadores = new Map<string, ManejadorOutbox>();

  registrar(tipo: string, manejador: ManejadorOutbox): void {
    if (this.manejadores.has(tipo)) {
      throw new Error(`Ya hay un manejador de outbox registrado para el tipo "${tipo}" (D10).`);
    }
    this.manejadores.set(tipo, manejador);
  }

  obtener(tipo: string): ManejadorOutbox | undefined {
    return this.manejadores.get(tipo);
  }
}
