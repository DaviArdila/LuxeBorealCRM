import type { ContextoHerramienta } from '../../dominio/herramienta.js';
import { crearDerivarAAsesor } from './derivar-a-asesor.js';

// Escenarios AGT24 de `openspec/changes/fase-12d-derivar-sin-silencio/specs/agente/spec.md`.

const CONTEXTO: ContextoHerramienta = { sesion: { conversacionId: 'conv-1', version: 0 }, contactoId: 'k', efectosPrevios: [] };

describe('modulos/agente/aplicacion/herramientas — derivar_a_asesor', () => {
  it('AGT24 — El cliente pide un asesor y el modelo avisa', async () => {
    const resultado = await crearDerivarAAsesor().ejecutar({ motivo: 'Pide hablar con una persona' }, CONTEXTO);

    expect(resultado.paraElModelo).toEqual({ derivado: true });
    expect(resultado.efectos).toEqual([{ tipo: 'avisar-asesor', motivo: 'pide-asesor' }]);
  });

  it('AGT24 — Fuera de horario también avisa', async () => {
    // La herramienta no consulta el horario: el mismo efecto sale dentro y fuera de él.
    const dentro = await crearDerivarAAsesor().ejecutar({ motivo: 'Consulta mayorista' }, CONTEXTO);
    const fuera = await crearDerivarAAsesor().ejecutar({ motivo: 'Consulta mayorista' }, CONTEXTO);

    expect(fuera.efectos).toEqual(dentro.efectos);
    expect(fuera.efectos).toEqual([{ tipo: 'avisar-asesor', motivo: 'pide-asesor' }]);
  });

  it('AGT24 — El motivo escrito por el modelo no queda en ningún lado', async () => {
    const resultado = await crearDerivarAAsesor().ejecutar({ motivo: 'Laura Gómez quiere un descuento' }, CONTEXTO);

    expect(JSON.stringify(resultado)).not.toContain('Laura');
  });

  it('AGT24 — Un motivo de más de 200 caracteres es un argumento inválido', () => {
    const herramienta = crearDerivarAAsesor();

    expect(herramienta.definicion.esquema.safeParse({ motivo: 'a'.repeat(200) }).success).toBe(true);
    expect(herramienta.definicion.esquema.safeParse({ motivo: 'a'.repeat(201) }).success).toBe(false);
    expect(() => herramienta.ejecutar({ motivo: 'a'.repeat(201) }, CONTEXTO)).toThrow();
  });

  it('AGT24 — La descripción solo dice qué hace y qué devuelve, sin criterio de negocio ni traspaso', () => {
    const { nombre, descripcion } = crearDerivarAAsesor().definicion;

    expect(nombre).toBe('derivar_a_asesor');
    expect(descripcion).toMatch(/avisa a un asesor humano/i);
    expect(descripcion).toMatch(/sin traspasar/i);
    expect(descripcion).toContain('derivado');
    expect(descripcion).not.toMatch(/cuando|si el cliente|usa esta/i);
  });

  it('AGT24 — Rechaza argumentos adicionales y un motivo vacío', () => {
    const { esquema } = crearDerivarAAsesor().definicion;

    expect(esquema.safeParse({ motivo: '' }).success).toBe(false);
    expect(esquema.safeParse({ motivo: 'ok', extra: 1 }).success).toBe(false);
  });
});
