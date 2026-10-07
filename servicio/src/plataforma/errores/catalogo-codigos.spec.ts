import { describe, expect, it } from 'vitest';
import { CATALOGO_CODIGOS } from './catalogo-codigos.js';

// Códigos de la Fase 11a (design.md «Endpoints», ADR-0011): el status de cada uno es parte del contrato.

describe('plataforma/errores — códigos de autenticación (Fase 11a)', () => {
  it.each([
    ['credenciales-invalidas', 401],
    ['peticion-no-autenticada', 401],
    ['rol-insuficiente', 403],
    ['encabezado-csrf-ausente', 403],
    ['demasiados-intentos', 429],
  ] as const)('%s responde %i', (codigo, status) => {
    const entrada = (CATALOGO_CODIGOS as Readonly<Record<string, { status: number; title: string }>>)[codigo];

    expect(entrada?.status).toBe(status);
    expect(entrada?.title.length).toBeGreaterThan(0);
  });

  it('credenciales-invalidas no dice si el correo existe ni cuál dato falló (USR1)', () => {
    const titulo = (CATALOGO_CODIGOS as Readonly<Record<string, { title: string }>>)['credenciales-invalidas']?.title;

    expect(titulo).toBeDefined();
    expect(titulo).not.toMatch(/correo|email|contraseña|usuario|existe|inactiv/i);
  });
});

describe('plataforma/errores — códigos del estilo del bot (Fase 11b, AGT23)', () => {
  it.each([
    ['estilo-invalido', 422],
    ['version-estilo-inexistente', 404],
  ] as const)('%s responde %i', (codigo, status) => {
    const entrada = (CATALOGO_CODIGOS as Readonly<Record<string, { status: number; title: string }>>)[codigo];

    expect(entrada?.status).toBe(status);
    expect(entrada?.title.length).toBeGreaterThan(0);
  });
});

describe('plataforma/errores — códigos de los mensajes fijos (Fase 11b, CFN2)', () => {
  it.each([
    ['seccion-inexistente', 404],
    ['seccion-duplicada', 409],
    ['seccion-modificada', 409],
    ['orden-secciones-invalido', 422],
    ['categoria-duplicada', 409],
    ['categoria-con-casos', 409],
    ['categoria-inexistente', 404],
    ['categoria-invalida', 422],
    ['orden-categorias-invalido', 422],
    ['caso-duplicado', 409],
    ['caso-inexistente', 404],
    ['caso-del-sistema', 409],
    ['caso-modificado', 409],
    ['caso-invalido', 422],
    ['cursor-invalido', 400],
    ['configuracion-invalida', 422],
    ['excepcion-duplicada', 409],
    ['excepcion-inexistente', 404],
  ] as const)('%s responde %i', (codigo, status) => {
    const entrada = (CATALOGO_CODIGOS as Readonly<Record<string, { status: number; title: string }>>)[codigo];

    expect(entrada?.status).toBe(status);
    expect(entrada?.title.length).toBeGreaterThan(0);
  });
});
