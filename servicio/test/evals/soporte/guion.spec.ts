import { ErrorPasarelaLlm } from '../../../src/modulos/llm/index.js';
import { FakePuertoLlm } from '../../fakes/puerto-llm-falso.js';
import { encolarGuion } from './guion.js';

describe('test/evals — guion → pasos del LLM falso (D2)', () => {
  it('traduce texto, llamadas, llamadas inválidas y errores de pasarela', async () => {
    const llm = new FakePuertoLlm();

    encolarGuion(llm, 't1', [
      { llamadas: [{ nombre: 'buscar_producto', argumentos: { query: 'anillo' } }] },
      { llamadasInvalidas: [{ nombre: 'cotizar_envio', argumentos: {}, causa: 'departamento: requerido' }] },
      { texto: 'Listo' },
      { error: 'proveedor-caido' },
    ]);

    const solicitud = { perfil: 'conversacion', mensajes: [] } as const;
    const primero = await llm.generar(solicitud);
    expect(primero.llamadasHerramienta).toEqual([{ id: 't1-1', nombre: 'buscar_producto', argumentos: { query: 'anillo' } }]);
    const segundo = await llm.generar(solicitud);
    expect(segundo.llamadasInvalidas?.[0]).toMatchObject({ causa: 'departamento: requerido' });
    expect((await llm.generar(solicitud)).texto).toBe('Listo');
    await expect(llm.generar(solicitud)).rejects.toBeInstanceOf(ErrorPasarelaLlm);
  });

  it('un guion agotado es un error del caso, no un handoff', async () => {
    const llm = new FakePuertoLlm();
    encolarGuion(llm, 't1', [{ texto: 'uno' }]);
    await llm.generar({ perfil: 'conversacion', mensajes: [] });

    await expect(llm.generar({ perfil: 'conversacion', mensajes: [] })).rejects.toThrow(/no hay pasos programados/);
  });
});
