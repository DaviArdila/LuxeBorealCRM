import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';
import { describe, expect, it } from 'vitest';
import { textoDeBusqueda } from '../../../src/modulos/asistente/dominio/normalizar.js';
import { CASOS_INICIALES_DE_INTENCION } from '../../../src/modulos/asistente/dominio/semilla.js';
import { urlPostgresDePrueba } from '../../soporte/infraestructura.js';

/**
 * Fase 12d, T7 (CAS14, pasos 2 y 3): la migración de datos `20261009140000_casos_del_sistema_minimos` convierte o borra
 * `aviso_datos` y borra los dos traspasos. Se ejecuta su SQL real contra Postgres, dentro de una transacción que se deshace.
 * Lo que no puede pasar nunca: perder el texto que el dueño editó en `aviso_datos`.
 */
const MIGRACION = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'prisma',
  'migrations',
  '20261009140000_casos_del_sistema_minimos',
  'migration.sql',
);

const MIGRACION_DE_CASOS_A_INTENCION = path.resolve(MIGRACION, '..', '..', '20261009130000_casos_a_intencion', 'migration.sql');

const TRATAMIENTO = CASOS_INICIALES_DE_INTENCION[0];
const TEXTO_DEL_DUENO = 'TEXTO-DEL-DUEÑO: soy un asistente automatizado, ¿aceptas el tratamiento de tus datos?';

async function conTransaccion(accion: (cliente: Client) => Promise<void>): Promise<void> {
  const cliente = new Client({ connectionString: urlPostgresDePrueba() });
  await cliente.connect();
  try {
    await cliente.query('BEGIN');
    try {
      await cliente.query('DELETE FROM caso_asistente');
      await cliente.query('DELETE FROM categoria_caso');
      await accion(cliente);
    } finally {
      await cliente.query('ROLLBACK');
    }
  } finally {
    await cliente.end();
  }
}

async function crearCategoria(cliente: Client, nombre: string, normalizado: string, orden: number): Promise<string> {
  const id = randomUUID();
  await cliente.query(`INSERT INTO categoria_caso (id, nombre, nombre_normalizado, orden) VALUES ($1::uuid, $2, $3, $4)`, [id, nombre, normalizado, orden]);
  return id;
}

interface CasoNuevo {
  readonly clave: string | null;
  readonly titulo: string;
  readonly texto: string;
  readonly disparador: 'evento' | 'intencion';
  readonly modo?: 'literal' | 'guia';
  readonly categoriaId: string;
}

async function crearCaso(cliente: Client, caso: CasoNuevo): Promise<void> {
  const cuando = `Cuándo aplica ${caso.titulo}.`;
  await cliente.query(
    `INSERT INTO caso_asistente
       (id, categoria_id, titulo, titulo_normalizado, cuando_aplica, disparador, clave_sistema, modo, texto, activo, busqueda_normalizada, creado, actualizado)
     VALUES ($1::uuid, $2::uuid, $3, lower($3), $4, $5::disparador_caso, $6, $7::modo_caso, $8, true, lower($3 || ' ' || $8), '2026-10-01T09:00:00Z', '2026-10-02T09:00:00Z')`,
    [randomUUID(), caso.categoriaId, caso.titulo, cuando, caso.disparador, caso.clave, caso.modo ?? 'literal', caso.texto],
  );
}

async function crearAvisoDeDatos(cliente: Client, categoriaId: string, texto = TEXTO_DEL_DUENO): Promise<void> {
  await crearCaso(cliente, { clave: 'aviso_datos', titulo: 'Aviso de datos', texto, disparador: 'evento', categoriaId });
}

interface Fila {
  readonly titulo: string;
  readonly titulo_normalizado: string;
  readonly texto: string;
  readonly cuando_aplica: string;
  readonly disparador: string;
  readonly modo: string;
  readonly clave_sistema: string | null;
  readonly categoria: string;
  readonly creado: Date;
  readonly actualizado: Date;
  readonly busqueda_normalizada: string;
}

async function leerCasos(cliente: Client): Promise<readonly Fila[]> {
  const resultado = await cliente.query<Fila>(
    `SELECT c.titulo, c.titulo_normalizado, c.texto, c.cuando_aplica, c.disparador::text AS disparador, c.modo::text AS modo,
            c.clave_sistema, k.nombre AS categoria, c.creado, c.actualizado, c.busqueda_normalizada
       FROM caso_asistente c JOIN categoria_caso k ON k.id = c.categoria_id ORDER BY c.titulo`,
  );
  return resultado.rows;
}

function migrar(cliente: Client): Promise<unknown> {
  return cliente.query(readFileSync(MIGRACION, 'utf8'));
}

describe('Migración casos_del_sistema_minimos (Fase 12d, T7, CAS14 pasos 2 y 3, integración)', () => {
  it('CAS14 — «Aviso de datos» pasa a «Tratamiento de datos» con su texto', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      await crearAvisoDeDatos(cliente, sistema);

      await migrar(cliente);

      const casos = await leerCasos(cliente);
      expect(casos).toHaveLength(1);
      expect(casos[0]).toMatchObject({
        titulo: 'Tratamiento de datos',
        titulo_normalizado: 'tratamiento de datos',
        texto: TEXTO_DEL_DUENO,
        cuando_aplica: TRATAMIENTO?.cuandoAplica,
        modo: TRATAMIENTO?.modo,
        disparador: 'intencion',
        clave_sistema: null,
        categoria: TRATAMIENTO?.categoria,
      });
      expect(casos[0]?.creado).toEqual(new Date('2026-10-01T09:00:00Z'));
      const buscado = await cliente.query(`SELECT 1 FROM caso_asistente WHERE busqueda_normalizada LIKE '%tratamiento%'`);
      expect(buscado.rowCount).toBe(1);
    });
  });

  it('CAS14 — La conversión deja la búsqueda igual a la que calcula el código', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearAvisoDeDatos(cliente, sistema);

      await migrar(cliente);

      const [fila] = await leerCasos(cliente);
      expect(fila?.busqueda_normalizada).toBe(textoDeBusqueda({ titulo: 'Tratamiento de datos', cuandoAplica: TRATAMIENTO?.cuandoAplica ?? '', texto: TEXTO_DEL_DUENO }));
    });
  });

  it('CAS14 — Sin la categoría «Políticas» el caso convertido conserva la suya', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearAvisoDeDatos(cliente, sistema);

      await expect(migrar(cliente)).resolves.toBeDefined();

      expect((await leerCasos(cliente)).map((c) => c.categoria)).toEqual(['Sistema']);
    });
  });

  it('CAS14 — La conversión respeta la restricción de disparador y clave', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearAvisoDeDatos(cliente, sistema);

      await expect(migrar(cliente)).resolves.toBeDefined();

      const [fila] = await leerCasos(cliente);
      expect(fila).toMatchObject({ disparador: 'intencion', clave_sistema: null });
    });
  });

  it('CAS14 — Un título ocupado no rompe la migración', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      const politicas = await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      await crearAvisoDeDatos(cliente, sistema);
      await crearCaso(cliente, { clave: null, titulo: 'Tratamiento de datos', texto: 'TEXTO-DEL-CASO-EXISTENTE', disparador: 'intencion', modo: 'guia', categoriaId: politicas });
      const existente = (await leerCasos(cliente)).filter((c) => c.titulo === 'Tratamiento de datos');

      await expect(migrar(cliente)).resolves.toBeDefined();

      const despues = await leerCasos(cliente);
      expect(despues).toHaveLength(1);
      expect(despues).toEqual(existente);
      expect(despues.some((c) => c.clave_sistema === 'aviso_datos')).toBe(false);
    });
  });

  it('CAS14 — Los casos de traspaso se borran', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCaso(cliente, { clave: 'mensaje_handoff', titulo: 'Traspaso a un asesor', texto: 'Te paso con un asesor.', disparador: 'evento', categoriaId: sistema });
      await crearCaso(cliente, { clave: 'mensaje_handoff_fuera_horario', titulo: 'Traspaso fuera de horario', texto: 'Te escribimos mañana.', disparador: 'evento', categoriaId: sistema });

      await migrar(cliente);

      const quedan = await cliente.query(`SELECT 1 FROM caso_asistente WHERE clave_sistema IN ('mensaje_handoff', 'mensaje_handoff_fuera_horario')`);
      expect(quedan.rowCount).toBe(0);
      expect(await leerCasos(cliente)).toHaveLength(0);
    });
  });

  it('CAS14 — Los demás casos del sistema y los casos del dueño no se tocan', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      const politicas = await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      for (const [clave, titulo] of [
        ['mensaje_pedir_texto_audio', 'Audio recibido'],
        ['mensaje_imagen_no_procesada', 'Imagen sin texto'],
        ['mensaje_error_llm', 'Falla técnica del modelo'],
        ['mensaje_techo_gasto', 'Techo de gasto alcanzado'],
        ['mensaje_espera_handoff', 'Espera del traspaso'],
      ] as const) {
        await crearCaso(cliente, { clave, titulo, texto: `TEXTO-DEL-DUEÑO ${clave}`, disparador: 'evento', categoriaId: sistema });
      }
      await crearCaso(cliente, { clave: null, titulo: 'Garantía', texto: 'Cubre ocho días.', disparador: 'intencion', categoriaId: politicas });
      await crearCaso(cliente, { clave: 'mensaje_handoff', titulo: 'Traspaso a un asesor', texto: 'Te paso con un asesor.', disparador: 'evento', categoriaId: sistema });
      await crearAvisoDeDatos(cliente, sistema);
      const intactos = (await leerCasos(cliente)).filter((c) => !['Traspaso a un asesor', 'Aviso de datos'].includes(c.titulo));

      await migrar(cliente);

      const despues = (await leerCasos(cliente)).filter((c) => c.titulo !== 'Tratamiento de datos');
      expect(despues).toEqual(intactos);
      expect(despues.find((c) => c.clave_sistema === 'mensaje_espera_handoff')?.titulo).toBe('Espera del traspaso');
    });
  });

  it('CAS8 — Los casos convertidos aparecen en el índice', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      await crearCaso(cliente, { clave: 'contra_entrega', titulo: 'Contra entrega', texto: 'Pagas al recibir.', disparador: 'intencion', categoriaId: sistema });
      await crearCaso(cliente, { clave: 'mensaje_fuera_cobertura', titulo: 'Sin cobertura de envío', texto: 'No llegamos allá.', disparador: 'evento', categoriaId: sistema });
      await crearCaso(cliente, { clave: 'mensaje_captura_completa', titulo: 'Datos completos fuera de horario', texto: 'Listo, ya tengo tus datos.', disparador: 'evento', categoriaId: sistema });
      await crearCaso(cliente, { clave: 'mensaje_error_llm', titulo: 'Falla técnica del modelo', texto: 'Ya te respondemos.', disparador: 'evento', categoriaId: sistema });
      await crearAvisoDeDatos(cliente, sistema);

      await cliente.query(readFileSync(MIGRACION_DE_CASOS_A_INTENCION, 'utf8'));
      await migrar(cliente);

      // Mismo filtro que `RepositorioCasosPrisma.leerCasosDeIntencion`: intención y activo.
      const indice = await cliente.query<{ titulo: string; cuando_aplica: string }>(
        `SELECT titulo, cuando_aplica FROM caso_asistente WHERE disparador = 'intencion' AND activo ORDER BY titulo`,
      );
      expect(indice.rows.map((f) => f.titulo)).toEqual(['Contra entrega', 'Datos completos fuera de horario', 'Sin cobertura de envío', 'Tratamiento de datos']);
      for (const fila of indice.rows) expect(fila.cuando_aplica.trim()).not.toBe('');
    });
  });

  it('CAS14 — Correr la migración dos veces no cambia nada', async () => {
    await conTransaccion(async (cliente) => {
      const sistema = await crearCategoria(cliente, 'Sistema', 'sistema', 0);
      await crearCategoria(cliente, 'Políticas', 'politicas', 1);
      await crearAvisoDeDatos(cliente, sistema);
      await crearCaso(cliente, { clave: 'mensaje_handoff', titulo: 'Traspaso a un asesor', texto: 'Te paso con un asesor.', disparador: 'evento', categoriaId: sistema });
      await crearCaso(cliente, { clave: 'mensaje_handoff_fuera_horario', titulo: 'Traspaso fuera de horario', texto: 'Mañana.', disparador: 'evento', categoriaId: sistema });
      await migrar(cliente);
      const primera = await leerCasos(cliente);

      await migrar(cliente);

      expect(await leerCasos(cliente)).toEqual(primera);
    });
  });
});
