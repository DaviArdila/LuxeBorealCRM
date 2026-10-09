import { Logger } from '@nestjs/common';
import { MarcaAsesorAvisadoEnMemoria } from '../../../../test/fakes/marca-asesor-avisado-en-memoria.js';
import { LectorAsesorAvisado } from './lector-asesor-avisado.js';

describe('modulos/conversaciones/aplicacion — LectorAsesorAvisado (CNV15)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CNV15 — El puerto responde que el asesor ya fue avisado', async () => {
    const marca = new MarcaAsesorAvisadoEnMemoria();
    await marca.adquirir('conv-1', 'lead-caliente');

    await expect(new LectorAsesorAvisado(marca).estaAvisado('conv-1')).resolves.toBe(true);
  });

  it('CNV15 — Sin marca el puerto responde que no', async () => {
    await expect(new LectorAsesorAvisado(new MarcaAsesorAvisadoEnMemoria()).estaAvisado('conv-1')).resolves.toBe(false);
  });

  it('CNV15 — Un fallo de la consulta no rompe el turno', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const marca = new MarcaAsesorAvisadoEnMemoria();
    marca.fallar = true;

    await expect(new LectorAsesorAvisado(marca).estaAvisado('conv-1')).resolves.toBe(false);

    expect(aviso).toHaveBeenCalledWith({ evento: 'conversaciones.asesor-avisado-lectura-fallo', error: 'Error' });
  });
});
