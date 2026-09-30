import { describe, expect, it } from 'vitest';
import type { NuevaEntradaOutbox, RegistroOutbox } from '../../../plataforma/outbox/index.js';
import { EncolarAviso } from './encolar-aviso.js';

class RegistroOutboxEnMemoria implements RegistroOutbox {
  readonly entradas: NuevaEntradaOutbox[] = [];
  agregar(entradas: readonly NuevaEntradaOutbox[]): Promise<void> {
    this.entradas.push(...entradas);
    return Promise.resolve();
  }
}

describe('EncolarAviso', () => {
  it('NTF1 — encola una fila notificacion.telegram con el texto efímero y la clave dada', async () => {
    const registro = new RegistroOutboxEnMemoria();

    await new EncolarAviso(registro).ejecutar({
      claveIdempotencia: 'aviso:l1',
      grupo: 'lead:l1',
      aviso: {
        tipo: 'lead',
        temperatura: 'caliente',
        senales: ['pide_pagar'],
        resumen: 'Quiere pagar.',
        capturadoFueraHorario: false,
      },
    });

    expect(registro.entradas).toHaveLength(1);
    const [entrada] = registro.entradas;
    expect(entrada).toMatchObject({
      tipo: 'notificacion.telegram',
      claveIdempotencia: 'aviso:l1',
      grupo: 'lead:l1',
      orden: 0,
    });
    // El texto no debe quedar persistido más allá de la entrega (R14): va en `efimero`, no en `datos`.
    expect(entrada?.efimero?.texto).toContain('Quiere pagar.');
    expect(JSON.stringify(entrada?.datos)).not.toContain('Quiere pagar.');
  });
});
