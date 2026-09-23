import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';

// Test trivial (T2, design.md "Archivos/áreas" y D7): solo confirma que Vitest + unplugin-swc +
// decoradores de Nest funcionan juntos (inyección de dependencias por tipo de clase). No cubre
// ningún escenario de las specs delta — esa cobertura empieza en T3.

@Injectable()
class ServicioDeHumo {
  saludar(): string {
    return 'ok';
  }
}

@Injectable()
class ControladorDeHumo {
  constructor(private readonly servicio: ServicioDeHumo) {}

  ejecutar(): string {
    return this.servicio.saludar();
  }
}

describe('arranque de Vitest + unplugin-swc + decoradores de Nest', () => {
  it('resuelve inyección de dependencias por tipo de clase sin @Inject explícito', async () => {
    const moduloDePrueba = await Test.createTestingModule({
      providers: [ServicioDeHumo, ControladorDeHumo],
    }).compile();

    const controlador = moduloDePrueba.get(ControladorDeHumo);

    expect(controlador.ejecutar()).toBe('ok');
  });
});
