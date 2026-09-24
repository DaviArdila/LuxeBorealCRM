import type { OpenAPIObject } from '@nestjs/swagger';

export const ETIQUETA_INTERNA = 'internal';

const METODOS_HTTP = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function nombreEsquemaReferenciado(referencia: string): string | undefined {
  const prefijo = '#/components/schemas/';
  if (!referencia.startsWith(prefijo)) {
    return undefined;
  }

  const segmento = referencia.slice(prefijo.length).split('/')[0];
  if (!segmento) {
    return undefined;
  }

  try {
    return decodeURIComponent(segmento).replace(/~1/g, '/').replace(/~0/g, '~');
  } catch {
    return undefined;
  }
}

function recolectarReferenciasAEsquemas(valor: unknown, referencias: Set<string>): void {
  if (Array.isArray(valor)) {
    for (const elemento of valor) {
      recolectarReferenciasAEsquemas(elemento, referencias);
    }
    return;
  }
  if (!esObjeto(valor)) {
    return;
  }

  if (typeof valor.$ref === 'string') {
    const nombre = nombreEsquemaReferenciado(valor.$ref);
    if (nombre) {
      referencias.add(nombre);
    }
  }

  for (const propiedad of Object.values(valor)) {
    recolectarReferenciasAEsquemas(propiedad, referencias);
  }
}

function podarEsquemasNoReferenciados(documento: OpenAPIObject): void {
  const componentes = documento.components;
  const esquemas = componentes?.schemas;
  if (!componentes || !esquemas) {
    return;
  }

  const componentesSinEsquemas = { ...componentes };
  delete componentesSinEsquemas.schemas;

  const referenciasPendientes = new Set<string>();
  recolectarReferenciasAEsquemas(
    { ...documento, components: componentesSinEsquemas },
    referenciasPendientes,
  );

  const referenciados = new Set<string>();
  while (referenciasPendientes.size > 0) {
    const nombre = referenciasPendientes.values().next().value;
    if (nombre === undefined) {
      break;
    }
    referenciasPendientes.delete(nombre);

    if (referenciados.has(nombre) || !Object.hasOwn(esquemas, nombre)) {
      continue;
    }

    referenciados.add(nombre);
    recolectarReferenciasAEsquemas(esquemas[nombre], referenciasPendientes);
  }

  documento.components = {
    ...componentes,
    schemas: Object.fromEntries(
      Object.entries(esquemas).filter(([nombre]) => referenciados.has(nombre)),
    ),
  };
}

/**
 * Deriva el contrato público sin mutar el interno: excluye operaciones `internal`, paths vacíos y
 * esquemas que dejan de tener referencias, incluyendo el cierre transitivo de `$ref`.
 */
export function filtrarDocumentoPublico(documento: OpenAPIObject): OpenAPIObject {
  const documentoPublico = structuredClone(documento);
  const rutas = documentoPublico.paths;

  if (rutas) {
    for (const [ruta, elemento] of Object.entries(rutas)) {
      if (!esObjeto(elemento)) {
        delete rutas[ruta];
        continue;
      }

      for (const metodo of METODOS_HTTP) {
        const operacion = elemento[metodo];
        if (
          esObjeto(operacion) &&
          Array.isArray(operacion.tags) &&
          operacion.tags.some((etiqueta: unknown) => etiqueta === ETIQUETA_INTERNA)
        ) {
          delete elemento[metodo];
        }
      }

      const conservaOperacion = [...METODOS_HTTP].some((metodo) => esObjeto(elemento[metodo]));
      if (!conservaOperacion) {
        delete rutas[ruta];
      }
    }
  }

  if (documentoPublico.tags) {
    documentoPublico.tags = documentoPublico.tags.filter(
      (etiqueta) => etiqueta.name !== ETIQUETA_INTERNA,
    );
  }

  podarEsquemasNoReferenciados(documentoPublico);
  return documentoPublico;
}
