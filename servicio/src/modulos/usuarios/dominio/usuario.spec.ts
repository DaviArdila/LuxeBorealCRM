import { describe, expect, it } from 'vitest';
import { esRol, normalizarEmail, ROLES } from './usuario.js';

// Dominio puro de `usuarios` (T2 de la Fase 11a, design.md «Puertos y adaptadores»).

describe('modulos/usuarios/dominio — usuario', () => {
  it('los roles son exactamente admin y asesor, como el enum RolUsuario del esquema', () => {
    expect(ROLES).toEqual(['admin', 'asesor']);
  });

  it('esRol acepta solo los roles conocidos', () => {
    expect(esRol('admin')).toBe(true);
    expect(esRol('asesor')).toBe(true);
    expect(esRol('Admin')).toBe(false);
    expect(esRol('dueno')).toBe(false);
  });

  it('normalizarEmail quita espacios de los bordes y pasa a minúsculas (USR1, USR10)', () => {
    expect(normalizarEmail('  Admin@Ejemplo.CO ')).toBe('admin@ejemplo.co');
  });

  it('normalizarEmail no altera un correo ya normalizado', () => {
    expect(normalizarEmail('admin@ejemplo.co')).toBe('admin@ejemplo.co');
  });
});
