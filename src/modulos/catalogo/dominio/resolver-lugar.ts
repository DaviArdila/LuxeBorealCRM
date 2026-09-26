/**
 * Resolución pura de departamento/ciudad (texto libre de la hoja) a código DANE (D5, IMP9).
 * Portado con tipos locales propios, sin importar `modulos/geografia` (regla `dominio-aislado`):
 * `resolver-geografia-importacion.ts` (aplicación) mapea los tipos de `geografia` a estos antes de
 * llamar aquí. Compara nombres con `normalizarLugar` (mismo criterio que CAT8): ignora tildes,
 * mayúsculas y puntuación.
 */

import { normalizarLugar } from '../../../compartido/texto/index.js';

export interface LugarDepartamento {
  readonly id: string;
  readonly nombre: string;
}

export interface LugarCiudad {
  readonly id: string;
  readonly departamentoId: string;
  readonly nombre: string;
}

export interface CatalogoLugares {
  readonly departamentos: readonly LugarDepartamento[];
  readonly ciudades: readonly LugarCiudad[];
}

export interface LugarResuelto {
  readonly departamentoId: string;
  readonly ciudadId: string | null;
}

/**
 * Resuelve el texto de departamento (obligatorio) y ciudad (opcional) de una fila de `cobertura` o
 * `tarifas` a sus códigos DANE. Devuelve `null` cuando el departamento no matchea ningún nombre de
 * `catalogo`, o cuando la ciudad viene no vacía y no matchea ninguna ciudad del departamento resuelto
 * (Q1/IMP9: nunca se adivina, ambos casos son fila inválida). Solo una ciudad vacía deja `ciudadId`
 * en `null` (fila válida que excluye/cubre todo el departamento, IMP9 tercer escenario).
 */
export function resolverLugar(
  catalogo: CatalogoLugares,
  departamentoTexto: string,
  ciudadTexto: string | null,
): LugarResuelto | null {
  const departamentoNormalizado = normalizarLugar(departamentoTexto);
  const departamento = catalogo.departamentos.find(
    (candidato) => normalizarLugar(candidato.nombre) === departamentoNormalizado,
  );
  if (departamento === undefined) return null;

  if (ciudadTexto === null || ciudadTexto.trim() === '') {
    return { departamentoId: departamento.id, ciudadId: null };
  }

  const ciudadNormalizada = normalizarLugar(ciudadTexto);
  const ciudad = catalogo.ciudades.find(
    (candidata) =>
      candidata.departamentoId === departamento.id && normalizarLugar(candidata.nombre) === ciudadNormalizada,
  );
  if (ciudad === undefined) return null;

  return { departamentoId: departamento.id, ciudadId: ciudad.id };
}
