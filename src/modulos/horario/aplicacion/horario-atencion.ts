import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../plataforma/reloj/index.js';
import { decidirDentroDeHorario, momentoLocal } from '../dominio/horario.js';
import type { Horario } from '../puertos/horario.js';
import { REPOSITORIO_HORARIO, type RepositorioHorario } from '../puertos/repositorio-horario.js';

/**
 * Implementación real del puerto {@link Horario} (design.md D5, `tasks.md` T9). Orquestador fino:
 * resuelve el momento local (`dominio/horario.js`), pide la excepción y el patrón semanal crudo al
 * {@link RepositorioHorario}, y deja que `decidirDentroDeHorario` (dominio puro) decida. Sin `fecha`
 * explícita, el momento por defecto viene del {@link Clock} inyectado (`this.clock.ahora()`, HOR7) —
 * nunca `Date.now()`/`new Date()` directamente (PLT2).
 */
@Injectable()
export class HorarioAtencion implements Horario {
  constructor(
    @Inject(REPOSITORIO_HORARIO) private readonly repositorioHorario: RepositorioHorario,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async estaDentroDeHorario(fecha: Date = this.clock.ahora()): Promise<boolean> {
    const momento = momentoLocal(fecha);

    const existeExcepcion = await this.repositorioHorario.existeExcepcion(momento.fechaIso);
    if (existeExcepcion) {
      return decidirDentroDeHorario(momento, true, undefined).dentro;
    }

    const valorCrudo = await this.repositorioHorario.obtenerPatronSemanal();
    return decidirDentroDeHorario(momento, false, valorCrudo).dentro;
  }
}
