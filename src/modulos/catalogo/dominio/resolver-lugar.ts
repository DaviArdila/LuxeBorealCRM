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
 * `catalogo` (Q1: nunca se adivina). Una ciudad vacía o sin match dentro del departamento resuelto
 * deja `ciudadId` en `null` (fila válida que excluye/cubre todo el departamento).
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

  return { departamentoId: departamento.id, ciudadId: ciudad?.id ?? null };
}
