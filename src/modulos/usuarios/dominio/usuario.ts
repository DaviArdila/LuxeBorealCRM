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
