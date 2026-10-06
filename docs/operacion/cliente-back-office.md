# El cliente del back office

**Resumen.** El cliente es una app web (Angular 22 con Angular Material) que vive en `cliente/` y habla con la API por el contrato. Hoy tiene
tres pantallas: iniciar sesión, **Estilo del bot** y **Mensajes fijos**, solo para el rol `admin`. En desarrollo se
levantan la API (`servicio/`) y el cliente, y el navegador ve un solo origen. Qué se decidió y por qué:
[ADR-0022](../adr/0022-cliente-angular-en-el-repo.md) y [ADR-0023](../adr/0023-estructura-servicio-y-cliente.md).

## Levantarlo en local

Hace falta Node 24.15 o más y Docker para la base y Redis. Los comandos se corren desde la raíz del repositorio.

| Paso | Comando |
|---|---|
| 1. Dependencias de las dos aplicaciones (una vez) | `npm run instalar` |
| 2. Base de datos y Redis | `docker compose -f servicio/docker-compose.yml up -d postgres redis` |
| 3. Tablas | `npm --prefix servicio run prisma:aplicar` |
| 4. Mensajes fijos del bot (una vez) | `npm --prefix servicio run mensajes:sembrar` |
| 5. Tu usuario administrador (una vez) | `npm --prefix servicio run usuario:crear -- --email tu@correo.co --nombre "Tu nombre" --rol admin` |
| 6. La API (puerto 3000) | `npm --prefix servicio run start:dev` |
| 7. El cliente | `npm --prefix cliente start` y abre <http://localhost:4200> |

El cliente reenvía todo lo que empieza con `/api` a la API (`cliente/proxy.conf.json`). Si cambias `PORT` en
`servicio/.env`,
cambia también el destino de ese archivo. Con `NODE_ENV=development` (el valor de `.env.example`) la cookie de sesión
funciona por `http://localhost`; fuera de desarrollo exige HTTPS.

## Qué puedes hacer

| Pantalla | Qué hace | Qué no hace |
|---|---|---|
| **Entrar** | Correo y contraseña. Tras varios fallos seguidos pide esperar y deshabilita el botón | No guarda el correo ni la contraseña en el navegador |
| **Estilo del bot** | Muestra la versión vigente y su origen en modo lectura; «Editar» abre una ventana para cambiar el texto y publicarlo (con confirmación); el historial permite restaurar una versión anterior | No valida el texto: lo rechaza el servidor y te dice el motivo dentro de la ventana, sin borrar lo que escribiste |
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
| Los diez mensajes dicen «Texto de respaldo» | Todavía no editaste ninguno, o no corriste la semilla | Es normal: el bot usa el respaldo. `npm --prefix servicio run mensajes:sembrar` los deja listos para editar |
| El cliente no llega a la API | La API no está arriba o el puerto del proxy no coincide | Revisa el paso 6 y `cliente/proxy.conf.json` |

Un usuario `asesor` entra, pero no ve ninguna pantalla de administración y, si abre la dirección a mano, vuelve al
inicio. Aunque se la sepa, el servidor le responde `403`: el menú solo refleja lo que el servidor permite.

## Comandos del cliente

| Comando (desde la raíz) | Qué hace |
|---|---|
| `npm --prefix cliente start` | Servidor de desarrollo con el proxy a la API |
| `npm --prefix cliente test` | Tests del cliente (Vitest, sin navegador) |
| `npm --prefix cliente run lint` | Lint del cliente, con las reglas de fronteras entre áreas |
| `npm --prefix cliente run build` | Build de producción en `cliente/dist/` |
| `npm --prefix cliente run api:generar` | Regenera el cliente HTTP desde `openapi/openapi.json`; **hazlo cada vez que cambie el contrato** |
| `npm --prefix cliente run api:deriva` | Comprueba que el cliente generado coincide con el contrato |
| `npm --prefix cliente run test:herramientas` | Prueba las fronteras del lint, el proxy y la generación del cliente HTTP |
| `npm --prefix cliente run ci` | Todo lo anterior en orden; `npm run ci` de la raíz lo corre después del servicio |
| `npm run auditoria:cliente` | Auditoría de dependencias del cliente con sus excepciones (`cliente/auditoria-excepciones.json`) |

Si cambias un endpoint de la API: `npm --prefix servicio run contrato:generar` y luego
`npm --prefix cliente run api:generar`, y commitea los dos resultados. Sin eso, `npm run ci` falla en la deriva.

## Cómo se agrega una pantalla nueva

El cliente crece por **áreas**: una carpeta por funcionalidad de negocio en `cliente/src/app/areas/<area>/`, con su
definición (`area.ts`), sus rutas y sus pantallas. Agregar un área es una carpeta nueva y **una línea** en
`areas/registro/registro.ts`; el menú y las rutas salen del registro y del rol. Un área no importa de otra: si dos
necesitan lo mismo, la pieza sube a `compartido/` (interfaz) o a `nucleo/` (transversal) y el lint lo hace cumplir. La
guía para quien escribe código está en la skill `luxeboreal-arquitectura`, sección «Cliente».

### El menú lateral y sus grupos

El menú de la izquierda se arma solo desde `DefinicionArea.menu`. Cada entrada es una **pantalla directa** (lleva a su
`ruta`) o un **grupo** (`hijos`, sin `ruta`) que se despliega y se pliega. Para que un área aparezca como grupo:

```ts
menu: [
  {
    titulo: 'Asistente',
    icono: 'forum',
    roles: ['admin'],
    hijos: [
      { titulo: 'Casos de uso', ruta: '/asistente/casos', roles: ['admin'], icono: 'list_alt' },
      { titulo: 'Estilo del bot', ruta: '/asistente/estilo', roles: ['admin'], icono: 'edit_note' },
    ],
  },
],
```

| Qué hace el menú | Detalle |
|---|---|
| Filtra por rol | Oculta las entradas y los hijos que el rol no puede usar; un grupo sin hijos visibles no aparece. El servidor sigue siendo quien decide |
| Marca dónde estás | La pantalla activa se resalta y lleva `aria-current="page"`; el grupo que la contiene arranca desplegado |
| Modo compacto | El botón del pie deja solo los íconos, con el título como ayuda emergente. Se recuerda en el navegador (`luxe.menu.compacto`); si el almacenamiento está bloqueado, funciona igual sin recordarlo |
| En un teléfono | A 640 px o menos el menú es un cajón: arranca cerrado, se abre con el botón de la barra y se cierra al elegir una pantalla |
| Pie | Muestra el nombre y el rol del usuario y el botón «Cerrar sesión» |

Todo se maneja con teclado: cada grupo es un botón con `aria-expanded` y el foco se ve. Un ícono sin `icono` propio usa el
del área (o el del grupo, en un hijo).

## Edición en ventana emergente

Las pantallas muestran la información en modo lectura; **«Editar» y «Nuevo» abren una ventana emergente** con el
formulario (`<app-dialogo-edicion>`, en `compartido/`). Ninguna pantalla tiene un formulario de edición fijo en la
página: un test de estructura (`cliente/herramientas/edicion-en-ventana.spec.ts`) lo hace cumplir.

La pantalla pasa a la ventana:

| Entrada | Para qué |
|---|---|
| `titulo`, `[(abierta)]` | Título y estado abierto/cerrado (la pantalla lo abre con su botón «Editar») |
| `[alGuardar]` | Función `() => Promise<void>` con lo que ocurre al guardar; si rechaza, la ventana sigue abierta |
| `[mensajeDeError]` | Convierte ese error en el motivo que se muestra dentro de la ventana (p. ej. el `detail` del `422`) |
| `[hayCambios]` | Si es verdadero, cerrar (Cancelar, Escape o clic fuera) pide confirmar el descarte |
| `etiquetaGuardar`, `mensajeConfirmacion` | Texto del botón principal y, si se da un mensaje, la confirmación previa («Publicar») |

El formulario va como contenido de la ventana (`<app-editor-con-contador>` u otros campos). Lo escrito no se pierde
cuando el servidor rechaza el guardado; al guardar con éxito la ventana se cierra y la pantalla recarga sus datos. El foco
entra al formulario y vuelve al botón que abrió la ventana.

## Componentes, tema e íconos

Las pantallas se arman con **Angular Material** (MIT, sale con cada versión de Angular; `ng update` lo actualiza junto
con el framework).

| Necesitas | Usa |
|---|---|
| Botón, tarjeta, campo de texto, tabla, diálogo, chip | El componente de Material (`mat-flat-button`, `mat-card`, `mat-form-field` + `matInput`, `mat-table`…) |
| Un mensaje en línea (error, advertencia, información) | `<app-aviso tipo="error">` de `compartido/`; Material no trae uno |
| Pedir confirmación antes de actuar | `<app-confirmacion>` de `compartido/` (abre un diálogo de Material) |
| Editar un valor o crear uno | `<app-dialogo-edicion>` de `compartido/` (ver «Edición en ventana emergente») |
| Un ícono | `<mat-icon fontIcon="nombre" aria-hidden="true" />`, con el nombre de [Material Symbols](https://fonts.google.com/icons) |
| Un color | Un token del tema, p. ej. `var(--mat-sys-primary)` o `var(--mat-sys-on-surface-variant)`; nunca un valor fijo |

- **Tema**: Material 3 en `cliente/src/styles.scss`; sigue el modo claro u oscuro del sistema.
- **Íconos con `fontIcon`**, no como texto dentro de la etiqueta: así el nombre del ícono no aparece en el texto del
  botón ni lo lee un lector de pantalla.
- **Tablas**: `mat-table` es una tabla de datos simple. Filtros, columnas configurables o exportar no vienen listos; si
  una pantalla los necesita, se decide en un ADR.

## Qué falta

- **Producción.** Cómo se sirve el cliente bajo el mismo dominio de la API se decide en la Fase 09b (P55). Hasta
  entonces el cliente solo corre en local.
- **Más pantallas.** El perfil del bot, los escenarios, el inventario y las ventas llegan en fases siguientes, como
  áreas nuevas.
