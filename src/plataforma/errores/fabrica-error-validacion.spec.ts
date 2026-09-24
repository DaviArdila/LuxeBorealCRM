import { describe, expect, it } from 'vitest';
import { fabricaErrorValidacion, type IssuePathMinimo } from './fabrica-error-validacion.js';

function issue(path: IssuePathMinimo['path']): IssuePathMinimo {
  return { path };
}

describe('fabricaErrorValidacion (D5, checkpoint b)', () => {
  it('produce un ErrorDeAplicacion con código validacion-fallida', () => {
    const error = fabricaErrorValidacion([issue(['precioCop'])]);

    expect(error.codigo).toBe('validacion-fallida');
  });

  it('clasifica todos los campos como problema: formato (sin distinguir falta de formato)', () => {
    const error = fabricaErrorValidacion([issue(['precioCop']), issue(['nombre'])]);

    expect(error.errores).toEqual([
      { campo: 'precioCop', problema: 'formato' },
      { campo: 'nombre', problema: 'formato' },
    ]);
  });

  it('nombra el campo raíz con "(raíz)" cuando el issue no trae path', () => {
    const error = fabricaErrorValidacion([issue([])]);

    expect(error.errores).toEqual([{ campo: '(raíz)', problema: 'formato' }]);
  });

  it('junta un path anidado (segmentos {key}) con puntos, sin exponer el valor recibido', () => {
    const error = fabricaErrorValidacion([issue([{ key: 'contacto' }, 'telefono'])]);

    expect(error.errores).toEqual([{ campo: 'contacto.telefono', problema: 'formato' }]);
  });

  it('nunca copia campos ajenos al issue (p. ej. un input con el valor recibido) al detalle', () => {
    const issueConValor: IssuePathMinimo & { readonly input: string } = {
      path: ['precioCop'],
      input: 'no-es-un-numero',
    };

    const error = fabricaErrorValidacion([issueConValor]);

    expect(error.errores).toEqual([{ campo: 'precioCop', problema: 'formato' }]);
    expect(JSON.stringify(error.errores)).not.toContain('no-es-un-numero');
  });
});
