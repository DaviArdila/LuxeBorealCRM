import { formatearDias, formatearRangoCop } from '../../../compartido/dinero/index.js';
import type { CandidataExclusion, CandidataTarifa, DestinoEnvio } from '../dominio/envio.js';
import type { Producto } from '../dominio/producto.js';
import type { NuevoEventoFueraCobertura, RepositorioEnvio } from '../puertos/repositorio-envio.js';
import type { RepositorioParametroCatalogo } from '../puertos/repositorio-parametro.js';
import type { RepositorioProducto } from '../puertos/repositorio-producto.js';
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
  constructor(private readonly factorVolumetrico: number) {}
  obtenerFactorVolumetrico(): Promise<number> {
    return Promise.resolve(this.factorVolumetrico);
  }
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
      new RepositorioParametroFalso(4000),
      new RepositorioEnvioFalso([], []), // sin exclusiones, sin ninguna tarifa que aplique
    );

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado.cobertura).toBe(false);
    expect(resultado).not.toHaveProperty('rangoTexto');
  });

  it('CAT9 — el evento registrado lleva el producto_id y el destino, con departamentoId/ciudadId en null (D7)', async () => {
    const repositorioEnvio = new RepositorioEnvioFalso([], []);
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000),
      repositorioEnvio,
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

  it('CAT11 — Sin cobertura se devuelve solo cobertura falsa, sin ningún rango', async () => {
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000),
      new RepositorioEnvioFalso([], []),
    );

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado).toEqual({ cobertura: false });
    expect(resultado).not.toHaveProperty('mensaje');
    expect(resultado).not.toHaveProperty('rangoTexto');
    expect(resultado).not.toHaveProperty('diasTexto');
    expect(resultado).not.toHaveProperty('contraentregaDisponible');
  });

  it('registra departamentoId/ciudadId en null también cuando la falta de cobertura es por exclusión, no por ausencia de tarifa (CAT7)', async () => {
    const exclusionDeTodoElDepartamento: CandidataExclusion = { departamentoNombre: 'Amazonas', ciudadNombre: null };
    const repositorioEnvio = new RepositorioEnvioFalso([exclusionDeTodoElDepartamento], []);
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000),
      repositorioEnvio,
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

  it('cotiza con cobertura cuando hay una tarifa que aplica, sin registrar ningún evento', async () => {
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
    const caso = new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000),
      repositorioEnvio,
    );

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado.cobertura).toBe(true);
    expect(repositorioEnvio.eventoRegistrado).toBeUndefined();
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

  function cotizador(tarifa: CandidataTarifa): CotizarEnvio {
    return new CotizarEnvio(
      new RepositorioProductoFalso(PRODUCTO),
      new RepositorioParametroFalso(4000),
      new RepositorioEnvioFalso([], [tarifa]),
    );
  }

  it('CAT10 — Cotización con cobertura devuelve el rango y los días ya formateados de la tarifa elegida', async () => {
    const resultado = await cotizador(TARIFA_CON_CONTRAENTREGA).ejecutar('SKU-1', DESTINO);

    expect(resultado).toEqual({
      cobertura: true,
      rangoTexto: formatearRangoCop(30000, 40000),
      diasTexto: formatearDias(2, 4),
      contraentregaDisponible: true,
    });
  });

  it('CAT10 — La cotización con contra entrega no trae ningún texto de política', async () => {
    const resultado = await cotizador(TARIFA_CON_CONTRAENTREGA).ejecutar('SKU-1', DESTINO);

    expect(resultado).toMatchObject({ contraentregaDisponible: true });
    expect(Object.keys(resultado).sort()).toEqual(['cobertura', 'contraentregaDisponible', 'diasTexto', 'rangoTexto']);
    expect(resultado).not.toHaveProperty('politicaContraentregaTexto');
  });

  it('CAT10 — Cotización con cobertura sin contra entrega', async () => {
    const resultado = await cotizador({ ...TARIFA_CON_CONTRAENTREGA, contraentregaDisponible: false }).ejecutar('SKU-1', DESTINO);

    expect(resultado).toMatchObject({ cobertura: true, contraentregaDisponible: false });
    expect(Object.keys(resultado).sort()).toEqual(['cobertura', 'contraentregaDisponible', 'diasTexto', 'rangoTexto']);
  });

  it('CAT10 — Cotizar no consulta el puerto de textos del asistente', async () => {
    // El constructor ya no recibe ningún puerto de textos: con y sin contra entrega la cotización se calcula.
    expect(CotizarEnvio.length).toBe(3);
    const con = await cotizador(TARIFA_CON_CONTRAENTREGA).ejecutar('SKU-1', DESTINO);
    const sin = await cotizador({ ...TARIFA_CON_CONTRAENTREGA, contraentregaDisponible: false }).ejecutar('SKU-1', DESTINO);

    expect(con.cobertura).toBe(true);
    expect(sin.cobertura).toBe(true);
  });

  it('CAT11 — Un destino excluido de la cobertura tampoco trae mensaje y deja el evento registrado (CAT9)', async () => {
    const repositorioEnvio = new RepositorioEnvioFalso([{ departamentoNombre: 'Amazonas', ciudadNombre: null }], []);
    const caso = new CotizarEnvio(new RepositorioProductoFalso(PRODUCTO), new RepositorioParametroFalso(4000), repositorioEnvio);

    const resultado = await caso.ejecutar('SKU-1', DESTINO);

    expect(resultado).toEqual({ cobertura: false });
    expect(repositorioEnvio.eventoRegistrado).toBeDefined();
  });
});
