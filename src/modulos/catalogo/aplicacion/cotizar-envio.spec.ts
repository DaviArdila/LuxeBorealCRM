import { formatearDias, formatearRangoCop } from '../../../compartido/dinero/index.js';
import type { CandidataExclusion, CandidataTarifa, DestinoEnvio } from '../dominio/envio.js';
import type { Producto } from '../dominio/producto.js';
import type { NuevoEventoFueraCobertura, RepositorioEnvio } from '../puertos/repositorio-envio.js';
import { POLITICA_CONTRAENTREGA_POR_DEFECTO } from '../dominio/politica.js';
import type { RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';
import type { RepositorioPolitica } from '../puertos/repositorio-politica.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';
import { ConsultarPolitica } from './consultar-politica.js';
import { CotizarEnvio } from './cotizar-envio.js';

const PRODUCTO: Producto = {
  id: 'p1',
  sku: 'SKU-1',
  nombre: 'Producto',
  descripcionCorta: 'c',
  descripcionLarga: 'l',
  precioCop: 10000,
  activo: true,
  pesoGramos: 500,
  largoMm: null,
  anchoMm: null,
  altoMm: null,
  tieneFotos: false,
};

const DESTINO: DestinoEnvio = { departamento: 'Amazonas', ciudad: 'Leticia' };

class RepositorioProductoFalso implements RepositorioProducto {
  constructor(private readonly producto: Producto | null) {}
  listarActivosResumen(): Promise<readonly never[]> {
    throw new Error('no usado por CotizarEnvio');
  }
  buscarPorIdOSku(): Promise<Producto | null> {
    return Promise.resolve(this.producto);
  }
  listarFotos(): Promise<never> {
    throw new Error('no usado por este caso de uso');
  }
}

class RepositorioParametroFalso implements RepositorioParametroCatalogo {
  mensajeSolicitado = false;
  constructor(
    private readonly factorVolumetrico: number,
    private readonly mensajeFueraCobertura: string,
  ) {}
  obtenerFactorVolumetrico(): Promise<number> {
    return Promise.resolve(this.factorVolumetrico);
  }
  obtenerMensajeFueraCobertura(): Promise<string> {
    this.mensajeSolicitado = true;
    return Promise.resolve(this.mensajeFueraCobertura);
  }
}

class RepositorioPoliticaFalso implements RepositorioPolitica {
  constructor(private readonly politicas: Readonly<Record<string, string>> = {}) {}
  obtener(tema: string): Promise<string | null> {
    return Promise.resolve(this.politicas[tema] ?? null);
  }
  listarTemas(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.politicas));
  }
}

function politicas(configuradas: Readonly<Record<string, string>> = {}): ConsultarPolitica {
  return new ConsultarPolitica(new RepositorioPoliticaFalso(configuradas));
}

class RepositorioEnvioFalso implements RepositorioEnvio {
  eventoRegistrado: NuevoEventoFueraCobertura | undefined;
  constructor(
    private readonly exclusiones: readonly CandidataExclusion[],
    private readonly tarifas: readonly CandidataTarifa[],
  ) {}
  listarExclusiones(): Promise<readonly CandidataExclusion[]> {
    return Promise.resolve(this.exclusiones);
  }
  listarTarifas(): Promise<readonly CandidataTarifa[]> {
    return Promise.resolve(this.tarifas);
  }
  registrarEventoFueraCobertura(evento: NuevoEventoFueraCobertura): Promise<void> {
    this.eventoRegistrado = evento;
    return Promise.resolve();
  }
}

describe('modulos/catalogo/aplicacion/CotizarEnvio', () => {
  it('CAT9 — Sin cobertura por ausencia de tarifa se registra el evento con el producto y el destino', async () => {
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000, 'sin cobertura'),
      new RepositorioEnvioFalso([], []), // sin exclusiones, sin ninguna tarifa que aplique
      politicas(),
    );

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado.cobertura).toBe(false);
    expect(resultado).not.toHaveProperty('rangoTexto');
  });

  it('CAT9 — el evento registrado lleva el producto_id y el destino, con departamentoId/ciudadId en null (D7)', async () => {
    const repositorioEnvio = new RepositorioEnvioFalso([], []);
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000, 'sin cobertura'),
      repositorioEnvio,
      politicas(),
    );

    await caso.ejecutar('SKU-1', DESTINO);

    expect(repositorioEnvio.eventoRegistrado).toEqual({
      productoId: 'p1',
      departamentoTexto: 'Amazonas',
      ciudadTexto: 'Leticia',
      departamentoId: null,
      ciudadId: null,
    });
  });

  it('CAT11 — Sin cobertura se devuelve el mensaje del parámetro del negocio, sin ningún rango', async () => {
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000, 'Mensaje configurado del negocio'),
      new RepositorioEnvioFalso([], []),
      politicas(),
    );

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado).toEqual({ cobertura: false, mensaje: 'Mensaje configurado del negocio' });
    expect(resultado).not.toHaveProperty('rangoTexto');
    expect(resultado).not.toHaveProperty('diasTexto');
    expect(resultado).not.toHaveProperty('contraentregaDisponible');
  });

  it('registra departamentoId/ciudadId en null también cuando la falta de cobertura es por exclusión, no por ausencia de tarifa (CAT7)', async () => {
    const exclusionDeTodoElDepartamento: CandidataExclusion = { departamentoNombre: 'Amazonas', ciudadNombre: null };
    const repositorioEnvio = new RepositorioEnvioFalso([exclusionDeTodoElDepartamento], []);
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000, 'sin cobertura por exclusión'),
      repositorioEnvio,
      politicas(),
    );

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado.cobertura).toBe(false);
    expect(repositorioEnvio.eventoRegistrado).toEqual({
      productoId: 'p1',
      departamentoTexto: 'Amazonas',
      ciudadTexto: 'Leticia',
      departamentoId: null,
      ciudadId: null,
    });
  });

  it('cotiza con cobertura cuando hay una tarifa que aplica, sin registrar ningún evento ni pedir el mensaje de fuera de cobertura', async () => {
    const tarifaQueAplica: CandidataTarifa = {
      id: 't1',
      departamentoNombre: 'Amazonas',
      ciudadNombre: 'Leticia',
      pesoMinG: 0,
      pesoMaxG: null,
      rangoMinCop: 30000,
      rangoMaxCop: 40000,
      diasMin: 2,
      diasMax: 4,
      contraentregaDisponible: true,
      creado: new Date('2026-01-01'),
    };
    const repositorioEnvio = new RepositorioEnvioFalso([], [tarifaQueAplica]);
    const repositorioParametro = new RepositorioParametroFalso(4000, 'no debería usarse');
    const caso = new CotizarEnvio(new RepositorioProductoFalso(PRODUCTO), repositorioParametro, repositorioEnvio, politicas());

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado.cobertura).toBe(true);
    expect(repositorioEnvio.eventoRegistrado).toBeUndefined();
    expect(repositorioParametro.mensajeSolicitado).toBe(false);
  });

  const TARIFA_CON_CONTRAENTREGA: CandidataTarifa = {
    id: 't1',
    departamentoNombre: 'Amazonas',
    ciudadNombre: 'Leticia',
    pesoMinG: 0,
    pesoMaxG: null,
    rangoMinCop: 30000,
    rangoMaxCop: 40000,
    diasMin: 2,
    diasMax: 4,
    contraentregaDisponible: true,
    creado: new Date('2026-01-01'),
  };

  function cotizador(tarifa: CandidataTarifa, configuradas: Readonly<Record<string, string>> = {}): CotizarEnvio {
    return new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000, 'sin cobertura'),
      new RepositorioEnvioFalso([], [tarifa]),
      politicas(configuradas),
    );
  }

  it('CAT10 — Cotización con cobertura devuelve el rango y los días ya formateados de la tarifa elegida', async () => {
    const resultado = await cotizador(TARIFA_CON_CONTRAENTREGA).ejecutar('SKU-1', DESTINO);

    expect(resultado).toEqual({
      cobertura: true,
      rangoTexto: formatearRangoCop(30000, 40000),
      diasTexto: formatearDias(2, 4),
      contraentregaDisponible: true,
      politicaContraentregaTexto: POLITICA_CONTRAENTREGA_POR_DEFECTO,
    });
  });

  it('CAT10 — Cotización con cobertura sin contra entrega no incluye la política', async () => {
    const resultado = await cotizador({ ...TARIFA_CON_CONTRAENTREGA, contraentregaDisponible: false }).ejecutar('SKU-1', DESTINO);

    expect(resultado.cobertura).toBe(true);
    expect(resultado).toMatchObject({ contraentregaDisponible: false });
    expect(resultado).not.toHaveProperty('politicaContraentregaTexto');
  });

  it('CAT10 — La política de contra entrega configurada por el negocio reemplaza al texto de respaldo', async () => {
    const resultado = await cotizador(TARIFA_CON_CONTRAENTREGA, { contra_entrega: 'Texto del negocio.' }).ejecutar('SKU-1', DESTINO);

    expect(resultado).toMatchObject({ politicaContraentregaTexto: 'Texto del negocio.' });
  });
});
