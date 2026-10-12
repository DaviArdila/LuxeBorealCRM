import { VARIABLES_UBICACION_GIT } from '../../scripts/herramientas.js';

/**
 * Quita del `process.env` de este proceso las variables con las que git ubica un repositorio
 * (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`…) y devuelve la función que las restaura. Git las
 * exporta a sus hooks: si `npm run ci:hook` corre desde `pre-push` con ellas puestas, cada
 * `git init`/`commit`/`config` de un repositorio de prueba escribe en el repositorio real.
 */
export function quitarUbicacionGitDelProceso(): () => void {
  const previas = new Map<string, string>();
  for (const nombre of VARIABLES_UBICACION_GIT) {
    const valor = process.env[nombre];
    if (valor !== undefined) {
      previas.set(nombre, valor);
      delete process.env[nombre];
    }
  }
  return () => {
    for (const [nombre, valor] of previas) {
      process.env[nombre] = valor;
    }
  };
}

/**
 * Registra `beforeAll`/`afterAll` para que los tests de un archivo que crean repositorios git de
 * prueba nunca hereden la ubicación del repositorio real (ver `quitarUbicacionGitDelProceso`).
 */
export function aislarDeGitDelHook(): void {
  let restaurar: () => void = () => {};
  beforeAll(() => {
    restaurar = quitarUbicacionGitDelProceso();
  });
  afterAll(() => {
    restaurar();
  });
}
