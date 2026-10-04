/** Roles del back office (API7); mismos valores que el enum `RolUsuario` del esquema. */
export const ROLES = ['admin', 'asesor'] as const;

export type Rol = (typeof ROLES)[number];

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

/** El correo se guarda y se compara en minúsculas (USR1, USR10): `email` ya es único en la tabla. */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Usuario del back office tal como lo guarda la tabla `usuario` (sin columnas de auditoría). */
export interface Usuario {
  readonly id: string;
  readonly email: string;
  readonly nombre: string;
  readonly passwordHash: string;
  readonly rol: Rol;
  readonly activo: boolean;
}

/** Lo que se necesita para crear un usuario: el correo ya normalizado y la contraseña ya hasheada. */
export interface UsuarioNuevo {
  readonly email: string;
  readonly nombre: string;
  readonly passwordHash: string;
  readonly rol: Rol;
}
