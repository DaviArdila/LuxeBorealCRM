import { z } from 'zod';
import { LONGITUD_MAXIMA_CONTRASENA } from '../dominio/contrasena.js';
import { ROLES } from '../dominio/usuario.js';

/** `POST /api/v1/auth/sesion` (USR1): la longitud mínima solo se exige al crear la contraseña (USR10), no al entrar. */
export const esquemaInicioSesion = z.object({
  email: z.email(),
  contrasena: z.string().min(1).max(LONGITUD_MAXIMA_CONTRASENA),
});

export type InicioSesion = z.infer<typeof esquemaInicioSesion>;

/** El usuario de la sesión (USR1, USR5): nunca el hash. */
export const esquemaPerfilUsuario = z.object({
  id: z.uuid(),
  nombre: z.string(),
  email: z.email(),
  rol: z.enum(ROLES),
});

export type PerfilUsuarioRespuesta = z.infer<typeof esquemaPerfilUsuario>;
