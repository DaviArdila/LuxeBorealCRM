# Usuarios y sesiones del back office

**Resumen.** Los usuarios del back office se crean por comando, con la contraseña tecleada en la consola. Al
iniciar sesión, la API deja una cookie `httpOnly` que el navegador manda sola; la sesión vive en Redis y vence por
inactividad o por duración máxima. Cerrar sesión o desactivar a alguien corta el acceso en la siguiente petición.
Decisión de fondo: [ADR-0021](../adr/0021-sesion-cookie-redis.md).

## Crear el primer administrador

```bash
npm run usuario:crear -- --email tu@correo.co --nombre "Tu nombre" --rol admin
```

El comando pide la contraseña dos veces y no la muestra mientras escribes.

| Regla | Qué pasa si no se cumple |
|---|---|
| Al menos 12 caracteres (máximo 200), sin reglas de composición | Termina con error y no crea nada |
| Las dos contraseñas iguales | Termina con error y no crea nada |
| El correo no existe todavía | Termina con error; el usuario existente no cambia |
| Se corre en una terminal interactiva | Termina con error sin pedir nada (no sirve en un pipe ni en CI) |

La contraseña nunca va en un argumento ni en una variable de entorno: quedaría en el historial del shell. El correo se
guarda en minúsculas y solo se guarda el hash argon2id.

Para crear un asesor, el mismo comando con `--rol asesor`.

## Iniciar sesión desde Scalar o `curl`

```bash
# Inicia sesión y guarda la cookie en cookies.txt
curl -i -c cookies.txt -H 'Content-Type: application/json' -H 'X-Luxe-Csrf: 1' \
  -d '{"email":"tu@correo.co","contrasena":"<tu contraseña>"}' \
  http://localhost:3000/api/v1/auth/sesion

# ¿Quién soy?
curl -b cookies.txt http://localhost:3000/api/v1/auth/yo

# Cerrar sesión
curl -i -b cookies.txt -X DELETE -H 'X-Luxe-Csrf: 1' http://localhost:3000/api/v1/auth/sesion
```

Toda petición que cambia algo (`POST`, `PUT`, `PATCH`, `DELETE`) bajo `/api/v1` lleva `X-Luxe-Csrf: 1`; sin él la
API responde `403`. Fuera de `NODE_ENV=development` la cookie lleva `Secure`, así que el navegador solo la manda por
HTTPS (con `curl` y `cookies.txt` funciona igual).

## Cuánto dura una sesión

| Variable | Defecto | Qué controla |
|---|---|---|
| `SESION_INACTIVIDAD_MIN` | 720 (12 h) | Minutos sin peticiones tras los que la sesión vence. Cada petición los renueva |
| `SESION_DURACION_MAX_H` | 168 (7 días) | Horas desde el inicio de sesión tras las que vence aunque haya actividad |

Se cambian en `.env` y aplican al reiniciar. La duración máxima tiene que cubrir al menos la inactividad, o la
aplicación no arranca.

## Si alguien queda bloqueado por intentos fallidos

Tras `AUTH_INTENTOS_MAX` fallos (5) del mismo correo y la misma IP en `AUTH_VENTANA_MIN` minutos (15), la API responde
`429` con `Retry-After` hasta que pasa la ventana, aunque la contraseña sea correcta. El bloqueo **vence solo**; otra IP
no está bloqueada.

Si no se puede esperar, se borra el contador en Redis. La clave usa la huella SHA-256 del correo, nunca el correo:

```bash
HUELLA=$(printf '%s' 'persona@correo.co' | sha256sum | cut -d' ' -f1)
redis-cli --scan --pattern "auth:intentos:$HUELLA:*" | xargs -r redis-cli del
```

Si la persona olvidó la contraseña, hoy no hay comando para cambiarla (P52): se borra la fila de `usuario` y se vuelve
a crear con `npm run usuario:crear`.

## Quitarle el acceso a alguien

Se marca `activo = false` en su fila de `usuario`. En su siguiente petición la API responde `401` y borra su sesión.
Un cambio de rol también aplica en la siguiente petición: el rol se lee de la base cada vez, no de la sesión.

## Qué pasa si Redis se reinicia

Las sesiones viven solo en Redis: si se pierde su contenido, **todos tienen que volver a iniciar sesión**. También se
reinician los contadores de intentos. No se pierde ningún dato del negocio.

## Qué queda en los logs

Solo el id del usuario. Ni el correo, ni la contraseña, ni el hash, ni el valor de la cookie: los encabezados `cookie` y
`set-cookie` salen como `[REDACTADO]` (R14).

## Pendiente

- Detrás del proxy inverso de producción (Fase 09b) hay que configurar `trust proxy`, para que el límite de intentos vea
  la IP real del cliente y no la del proxy.
