import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClockFalso } from '../../../../test/fakes/clock-falso.js';
import { textoDeRespaldo } from '../dominio/sistema.js';
import type { CasoDeIntencion, RepositorioCasos } from '../puertos/repositorio-casos.js';
import type { VersionAsistente } from '../puertos/version-asistente.js';
import { ProveedorTextos } from './proveedor-textos.js';

// CAS7 (Fase 12, T4): el texto de un caso del sistema, con copia por versión compartida y respaldo del código.

class RepositorioCasosFalso implements Pick<RepositorioCasos, 'leerTextosDelSistema' | 'leerCasosDeIntencion'> {
  lecturas = 0;
  falla = false;
  constructor(
    public textos: Record<string, string> = {},
    public intencion: CasoDeIntencion[] = [],
  ) {}
  leerTextosDelSistema(): Promise<ReadonlyMap<string, string>> {
    this.lecturas += 1;
    return this.falla ? Promise.reject(new Error('base caída')) : Promise.resolve(new Map(Object.entries(this.textos)));
  }
  leerCasosDeIntencion(): Promise<readonly CasoDeIntencion[]> {
    return this.falla ? Promise.reject(new Error('base caída')) : Promise.resolve(this.intencion);
  }
}

function caso(titulo: string, extra: Partial<CasoDeIntencion> = {}): CasoDeIntencion {
  return {
    titulo,
    tituloNormalizado: titulo
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, ''),
    cuandoAplica: `Cuando preguntan por ${titulo.toLowerCase()}.`,
    modo: 'literal',
    texto: `Texto de ${titulo}.`,
    ...extra,
  };
}

class VersionAsistenteFalsa implements VersionAsistente {
  valor = '0';
  falla = false;
  obtener(): Promise<string> {
    return this.falla ? Promise.reject(new Error('redis caído')) : Promise.resolve(this.valor);
  }
  incrementar(): Promise<void> {
    this.valor = String(Number(this.valor) + 1);
    return Promise.resolve();
  }
}

function espiarAvisos() {
  return vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
}

function crear(textos: Record<string, string> = {}, intencion: CasoDeIntencion[] = []) {
  const repositorio = new RepositorioCasosFalso(textos, intencion);
  const version = new VersionAsistenteFalsa();
  const clock = new ClockFalso(new Date('2026-10-06T12:00:00Z'));
  return { proveedor: new ProveedorTextos(repositorio, version, clock), repositorio, version, clock };
}

describe('asistente/aplicacion — ProveedorTextos (CAS7)', () => {
  let avisos: ReturnType<typeof espiarAvisos>;

  beforeEach(() => {
    avisos = espiarAvisos();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el texto del caso guardado es el que se entrega', async () => {
    const { proveedor } = crear({ mensaje_espera_handoff: 'TEXTO-PROPIO-DEL-NEGOCIO' });

    expect(await proveedor.textoDelSistema('mensaje_espera_handoff')).toBe('TEXTO-PROPIO-DEL-NEGOCIO');
  });

  it('CAS7 — Un caso sin fila usa el respaldo', async () => {
    const { proveedor } = crear({});

    expect(await proveedor.textoDelSistema('mensaje_espera_handoff')).toBe(textoDeRespaldo('mensaje_espera_handoff'));
  });

  it('CAS7 — Un texto en blanco cae al respaldo', async () => {
    const { proveedor } = crear({ mensaje_techo_gasto: '  \n ' });

    expect(await proveedor.textoDelSistema('mensaje_techo_gasto')).toBe(textoDeRespaldo('mensaje_techo_gasto'));
  });

  it('CAS7 — Una base caída usa el respaldo y no rompe el turno', async () => {
    const { proveedor, repositorio } = crear({ mensaje_espera_handoff: 'TEXTO-CONFIDENCIAL' });
    repositorio.falla = true;

    await expect(proveedor.textoDelSistema('mensaje_espera_handoff')).resolves.toBe(textoDeRespaldo('mensaje_espera_handoff'));

    expect(avisos).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(avisos.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
  });

  it('CAS7 — Sin Redis se lee la base y no se guarda una copia en memoria', async () => {
    const { proveedor, repositorio, version } = crear({ mensaje_espera_handoff: 'T1' });
    version.falla = true;

    expect(await proveedor.textoDelSistema('mensaje_espera_handoff')).toBe('T1');
    await proveedor.textoDelSistema('mensaje_espera_handoff');

    expect(repositorio.lecturas).toBe(2);
  });

  it('CAS7 — Una lectura repetida no consulta la base mientras la versión no cambia', async () => {
    const { proveedor, repositorio } = crear({ mensaje_espera_handoff: 'T1' });

    await proveedor.textoDelSistema('mensaje_espera_handoff');
    await proveedor.textoDelSistema('mensaje_techo_gasto');
    await proveedor.textoDelSistema('mensaje_espera_handoff');

    expect(repositorio.lecturas).toBe(1);
  });

  it('CAS7 — Editar un caso y subir la versión hace que el siguiente mensaje use el texto nuevo', async () => {
    const { proveedor, repositorio, version } = crear({ mensaje_pedir_texto_audio: 'Antes' });
    expect(await proveedor.textoDelSistema('mensaje_pedir_texto_audio')).toBe('Antes');

    repositorio.textos = { mensaje_pedir_texto_audio: 'Después' };
    await version.incrementar();

    expect(await proveedor.textoDelSistema('mensaje_pedir_texto_audio')).toBe('Después');
    expect(repositorio.lecturas).toBe(2);
  });

  it('la copia expira a los 5 minutos aunque la versión no haya cambiado', async () => {
    const { proveedor, repositorio, clock } = crear({ mensaje_espera_handoff: 'T1' });
    await proveedor.textoDelSistema('mensaje_espera_handoff');

    clock.avanzar(5 * 60_000 - 1);
    await proveedor.textoDelSistema('mensaje_espera_handoff');
    expect(repositorio.lecturas).toBe(1);

    clock.avanzar(2);
    await proveedor.textoDelSistema('mensaje_espera_handoff');
    expect(repositorio.lecturas).toBe(2);
  });

  it('una lectura fallida no queda en la copia: la siguiente vuelve a intentar la base', async () => {
    const { proveedor, repositorio } = crear({ mensaje_espera_handoff: 'T1' });
    repositorio.falla = true;
    await proveedor.textoDelSistema('mensaje_espera_handoff');

    repositorio.falla = false;

    expect(await proveedor.textoDelSistema('mensaje_espera_handoff')).toBe('T1');
  });
  it('CAS8 — El índice lista los casos de intención con su título y su «cuándo aplica»', async () => {
    const { proveedor } = crear({}, [caso('Garantía'), caso('Devoluciones')]);

    expect(await proveedor.indice()).toEqual([
      { titulo: 'Garantía', cuandoAplica: 'Cuando preguntan por garantía.' },
      { titulo: 'Devoluciones', cuandoAplica: 'Cuando preguntan por devoluciones.' },
    ]);
  });

  it('CAS8 — Los casos del sistema no entran al índice', async () => {
    const { proveedor } = crear({ mensaje_error_llm: 'Ya te respondemos.', mensaje_espera_handoff: 'Seguimos aquí.' }, [caso('Garantía')]);

    const titulos = (await proveedor.indice()).map((entrada) => entrada.titulo);

    expect(titulos).toEqual(['Garantía']);
  });

  it('CAS8 — consultar_caso devuelve el texto y el modo, sin distinguir mayúsculas ni acentos', async () => {
    const { proveedor } = crear({}, [caso('Garantía', { texto: 'Cubre defectos de fábrica por ocho días.', modo: 'guia' })]);

    expect(await proveedor.consultar('GARANTIA')).toEqual({
      encontrado: true,
      titulo: 'Garantía',
      modo: 'guia',
      texto: 'Cubre defectos de fábrica por ocho días.',
    });
  });

  it('CAS8 — Un caso inexistente lista los disponibles', async () => {
    const { proveedor } = crear({}, [caso('Garantía'), caso('Devoluciones')]);

    expect(await proveedor.consultar('Medios de pago')).toEqual({
      encontrado: false,
      titulosDisponibles: ['Garantía', 'Devoluciones'],
    });
  });

  it('CAS8 — Un índice de 70 casos se recorta a 60 y avisa solo con conteos', async () => {
    const setenta = Array.from({ length: 70 }, (_, i) => caso(`Caso ${String(i + 1).padStart(3, '0')}`, { texto: 'TEXTO-CONFIDENCIAL' }));
    const { proveedor } = crear({}, setenta);

    const indice = await proveedor.indice();

    expect(indice).toHaveLength(60);
    expect(avisos).toHaveBeenCalledWith({ evento: 'asistente.indice-recortado', total: 70, incluidos: 60 });
    expect(JSON.stringify(avisos.mock.calls)).not.toContain('TEXTO-CONFIDENCIAL');
  });

  it('CAS8 — Un caso editado cambia el siguiente turno cuando sube la versión', async () => {
    const { proveedor, repositorio, version } = crear({}, [caso('Garantía', { texto: 'Antes.' })]);
    expect(await proveedor.consultar('Garantía')).toMatchObject({ texto: 'Antes.' });

    repositorio.intencion = [caso('Garantía', { texto: 'Después.' })];
    await version.incrementar();

    expect(await proveedor.consultar('Garantía')).toMatchObject({ texto: 'Después.' });
  });

  it('CAS8 — El índice y la consulta comparten una sola lectura mientras la versión no cambia', async () => {
    const { proveedor, repositorio } = crear({}, [caso('Garantía')]);

    await proveedor.indice();
    await proveedor.consultar('Garantía');
    await proveedor.textoDelSistema('mensaje_espera_handoff');

    expect(repositorio.lecturas).toBe(1);
  });

  it('CAS8 — Una base caída deja el índice vacío y la consulta sin resultados, y el turno sigue', async () => {
    const { proveedor, repositorio } = crear({}, [caso('Garantía')]);
    repositorio.falla = true;

    expect(await proveedor.indice()).toEqual([]);
    expect(await proveedor.consultar('Garantía')).toEqual({ encontrado: false, titulosDisponibles: [] });
  });
});
