# Usuarios — Specification

## Purpose

Cubre quién entra al back office y cómo: los usuarios (admin y asesor) se crean por comando, inician sesión con correo
y contraseña, y reciben una cookie `httpOnly` cuya sesión vive en Redis con vencimiento por inactividad y duración
máxima (ADR-0021). Toda ruta de `/api/v1` exige sesión salvo las marcadas como públicas; las mutaciones exigen un
encabezado anti-CSRF; el rol y el estado se leen de la base en cada petición; los intentos fallidos se limitan por
correo e IP; y nada de esto deja datos personales en los logs (R14).

## Requirements

### Requirement: USR1 — Inicio de sesión con correo y contraseña

`POST /api/v1/auth/sesion` MUST recibir un correo y una contraseña y MUST abrir una sesión solo si existe un usuario
con ese correo (comparado sin distinguir mayúsculas), está `activo` y la contraseña coincide con su `password_hash`
(argon2id). Al abrir la sesión MUST actualizar `ultimo_acceso` con el instante del `Clock` inyectado y MUST responder
`200` con el usuario (id, nombre, correo y rol), nunca con el hash. Un correo inexistente, una contraseña incorrecta y
un usuario inactivo MUST responder exactamente igual: `401` en problem+json con el código `credenciales-invalidas`.
Cuando el correo no existe, el sistema MUST verificar la contraseña contra un hash ficticio para que el tiempo de
respuesta no revele si el correo existe.

Fase que lo implementa: 11a

#### Scenario: Credenciales válidas abren la sesión

- Dado un usuario activo `admin@ejemplo.co` con rol `admin`,
- Cuando inicia sesión con su contraseña correcta,
- Entonces la respuesta es `200` con su id, nombre, correo y rol, sin el hash, y trae la cookie `luxe_sesion`.

#### Scenario: El correo se compara sin distinguir mayúsculas

- Dado un usuario activo `admin@ejemplo.co`,
- Cuando inicia sesión como `Admin@Ejemplo.CO` con su contraseña correcta,
- Entonces la sesión se abre.

#### Scenario: Una contraseña incorrecta se rechaza sin decir por qué

- Dado un usuario activo,
- Cuando inicia sesión con una contraseña incorrecta,
- Entonces la respuesta es `401` con el código `credenciales-invalidas` y no trae cookie.

#### Scenario: Un correo inexistente responde igual que una contraseña incorrecta

- Dado que no existe ningún usuario `nadie@ejemplo.co`,
- Cuando alguien inicia sesión con ese correo,
- Entonces la respuesta tiene el mismo estado, código, título y detalle que la de una contraseña incorrecta, y la
  contraseña se verificó contra el hash ficticio.

#### Scenario: Un usuario inactivo no inicia sesión

- Dado un usuario con `activo = false` y su contraseña correcta,
- Cuando inicia sesión,
- Entonces la respuesta es `401` con el código `credenciales-invalidas`.

#### Scenario: El último acceso se registra con el reloj inyectado

- Dado un `ClockFalso` fijado en `2026-10-03T15:00:00Z`,
- Cuando un usuario inicia sesión con éxito,
- Entonces su `ultimo_acceso` queda en `2026-10-03T15:00:00Z`.

### Requirement: USR2 — La cookie de sesión no es legible desde el navegador

Al abrir una sesión el sistema MUST enviar la cookie `luxe_sesion` con los atributos `HttpOnly`, `SameSite=Strict` y
`Path=/`, y MUST agregar `Secure` cuando `NODE_ENV` no es `development`. La cookie MUST NOT llevar `Expires` ni
`Max-Age`: su vigencia la decide el servidor (USR3). Su valor MUST ser solo el identificador de la sesión, sin datos
del usuario.

Fase que lo implementa: 11a

#### Scenario: La cookie lleva los atributos de seguridad

- Dado `NODE_ENV=production`,
- Cuando un usuario inicia sesión con éxito,
- Entonces el encabezado `Set-Cookie` de `luxe_sesion` lleva `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/`.

#### Scenario: En desarrollo la cookie no exige HTTPS

- Dado `NODE_ENV=development`,
- Cuando un usuario inicia sesión con éxito,
- Entonces la cookie lleva `HttpOnly` y `SameSite=Strict` y no lleva `Secure`.

#### Scenario: La cookie solo contiene el identificador de la sesión

- Dado un inicio de sesión con éxito,
- Cuando se inspecciona el valor de `luxe_sesion`,
- Entonces es una cadena de 43 caracteres base64url y no contiene el correo, el id ni el rol del usuario.

### Requirement: USR3 — La sesión vive en Redis con vencimiento deslizante y duración máxima

Cada sesión MUST guardarse en Redis bajo la clave `sesion:<id>`, donde `<id>` son 256 bits aleatorios de un generador
criptográfico, con el id del usuario, el instante de creación y el de la última actividad (del `Clock`), y MUST NOT
guardar el correo ni la contraseña (R14). La clave MUST vencer tras `SESION_INACTIVIDAD_MIN` minutos sin actividad;
cada petición autenticada MUST renovar ese plazo. Una sesión MUST dejar de valer cuando pasan
`SESION_DURACION_MAX_H` horas desde su creación, aunque haya tenido actividad. Ambos valores MUST validarse con Zod
al arrancar.

Fase que lo implementa: 11a

#### Scenario: La actividad renueva el vencimiento

- Dado `SESION_INACTIVIDAD_MIN=720` y una sesión con su última petición hace 700 minutos,
- Cuando el usuario hace una petición autenticada,
- Entonces la petición se atiende y la sesión vuelve a tener 720 minutos de vida.

#### Scenario: Una sesión inactiva vence

- Dado una sesión sin peticiones durante más de `SESION_INACTIVIDAD_MIN` minutos,
- Cuando el usuario hace una petición con esa cookie,
- Entonces la respuesta es `401` con el código `peticion-no-autenticada`.

#### Scenario: Una sesión vence al llegar a su duración máxima

- Dado `SESION_DURACION_MAX_H=168` y una sesión creada hace 169 horas y activa hace un minuto,
- Cuando el usuario hace una petición con esa cookie,
- Entonces la respuesta es `401` y la clave de la sesión se borra.

#### Scenario: La sesión no guarda datos personales

- Dado una sesión abierta,
- Cuando se lee la clave `sesion:<id>` en Redis,
- Entonces contiene el id del usuario y los dos instantes, y no contiene el correo ni la contraseña.

### Requirement: USR4 — Cerrar sesión la invalida al instante

`DELETE /api/v1/auth/sesion` MUST borrar de inmediato la clave de la sesión en Redis y MUST responder `204` con una
cookie `luxe_sesion` vacía y vencida. Si la petición no trae una sesión válida, MUST responder igual `204` (la
operación es idempotente). Después de cerrar la sesión, la misma cookie MUST NOT autenticar ninguna petición.

Fase que lo implementa: 11a

#### Scenario: Cerrar sesión borra la clave y vacía la cookie

- Dado una sesión abierta,
- Cuando el usuario llama a `DELETE /api/v1/auth/sesion`,
- Entonces la respuesta es `204`, la clave `sesion:<id>` ya no existe y `Set-Cookie` vence `luxe_sesion`.

#### Scenario: La cookie de una sesión cerrada ya no sirve

- Dado una sesión cerrada con `DELETE /api/v1/auth/sesion`,
- Cuando alguien repite una petición con esa misma cookie,
- Entonces la respuesta es `401`.

#### Scenario: Cerrar sesión sin sesión también responde 204

- Dado una petición sin cookie de sesión,
- Cuando llama a `DELETE /api/v1/auth/sesion` con el encabezado anti-CSRF,
- Entonces la respuesta es `204`.

### Requirement: USR5 — Consultar la sesión actual

`GET /api/v1/auth/yo` MUST responder `200` con el id, el nombre, el correo y el rol del usuario de la sesión, leídos
de la base en ese momento. Sin una sesión válida MUST responder `401` con el código `peticion-no-autenticada`.

Fase que lo implementa: 11a

#### Scenario: La sesión válida devuelve el usuario

- Dado un asesor con una sesión abierta,
- Cuando llama a `GET /api/v1/auth/yo`,
- Entonces la respuesta es `200` con su id, nombre, correo y rol `asesor`.

#### Scenario: Sin sesión la consulta se rechaza

- Dado una petición sin cookie,
- Cuando llama a `GET /api/v1/auth/yo`,
- Entonces la respuesta es `401` con el código `peticion-no-autenticada`.

### Requirement: USR6 — Toda ruta exige sesión salvo las marcadas como públicas

Una guardia global MUST exigir una sesión válida en toda ruta, salvo las marcadas con `@Publico()`:
`POST /api/v1/auth/sesion`, `DELETE /api/v1/auth/sesion`, `GET /health`, el webhook de Chatwoot (que conserva su
propia firma, R3) y la documentación en `/docs` (que conserva su propia protección, API9). En cada petición la
guardia MUST comprobar en la base que el usuario sigue existiendo y está `activo`, y MUST usar el rol guardado en la
base, no uno copiado en la sesión. Una ruta marcada con `@Roles('admin')` MUST rechazar a un usuario de otro rol con
`403` y el código `rol-insuficiente` (API7).

Fase que lo implementa: 11a

#### Scenario: Una ruta protegida sin sesión se rechaza

- Dado una ruta sin `@Publico()`,
- Cuando llega una petición sin cookie,
- Entonces la respuesta es `401` con el código `peticion-no-autenticada` y la operación no se ejecuta.

#### Scenario: Un asesor no entra a una ruta de admin

- Dado un asesor con sesión y una ruta marcada `@Roles('admin')`,
- Cuando la llama,
- Entonces la respuesta es `403` con el código `rol-insuficiente`.

#### Scenario: Un usuario desactivado pierde el acceso en su siguiente petición

- Dado un usuario con sesión abierta que luego se marca `activo = false`,
- Cuando hace su siguiente petición,
- Entonces la respuesta es `401` y la clave de su sesión se borra.

#### Scenario: Un cambio de rol aplica sin volver a iniciar sesión

- Dado un admin con sesión abierta cuyo rol pasa a `asesor` en la base,
- Cuando llama a una ruta `@Roles('admin')`,
- Entonces la respuesta es `403`.

#### Scenario: El webhook de Chatwoot sigue respondiendo sin cookie

- Dado un evento de Chatwoot con firma válida y sin cookie,
- Cuando llega al webhook,
- Entonces se atiende como antes de esta fase.

#### Scenario: `GET /health` sigue respondiendo sin cookie

- Dado Postgres y Redis arriba,
- Cuando un orquestador llama a `GET /health` sin cookie,
- Entonces la respuesta es la de siempre (PLT4).

### Requirement: USR7 — Las mutaciones exigen un encabezado anti-CSRF

Toda petición con método `POST`, `PUT`, `PATCH` o `DELETE` a una ruta bajo `/api/v1` MUST traer el encabezado
`X-Luxe-Csrf: 1`; sin él MUST responder `403` con el código `encabezado-csrf-ausente` antes de ejecutar la operación.
El inicio de sesión MUST exigirlo también. El webhook de Chatwoot MUST quedar exento: no usa la cookie y lo protege
su firma (R3). `GET`, `HEAD` y `OPTIONS` MUST NOT exigirlo.

Fase que lo implementa: 11a

#### Scenario: Una mutación sin el encabezado se rechaza

- Dado un admin con sesión,
- Cuando hace `DELETE /api/v1/auth/sesion` sin `X-Luxe-Csrf`,
- Entonces la respuesta es `403` con el código `encabezado-csrf-ausente` y la sesión sigue abierta.

#### Scenario: El inicio de sesión exige el encabezado

- Dado credenciales válidas,
- Cuando se envían a `POST /api/v1/auth/sesion` sin `X-Luxe-Csrf`,
- Entonces la respuesta es `403` y no se abre ninguna sesión.

#### Scenario: Una lectura no exige el encabezado

- Dado un usuario con sesión,
- Cuando llama a `GET /api/v1/auth/yo` sin `X-Luxe-Csrf`,
- Entonces la respuesta es `200`.

### Requirement: USR8 — Límite de intentos de inicio de sesión por correo e IP

El sistema MUST contar en Redis los inicios de sesión fallidos por la pareja (correo normalizado, IP de origen), con la
clave construida a partir de un hash SHA-256 del correo, nunca del correo en claro (R14). Al llegar a
`AUTH_INTENTOS_MAX` fallos dentro de `AUTH_VENTANA_MIN` minutos, todo intento de esa pareja MUST responder `429` con
el código `demasiados-intentos` y el encabezado `Retry-After`, **sin verificar la contraseña**, hasta que la ventana
venza. Un inicio de sesión con éxito MUST reiniciar el contador de esa pareja. El límite MUST NOT afectar a la misma
cuenta desde otra IP.

Fase que lo implementa: 11a

#### Scenario: El sexto intento fallido se bloquea

- Dado `AUTH_INTENTOS_MAX=5` y cinco intentos fallidos del mismo correo e IP en 10 minutos,
- Cuando llega un sexto intento, aunque traiga la contraseña correcta,
- Entonces la respuesta es `429` con el código `demasiados-intentos` y `Retry-After`, y la sesión no se abre.

#### Scenario: Pasada la ventana se puede volver a intentar

- Dado una pareja bloqueada y `AUTH_VENTANA_MIN=15`,
- Cuando pasan 15 minutos y llega un intento con la contraseña correcta,
- Entonces la sesión se abre.

#### Scenario: Un éxito reinicia el contador

- Dado cuatro intentos fallidos y luego un inicio de sesión con éxito,
- Cuando llegan después cuatro intentos fallidos más,
- Entonces ninguno se bloquea.

#### Scenario: El contador no guarda el correo en claro

- Dado un intento fallido de `admin@ejemplo.co`,
- Cuando se listan las claves de Redis del contador,
- Entonces ninguna contiene `admin@ejemplo.co`.

### Requirement: USR9 — La autenticación no deja datos sensibles en los logs

Los logs de la autenticación MUST identificar al usuario solo por su id. MUST NOT contener el correo, la contraseña, el
hash, el valor de la cookie `luxe_sesion` ni el id de la sesión (R14). Los encabezados `cookie` y `set-cookie` MUST
quedar en la lista de redacción del logger.

Fase que lo implementa: 11a

#### Scenario: Un inicio de sesión fallido no escribe el correo en los logs

- Dado un intento fallido con `admin@ejemplo.co` y la contraseña `clave-incorrecta-123`,
- Cuando se revisan los logs del proceso,
- Entonces no aparece el correo ni la contraseña.

#### Scenario: Los logs de una petición no contienen la cookie

- Dado una petición autenticada con su cookie,
- Cuando el logger registra la petición,
- Entonces el valor de `luxe_sesion` aparece redactado.

### Requirement: USR10 — Comando para crear usuarios

El sistema MUST ofrecer `npm run usuario:crear -- --email <correo> --nombre <nombre> --rol admin|asesor`. El comando
MUST pedir la contraseña en la consola dos veces, sin mostrarla, y MUST rechazarla si las dos no coinciden o si tiene
menos de 12 caracteres. MUST guardar solo el hash argon2id, con el correo normalizado a minúsculas, y MUST rechazar un
correo que ya existe sin modificar al usuario existente. Sin una terminal interactiva MUST terminar con error, sin
leer la contraseña de un argumento ni de una variable de entorno. El comando MUST NOT imprimir la contraseña ni el hash.

Fase que lo implementa: 11a

#### Scenario: Crear el primer administrador

- Dado una base sin usuarios,
- Cuando se corre el comando con `--email Admin@Ejemplo.co --nombre Dueño --rol admin` y la misma contraseña de 16
  caracteres dos veces,
- Entonces existe un usuario `admin@ejemplo.co` activo con rol `admin` cuyo `password_hash` empieza por `$argon2id$`.

#### Scenario: Una contraseña corta o que no coincide se rechaza

- Dado una contraseña de 8 caracteres, y en otra corrida dos contraseñas distintas,
- Cuando se corre el comando,
- Entonces termina con error, dice el motivo y no crea ningún usuario.

#### Scenario: Un correo repetido no pisa al usuario existente

- Dado un usuario `admin@ejemplo.co`,
- Cuando se corre el comando con ese correo,
- Entonces termina con error y el usuario existente conserva su hash, nombre y rol.

#### Scenario: Sin terminal interactiva el comando no corre

- Dado una ejecución sin TTY,
- Cuando se corre el comando,
- Entonces termina con error sin pedir ni leer la contraseña.
