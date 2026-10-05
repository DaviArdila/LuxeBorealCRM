import type { Clock } from '../../../plataforma/reloj/index.js';
import type { RepositorioHorario } from '../puertos/repositorio-horario.js';
import { HorarioAtencion } from './horario-atencion.js';

// HOR7 — título tomado literalmente de
// `openspec/changes/fase-02-catalogo/specs/horario/spec.md`. HOR1-HOR6 ya se prueban como funciones
// puras en `dominio/horario.spec.ts` (T4); aquí solo se prueba la orquestación (T9).

/** `Clock` de prueba fijado a un instante conocido (nunca `Date.now()`/`new Date()` en el SUT). */
class ClockDePrueba implements Clock {
  constructor(private readonly instante: Date) {}
  ahora(): Date {
    return this.instante;
  }
}

/** Doble de `RepositorioHorario`: registra los argumentos con los que se le llamó. */
class RepositorioHorarioFalso implements RepositorioHorario {
  fechaIsoConsultada: string | undefined;
  obtenerPatronSemanalLlamado = false;

  constructor(
    private readonly excepcion: boolean,
    private readonly patron: unknown,
  ) {}

  existeExcepcion(fechaIso: string): Promise<boolean> {
    this.fechaIsoConsultada = fechaIso;
    return Promise.resolve(this.excepcion);
  }

  obtenerPatronSemanal(): Promise<unknown> {
    this.obtenerPatronSemanalLlamado = true;
    return Promise.resolve(this.patron);
  }
}

describe('modulos/horario/aplicacion/HorarioAtencion', () => {
  it('HOR7 — Sin fecha explícita, el puerto usa el momento que devuelve el Clock inyectado', async () => {
    // 2026-09-16T15:30:00Z → miércoles 10:30 en Bogotá, sin excepción ni patrón que cambien el
    // resultado (sin parámetro configurado ⇒ HOR2, dentro de horario).
    const instanteConocido = new Date('2026-09-16T15:30:00Z');
    const clock = new ClockDePrueba(instanteConocido);
    const repositorio = new RepositorioHorarioFalso(false, null);
    const horarioAtencion = new HorarioAtencion(repositorio, clock);

    const resultado = await horarioAtencion.estaDentroDeHorario();

    expect(resultado).toBe(true);
    expect(repositorio.fechaIsoConsultada).toBe('2026-09-16');
  });

  it('combina existeExcepcion + patrón semanal a través de decidirDentroDeHorario (excepción gana sobre un patrón que diría abierto)', async () => {
    const momentoExplicito = new Date('2026-09-16T15:30:00Z'); // mié 10:30 Bogotá
    const clock = new ClockDePrueba(new Date('2099-01-01T00:00:00Z')); // no debe usarse: hay fecha explícita
    const repositorio = new RepositorioHorarioFalso(true, { mie: '08:00-18:00' });
    const horarioAtencion = new HorarioAtencion(repositorio, clock);

    const resultado = await horarioAtencion.estaDentroDeHorario(momentoExplicito);

    expect(resultado).toBe(false);
    expect(repositorio.fechaIsoConsultada).toBe('2026-09-16');
    // La excepción gana: no hace falta consultar el patrón semanal.
    expect(repositorio.obtenerPatronSemanalLlamado).toBe(false);
  });

  it('sin excepción, consulta el patrón semanal y evalúa el rango del día contra los minutos del momento', async () => {
    const momentoExplicito = new Date('2026-09-16T15:30:00Z'); // mié 10:30 Bogotá
    const clock = new ClockDePrueba(new Date('2099-01-01T00:00:00Z'));
    const repositorio = new RepositorioHorarioFalso(false, { mie: '11:00-18:00' });
    const horarioAtencion = new HorarioAtencion(repositorio, clock);

    const resultado = await horarioAtencion.estaDentroDeHorario(momentoExplicito);

    expect(resultado).toBe(false); // 10:30 está antes de las 11:00
    expect(repositorio.obtenerPatronSemanalLlamado).toBe(true);
  });
});
