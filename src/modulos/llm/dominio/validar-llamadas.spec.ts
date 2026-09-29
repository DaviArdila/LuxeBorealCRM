import { z } from 'zod';

import type { DefinicionHerramienta, LlamadaHerramienta } from './tipos-llm.js';
import { validarLlamadasHerramienta } from './validar-llamadas.js';

const esquemaPedido = z.object({
  productoId: z.string(),
  cantidad: z.number().int().positive(),
});

const definiciones: readonly DefinicionHerramienta[] = [
  {
    nombre: 'crear_pedido',
    descripcion: 'Crea un pedido',
    esquema: esquemaPedido,
    esquemaJson: z.toJSONSchema(esquemaPedido),
  },
  {
    nombre: 'consultar_stock',
    descripcion: 'Consulta el stock',
    esquema: z.object({ productoId: z.string() }),
    esquemaJson: { type: 'object' },
  },
];

function llamada(id: string, nombre: string, argumentos: unknown): LlamadaHerramienta {
  return { id, nombre, argumentos };
}

describe('modulos/llm/dominio — validarLlamadasHerramienta (D13)', () => {
  it('LLM2 — Definiciones y llamadas de herramientas se transportan sin interpretar', () => {
    const primera = llamada('c1', 'crear_pedido', { productoId: 'p-1', cantidad: 2, extra: 'x' });
    const segunda = llamada('c2', 'consultar_stock', { productoId: 'p-9' });

    const resultado = validarLlamadasHerramienta([primera, segunda], definiciones);

    expect(resultado.validas).toHaveLength(2);
    expect(resultado.validas[0]).toBe(primera);
    expect(resultado.validas[1]).toBe(segunda);
    expect(resultado.validas[0]?.argumentos).toEqual({
      productoId: 'p-1',
      cantidad: 2,
      extra: 'x',
    });
    expect(resultado.invalidas).toEqual([]);
  });

  it('LLM2 — Argumentos inválidos devuelven error de herramienta, nunca objeto vacío', () => {
    const invalida = llamada('c1', 'crear_pedido', { productoId: 'p-1', cantidad: 'dos' });

    const resultado = validarLlamadasHerramienta([invalida], definiciones);

    expect(resultado.validas).toEqual([]);
    expect(resultado.invalidas).toHaveLength(1);
    expect(resultado.invalidas[0]?.llamada).toBe(invalida);
    expect(resultado.invalidas[0]?.llamada.argumentos).toEqual({
      productoId: 'p-1',
      cantidad: 'dos',
    });
    expect(resultado.invalidas[0]?.causa).toContain('cantidad');
    expect(resultado.invalidas[0]?.causa).not.toContain('dos');
  });

  it('separa válidas e inválidas sin reordenar cada grupo', () => {
    const buena = llamada('c1', 'consultar_stock', { productoId: 'p-1' });
    const mala = llamada('c2', 'consultar_stock', {});
    const otraBuena = llamada('c3', 'crear_pedido', { productoId: 'p-2', cantidad: 1 });

    const resultado = validarLlamadasHerramienta([buena, mala, otraBuena], definiciones);

    expect(resultado.validas).toEqual([buena, otraBuena]);
    expect(resultado.invalidas.map((invalida) => invalida.llamada.id)).toEqual(['c2']);
    expect(resultado.invalidas[0]?.causa).toContain('productoId');
  });

  it('una herramienta que no está en las definiciones se devuelve como inválida', () => {
    const desconocida = llamada('c1', 'borrar_todo', { confirmar: true });

    const resultado = validarLlamadasHerramienta([desconocida], definiciones);

    expect(resultado.validas).toEqual([]);
    expect(resultado.invalidas[0]?.llamada).toBe(desconocida);
    expect(resultado.invalidas[0]?.causa).toContain('borrar_todo');
  });

  it('sin llamadas no hay nada que validar', () => {
    expect(validarLlamadasHerramienta([], definiciones)).toEqual({ validas: [], invalidas: [] });
  });
});
