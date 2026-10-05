import { describe, expect, it } from 'vitest';
import { sesionVencida } from './sesion.js';

// USR3: una sesión deja de valer al cumplir SESION_DURACION_MAX_H horas desde su creación, aunque
// haya tenido actividad.

const creada = new Date('2026-10-03T15:00:00Z');
const HORA_MS = 60 * 60 * 1000;

describe('modulos/usuarios/dominio — sesionVencida', () => {
  it('una sesión de 167 horas con máximo de 168 sigue vigente', () => {
    expect(sesionVencida(creada, new Date(creada.getTime() + 167 * HORA_MS), 168)).toBe(false);
  });

  it('una sesión vence justo al cumplir la duración máxima', () => {
    expect(sesionVencida(creada, new Date(creada.getTime() + 168 * HORA_MS), 168)).toBe(true);
  });

  it('una sesión de 169 horas con máximo de 168 está vencida', () => {
    expect(sesionVencida(creada, new Date(creada.getTime() + 169 * HORA_MS), 168)).toBe(true);
  });

  it('un instante anterior a la creación (reloj desfasado) no la vence', () => {
    expect(sesionVencida(creada, new Date(creada.getTime() - HORA_MS), 168)).toBe(false);
  });
});
