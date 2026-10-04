import { describe, expect, it } from 'vitest';
import { idJobRespaldo, idJobTurno } from './cola-turno.js';

const ID_CONVERSACION = '0198f3a2-7b4c-7d11-9c3e-5a1b2c3d4e5f';

describe('cola-turno (ids de job)', () => {
  it('CNV1 — el id del job de respaldo cumple el formato que el outbox exige para un idRespuesta', () => {
    const idRespuesta = idJobRespaldo(idJobTurno(ID_CONVERSACION));

    // Es el formato que valida `canales` (`claves-idempotencia`) para un idRespuesta; se repite aquí
    // porque `conversaciones` no puede importar rutas internas de `canales`.
    expect(idRespuesta).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
  });

  it('CNV1 — dos jobs de respaldo de la misma conversación no comparten id', () => {
    const base = idJobTurno(ID_CONVERSACION);

    expect(idJobRespaldo(base)).not.toBe(idJobRespaldo(base));
  });
});
