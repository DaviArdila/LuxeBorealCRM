import { describe, expect, it } from 'vitest';
import type { PerfilUsuario } from '../../usuarios/index.js';
import type { GuardarMensajeFijo, ResultadoGuardarMensajeFijo } from '../aplicacion/guardar-mensaje-fijo.js';
import type { ListarMensajesFijos } from '../aplicacion/listar-mensajes-fijos.js';
import type { MensajeFijo } from '../dominio/mensaje-fijo.js';
import { MensajesFijosController } from './mensajes-fijos.controller.js';

// CFN1 y CFN2 (T4): el controlador solo traduce resultados de los casos de uso a respuestas HTTP y errores de catálogo.

const admin: PerfilUsuario = { id: '0199a000-0000-7000-8000-000000000001', nombre: 'Dueño', email: 'a@b.co', rol: 'admin' };
const mensaje: MensajeFijo = {
  clave: 'mensaje_handoff',
  descripcion: 'Cuando pasa a un asesor.',
  texto: 'Ya te comunico.',
  origen: 'base',
  actualizado: '2026-10-04T15:00:00.000Z',
};

function crear(resultado: ResultadoGuardarMensajeFijo = { guardado: true, mensaje }) {
  const guardadas: [string, string][] = [];
  const listar = { ejecutar: () => Promise.resolve([mensaje]) } as Pick<ListarMensajesFijos, 'ejecutar'>;
  const guardar = {
    ejecutar: (clave: string, texto: string) => {
      guardadas.push([clave, texto]);
      return Promise.resolve(resultado);
    },
  } as Pick<GuardarMensajeFijo, 'ejecutar'>;
  return { controlador: new MensajesFijosController(listar as ListarMensajesFijos, guardar as GuardarMensajeFijo), guardadas };
}

describe('MensajesFijosController (CFN1, CFN2)', () => {
  it('CFN1 — Lista los mensajes dentro de { mensajes }', async () => {
    const { controlador } = crear();

    await expect(controlador.listarMensajesFijos()).resolves.toEqual({ mensajes: [mensaje] });
  });

  it('CFN2 — Guardar entrega el mensaje guardado', async () => {
    const { controlador, guardadas } = crear();

    await expect(controlador.guardarMensajeFijo('mensaje_handoff', { texto: 'Ya te comunico.' }, admin)).resolves.toEqual(mensaje);
    expect(guardadas).toEqual([['mensaje_handoff', 'Ya te comunico.']]);
  });

  it('CFN2 — Un texto inválido responde mensaje-fijo-invalido con el motivo en el detalle', async () => {
    const { controlador } = crear({ guardado: false, razon: 'invalido', motivo: 'el mensaje contiene un valor en pesos (R1, R2)' });

    await expect(controlador.guardarMensajeFijo('mensaje_handoff', { texto: 'Cuesta $ 5' }, admin)).rejects.toMatchObject({
      codigo: 'mensaje-fijo-invalido',
      detalle: 'el mensaje contiene un valor en pesos (R1, R2)',
    });
  });

  it('CFN2 — Una clave desconocida responde mensaje-fijo-desconocido', async () => {
    const { controlador } = crear({ guardado: false, razon: 'desconocida' });

    await expect(controlador.guardarMensajeFijo('llm_techo_mensual_usd', { texto: 'Algo' }, admin)).rejects.toMatchObject({
      codigo: 'mensaje-fijo-desconocido',
    });
  });
});
