# El cliente del back office

**Resumen.** El cliente es una app web (Angular) que vive en `cliente/` y habla con la API por el contrato. Hoy tiene
tres pantallas: iniciar sesión, **Estilo del bot** y **Mensajes fijos**, solo para el rol `admin`. En desarrollo se
levantan la API y el cliente, y el navegador ve un solo origen. Qué se decidió y por qué:
[ADR-0022](../adr/0022-cliente-angular-en-el-repo.md).

## Levantarlo en local

Hace falta Node 24.15 o más y Docker para la base y Redis.

| Paso | Comando |
|---|---|
| 1. Base de datos y Redis | `docker compose up -d postgres redis` |
| 2. Tablas | `npm run prisma:aplicar` |
| 3. Mensajes fijos del bot (una vez) | `npm run mensajes:sembrar` |
| 4. Tu usuario administrador (una vez) | `npm run usuario:crear -- --email tu@correo.co --nombre "Tu nombre" --rol admin` |
| 5. La API (puerto 3000) | `npm run start:dev` |
| 6. Dependencias del cliente (una vez) | `npm --prefix cliente ci` |
| 7. El cliente | `npm --prefix cliente start` y abre <http://localhost:4200> |

El cliente reenvía todo lo que empieza con `/api` a la API (`cliente/proxy.conf.json`). Si cambias `PORT` en `.env`,
cambia también el destino de ese archivo. Con `NODE_ENV=development` (el valor de `.env.example`) la cookie de sesión
funciona por `http://localhost`; fuera de desarrollo exige HTTPS.

## Qué puedes hacer

| Pantalla | Qué hace | Qué no hace |
|---|---|---|
| **Entrar** | Correo y contraseña. Tras varios fallos seguidos pide esperar y deshabilita el botón | No guarda el correo ni la contraseña en el navegador |
| **Estilo del bot** | Muestra la versión vigente y su origen, te deja editar el texto, publicarlo (con confirmación) y restaurar una versión anterior | No valida el texto: lo rechaza el servidor y te dice el motivo sin borrar lo que escribiste |
| **Mensajes fijos** | Lista los diez textos que el bot envía sin pasar por el LLM, con su descripción y si vienen de tu edición o del texto de respaldo; editas uno y lo guardas | No crea mensajes nuevos: la lista es cerrada |

Después de publicar o restaurar un estilo, la pantalla te recuerda correr las evals reales antes de que llegue a
clientes: [cómo se hace](estilo-del-bot.md). Un mensaje fijo editado rige en el siguiente mensaje del bot, sin reiniciar.

`aviso_datos` es el aviso de asistente automatizado que exige la política de privacidad (R14): se puede editar, pero no
lo dejes vacío ni le quites que habla con un asistente automatizado.

## Si algo no sale como esperabas

| Ves | Qué pasó | Qué hacer |
|---|---|---|
| Vuelve a la pantalla de entrar | La sesión venció (por inactividad o por duración máxima) | Inicia sesión otra vez |
| «No tienes permiso para hacer eso» | Tu usuario es `asesor` o cambió de rol | Pídele a un admin. La sesión sigue abierta |
| «Correo o contraseña incorrectos» | No distingue entre un correo que no existe y una contraseña errada, a propósito | Revisa los dos; tras 5 fallos esperas 15 minutos |
| Un motivo en rojo al publicar o guardar | El servidor rechazó el texto (por ejemplo, un valor en pesos) | Corrige el texto; lo escrito sigue ahí |
| Los diez mensajes dicen «Texto de respaldo» | Todavía no editaste ninguno, o no corriste la semilla | Es normal: el bot usa el respaldo. `npm run mensajes:sembrar` los deja listos para editar |
| El cliente no llega a la API | La API no está arriba o el puerto del proxy no coincide | Revisa el paso 5 y `cliente/proxy.conf.json` |

Un usuario `asesor` entra, pero no ve ninguna pantalla de administración y, si abre la dirección a mano, vuelve al
inicio. Aunque se la sepa, el servidor le responde `403`: el menú solo refleja lo que el servidor permite.

## Comandos del cliente

| Comando (desde la raíz) | Qué hace |
|---|---|
| `npm --prefix cliente start` | Servidor de desarrollo con el proxy a la API |
| `npm --prefix cliente test` | Tests del cliente (Vitest, sin navegador) |
| `npm --prefix cliente run lint` | Lint del cliente, con las reglas de fronteras entre áreas |
| `npm --prefix cliente run build` | Build de producción en `cliente/dist/` |
| `npm run cliente:generar` | Regenera el cliente HTTP desde `openapi/openapi.json`; **hazlo cada vez que cambie el contrato** |
| `npm run cliente:deriva` | Comprueba que el cliente generado coincide con el contrato |
| `npm run cliente:ci` | Todo lo anterior más la auditoría de dependencias; es el último paso de `npm run ci` |

Si cambias un endpoint de la API: `npm run contrato:generar` y luego `npm run cliente:generar`, y commitea los dos
resultados. Sin eso, `npm run ci` falla en la deriva.

## Cómo se agrega una pantalla nueva

El cliente crece por **áreas**: una carpeta por funcionalidad de negocio en `cliente/src/app/areas/<area>/`, con su
definición (`area.ts`), sus rutas y sus pantallas. Agregar un área es una carpeta nueva y **una línea** en
`areas/registro/registro.ts`; el menú y las rutas salen del registro y del rol. Un área no importa de otra: si dos
necesitan lo mismo, la pieza sube a `compartido/` (interfaz) o a `nucleo/` (transversal) y el lint lo hace cumplir. La
guía para quien escribe código está en la skill `luxeboreal-arquitectura`, sección «Cliente».

## Qué falta

- **Producción.** Cómo se sirve el cliente bajo el mismo dominio de la API se decide en la Fase 09b (P55). Hasta
  entonces el cliente solo corre en local.
- **Más pantallas.** El perfil del bot, los escenarios, el inventario y las ventas llegan en fases siguientes, como
  áreas nuevas.
