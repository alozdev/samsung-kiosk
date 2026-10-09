# samsung-kiosk

App para Samsung Smart TV (Tizen) que convierte la TV en una **pantalla de kiosk**: al abrirse muestra **una sola página web a pantalla completa**, sin barra de navegador, bordes ni menús, y se queda ahí. Sirve para dashboards, monitores de sistemas, pantallas informativas o cualquier página que deba estar siempre visible.

La página a mostrar y el resto de opciones se definen en un archivo `.env`. Un script de build las incrusta en la app, la empaqueta como `.wgt` firmado y se instala en la TV por red.

## Índice

1. [Cómo funciona](#cómo-funciona)
2. [Requisitos](#requisitos)
3. [Instalar Tizen Studio](#instalar-tizen-studio)
4. [Configuración (`.env`)](#configuración-env)
5. [Modos de carga: `redirect` vs `iframe`](#modos-de-carga-redirect-vs-iframe)
6. [Instalación en la TV](#instalación-en-la-tv)
7. [Actualizar la app](#actualizar-la-app)
8. [Uso diario y control remoto](#uso-diario-y-control-remoto)
9. [Compatibilidad del sitio con la TV](#compatibilidad-del-sitio-con-la-tv)
10. [Depurar en la TV](#depurar-en-la-tv)
11. [Estructura del proyecto](#estructura-del-proyecto)
12. [Seguridad y buenas prácticas](#seguridad-y-buenas-prácticas)
13. [Limitaciones](#limitaciones)
14. [Solución de problemas](#solución-de-problemas)

## Cómo funciona

```
.env ──► npm run package ──► build/Kiosk.wgt (firmado) ──► tizen install ──► TV
         (scripts/build.mjs)
```

1. `scripts/build.mjs` lee el `.env`, valida los valores, copia `src/` a `build/` y genera `build/config.js` con la configuración.
2. Con `--package`, firma `build/` con tu certificado Samsung y genera `build/Kiosk.wgt`.
3. `tizen install` envía el `.wgt` a la TV por la red (requiere el modo desarrollador de la TV).

Al abrirse en la TV, la app (`src/main.js`):

1. Desactiva el protector de pantalla.
2. Quita el silencio de la TV y, si se configuró, fija el volumen.
3. Si no hay red, espera a tenerla.
4. Si hay basic auth, hace una petición autenticada para que la TV guarde las credenciales.
5. Carga la página según el [modo](#modos-de-carga-redirect-vs-iframe): navegando directo a ella (`redirect`) o dentro de un iframe (`iframe`).

La configuración queda **incrustada en el `.wgt`**: cambiar el `.env` no afecta a la TV hasta volver a empaquetar e instalar.

## Requisitos

| Qué | Para qué |
| --- | --- |
| [Node.js](https://nodejs.org) 20.11 o superior | Ejecutar el script de build. |
| **Tizen Studio** con *TV Extensions* y *Web CLI* | Los comandos `tizen` (empaquetar, instalar, abrir) y `sdb` (conectar con la TV). Ver [Instalar Tizen Studio](#instalar-tizen-studio). |
| Cuenta Samsung | Crear el certificado Samsung con el que se firma la app. |
| Samsung Smart TV con Tizen 3.0 o superior (modelos 2017 en adelante) | Donde corre la app. Debe estar en la misma red que el PC. |

Sin Tizen Studio, `npm run build` funciona, pero `npm run package` falla con `No se encontró el CLI de Tizen`.

### Qué Tizen tiene mi TV

En la TV, **Ajustes → Soporte → Acerca de este TV** muestra el código de modelo. La letra del año dentro del código indica la versión (por ejemplo, `UN32`**`T`**`4310` es de 2020):

| Letra | Año | Tizen | Navegador interno |
| --- | --- | --- | --- |
| M | 2017 | 3.0 | Chromium 47 |
| N | 2018 | 4.0 | Chromium 56 |
| R | 2019 | 5.0 | Chromium 63 |
| T | 2020 | 5.5 | Chromium 69 |
| A | 2021 | 6.0 | Chromium 76 |
| B | 2022 | 6.5 | Chromium 85 |
| C | 2023 | 7.0 | Chromium 94 |
| D | 2024 | 8.0 | Chromium 108 |

La versión exacta se obtiene con la TV conectada: `sdb capability` (línea `platform_version`). El navegador interno importa más de lo que parece: ver [Compatibilidad del sitio](#compatibilidad-del-sitio-con-la-tv).

## Instalar Tizen Studio

1. Descarga **Tizen Studio (with IDE)** desde <https://developer.tizen.org/development/tizen-studio/download>. Los instaladores recientes ya incluyen Java.
2. Instálalo en **`C:\tizen-studio`**, la ruta que el script de build busca por defecto. **Evita rutas con espacios**: algunos scripts de Tizen fallan con ellas.
3. Al terminar se abre el **Package Manager** (también está en `C:\tizen-studio\package-manager\`). Instala:
   - **Main SDK** → *Tizen SDK tools* (incluye *Web CLI*, el comando `tizen`).
   - **Extension SDK** → *TV Extensions* (la versión más nueva) y *Samsung Certificate Extension*.
4. Agrega al `PATH` (recomendado):
   - `C:\tizen-studio\tools\ide\bin` → comando `tizen`
   - `C:\tizen-studio\tools` → comando `sdb`
5. En una **terminal nueva**, verifica con `tizen version` y `sdb version`.

Si no los agregas al `PATH`, usa rutas completas en los comandos (por ejemplo `C:\tizen-studio\tools\sdb.exe connect ...`); `npm run package` encuentra Tizen Studio igual. Si lo instalaste en otra carpeta, defínela en `TIZEN_HOME` del `.env`.

### Alternativa: extensión Tizen de VS Code

La extensión **Tizen** de VS Code instala un SDK reducido en `%USERPROFILE%\.tizen-extension-platform\server\sdktools\data`, que el script de build también busca. Trae `sdb`, Certificate Manager y Package Manager, pero **no** el comando `tizen` ni el soporte para TV: hay que instalar *Web CLI* y *TV Extensions* desde su Package Manager. Como esa ruta está dentro de la carpeta de usuario, si tu nombre de usuario tiene espacios el comando `tizen` falla; en ese caso usa Tizen Studio en `C:\tizen-studio`.

## Configuración (`.env`)

```bash
cp .env.example .env
```

`.env.example` explica cada variable. Resumen:

| Variable | Default | Modo | Descripción |
| --- | --- | --- | --- |
| `KIOSK_URL` | — | ambos | **Obligatoria.** Página a mostrar, sin credenciales en la URL. |
| `KIOSK_MODE` | `redirect` | — | `redirect` o `iframe`. Ver [Modos de carga](#modos-de-carga-redirect-vs-iframe). |
| `KIOSK_ZOOM` | `1` | iframe | Escala de la página: `1` = 100 %, `1.25` = 125 %, o `auto`. Ver [Zoom](#zoom-solo-iframe). |
| `KIOSK_RELOAD_MINUTES` | `0` | iframe | Recarga la página cada N minutos. `0` = nunca. |
| `KIOSK_USER` | vacío | ambos | Usuario de basic auth. Vacío si el sitio no lo pide. Ver [Basic auth](#basic-auth). |
| `KIOSK_PASSWORD` | vacío | ambos | Clave de basic auth. |
| `KIOSK_VOLUME` | vacío | ambos | Volumen de la TV al abrir (0–100). Siempre quita el silencio; vacío = no cambia el volumen. |
| `TIZEN_PROFILE` | `kiosk` | — | Nombre del perfil de certificado Samsung en el Certificate Manager. |
| `TIZEN_HOME` | vacío | — | Carpeta de Tizen Studio, si no está en una ruta conocida ni en el `PATH`. |

En modo `redirect`, `KIOSK_ZOOM` y `KIOSK_RELOAD_MINUTES` se ignoran (el build avisa si pones un zoom distinto de `1`).

## Modos de carga: `redirect` vs `iframe`

La diferencia de fondo: en **`redirect`** la app navega a la página y **deja de existir**; la página queda sola en pantalla. En **`iframe`** la app **se queda alrededor** de la página y la muestra dentro de un iframe, así que puede seguir actuando sobre ella.

| | `redirect` | `iframe` |
| --- | --- | --- |
| Funciona con cualquier sitio | ✅ | ⚠️ Solo si el sitio permite ser embebido |
| Pantalla completa sin bordes | ✅ | ✅ |
| Basic auth | ✅ | ✅ |
| Sonido de la página | ✅ | ✅ |
| Protector de pantalla desactivado y volumen | ✅ (al arrancar) | ✅ (al arrancar) |
| Espera de red al arrancar | ✅ | ✅ |
| Zoom (`KIOSK_ZOOM`, CH+/CH−) | ❌ | ✅ |
| Recarga periódica (`KIOSK_RELOAD_MINUTES`) | ❌ | ✅ |
| Teclas del control remoto | Todas llegan a la página | CH+, CH− y 0 los usa la app para el zoom |

**Cuándo usar cada uno:**

- **`iframe`**, si el sitio lo permite: es el más flexible. Para saberlo, revisa que la respuesta del sitio **no** traiga `X-Frame-Options` ni un `Content-Security-Policy: frame-ancestors` restrictivo (`curl -I https://tu-sitio`). Si no lo permite, la TV muestra la pantalla en negro.
- **`redirect`**, si el sitio no se deja embeber o si la página necesita recibir todas las teclas del control.

**¿Por qué `redirect` no puede hacer zoom?** En la TV la app no corre en un Chromium al que se le pasen parámetros: corre en el motor de apps de Tizen, que no tiene opción de zoom, y al navegar el código de la app desaparece. En `redirect`, si hace falta escalar, debe hacerlo la propia página (por ejemplo, aceptando un parámetro `?zoom=`).

### Zoom (solo iframe)

Las apps de Tizen se dibujan a un ancho fijo de 1920 px, sin importar la resolución real del panel. Si la página se ve muy grande o muy chica:

- **Fijo en el `.env`**: `KIOSK_ZOOM=1.25` (más grande) o `0.8` (más chica).
- **Con el control remoto**: **CH+** / **CH−** suben o bajan al siguiente múltiplo de 10 % (100 %, 110 %, 120 %…). El valor se muestra en pantalla y queda guardado en la TV, incluso al apagarla o reinstalar la app. **0** borra el ajuste y vuelve al valor del `.env`. Si cambias `KIOSK_ZOOM` en el `.env` y reinstalas, el ajuste guardado se descarta y manda el nuevo valor.
- **`auto`**: escala según la resolución física del panel, para que la página se vea como en un monitor de esa resolución (en un panel de 1366 px: 1920 / 1366 ≈ 140 %). Suele agrandar de más las páginas pensadas para 1920 px; úsalo solo si con `1` se ve chica.

Al abrir la app en modo iframe aparece unos segundos un aviso arriba a la derecha (`Zoom … | app … | panel … | iframe …`) con el zoom aplicado y las resoluciones detectadas, útil para diagnosticar.

### Basic auth

Si `KIOSK_USER` tiene valor, antes de cargar la página la app hace una petición con usuario y clave para que la TV guarde las credenciales; después la página carga sin pedir login, en ambos modos.

En `redirect`, si esa petición falla, la app navega como último recurso a `https://usuario:clave@sitio/`. Se evita siempre que se puede: con credenciales en la URL, la página las hereda en sus rutas relativas (audio, `fetch`, imágenes) y el navegador **bloquea esas peticiones**. Síntoma típico: la página carga pero no suena ni actualiza datos. En `iframe` no existe ese respaldo, porque los iframes no aceptan credenciales en la URL.

### Sonido

La app quita el silencio de la TV al abrir y, si `KIOSK_VOLUME` tiene valor, fija el volumen. Que la página suene depende de **cómo reproduce el audio**:

- En Tizen, `<audio>` / `new Audio()` lo descarga el **reproductor nativo de la TV**, que **no usa las credenciales de basic auth** del navegador ni reproduce `blob:` URLs: se queda en `stalled`, sin sonar ni dar error. Con basic auth, `new Audio()` no suena en ningún modo.
- **Web Audio API** sí funciona, en `redirect` y en `iframe` (verificado en una TV con Tizen 5.5): descargar el archivo con `fetch()` (que usa las credenciales), decodificarlo con `decodeAudioData` y reproducirlo con un `AudioBufferSource`. En Chromium 69 además arranca sin bloqueo de reproducción automática; en TVs más nuevas (Chromium 71+) puede requerir una primera interacción.

Esto **se resuelve en el sitio**, no en esta app. Si el sitio no usa basic auth, `new Audio()` puede funcionar, pero el navegador puede bloquear la reproducción automática hasta la primera interacción (presionar **OK**).

## Instalación en la TV

### 1. Activar el modo desarrollador (una sola vez)

1. Averigua la **IP de tu PC** con `ipconfig` (campo *Dirección IPv4*).
2. En la TV abre **Apps** y marca `1 2 3 4 5` con el control remoto.
3. Activa **Developer mode**, escribe la IP de tu PC y **reinicia la TV** (apagar y encender).
4. Averigua la **IP de la TV**: **Ajustes → General → Red → Estado de la red → Configuración IP** (en modelos 2022+: **Ajustes → Conexión → Red**).

Conviene **reservar IPs fijas** para la TV y el PC en el router: si la del PC cambia, hay que repetir este paso; si cambia la de la TV, hay que volver a conectarla con la IP nueva.

### 2. Conectar la TV

```bash
sdb connect <IP_DE_LA_TV>
sdb devices
```

`sdb devices` lista la TV con su **nombre de dispositivo** en la última columna (por ejemplo `UN32T4310AFXZX`). Ese nombre es el que usan los comandos `tizen ... -t`; **no confundir con el DUID**.

### 3. Crear el certificado Samsung (una sola vez)

La TV solo instala apps firmadas con un certificado Samsung que incluya su **DUID** (identificador único del equipo).

Con la TV conectada (paso 2), abre el **Certificate Manager** (`C:\tizen-studio\tools\certificate-manager\`):

1. **+** → tipo **Samsung** → dispositivo **TV**.
2. Nombre del perfil: el mismo que `TIZEN_PROFILE` en el `.env`.
3. Crea un certificado de autor nuevo y guarda su contraseña.
4. Inicia sesión con tu cuenta Samsung.
5. En el certificado de distribuidor, verifica que aparezca el DUID de la TV conectada (lo detecta solo). Para verlo a mano: `sdb shell 0 getduid`.

Los archivos del certificado quedan en `%USERPROFILE%\SamsungCertificate\<perfil>\`. **Respáldalos**: si reinstalas Tizen Studio no hace falta crear otro, basta con volver a registrar el perfil apuntando a esos archivos (desde el Certificate Manager o con `tizen security-profiles add`). Para usar otra TV, hay que sumar su DUID al certificado de distribuidor.

### 4. Empaquetar, instalar y abrir

```bash
npm run package
tizen install -n Kiosk.wgt -t <NOMBRE_DEL_DISPOSITIVO> -- build
tizen run -p AlozKiosk0.kiosk -t <NOMBRE_DEL_DISPOSITIVO>
```

- `npm run package` genera `build/Kiosk.wgt` firmado. La salida debe mencionar `Author certificate` y `Distributor1 certificate`; si no, el paquete quedó sin firmar y la TV lo rechazará (revisa `TIZEN_PROFILE`).
- `tizen run` abre la app en la TV (opcional). En la TV aparece como **Kiosk** en Apps.

### 5. Abrir sola al encender

En la mayoría de los modelos: **Ajustes → General → Funciones inteligentes → Ejecutar automáticamente la última app**. Si la app estaba abierta al apagar la TV, se vuelve a abrir al encenderla.

## Actualizar la app

Tras cambiar el `.env` o el código:

```bash
sdb connect <IP_DE_LA_TV>
npm run package
tizen install -n Kiosk.wgt -t <NOMBRE_DEL_DISPOSITIVO> -- build
tizen run -p AlozKiosk0.kiosk -t <NOMBRE_DEL_DISPOSITIVO>
```

La instalación reemplaza la versión anterior. Si cambias el **icono o el nombre** de la app, sube también `version` en `src/config.xml` y desinstala antes de instalar (`tizen uninstall -p AlozKiosk0.kiosk -t <NOMBRE_DEL_DISPOSITIVO>`): la TV guarda el icono en caché y, si no, sigue mostrando el anterior.

## Uso diario y control remoto

- La app abre la página y no requiere interacción.
- En modo `iframe`: **CH+** / **CH−** ajustan el zoom y **0** lo restablece.
- Para salir, usa el botón **Home** del control.
- Si la red se cae al arrancar, la pantalla queda negra hasta que vuelve, y entonces la página carga sola.

## Compatibilidad del sitio con la TV

La página se muestra con el **navegador interno de la TV**, que suele ser bastante más antiguo que uno de escritorio (ver la [tabla](#qué-tizen-tiene-mi-tv): una TV de 2020 usa Chromium 69, de 2018). Un sitio que se ve bien en el PC puede verse roto en la TV: sin márgenes ni bordes, con elementos gigantes, o con datos que no se actualizan. Eso **no se arregla desde esta app**: hay que hacer el sitio compatible.

Puntos típicos con frameworks modernos:

- **Next.js 15+** asume Chrome 111+. Hay que declarar el navegador de la TV en `browserslist` y agregar polyfills de las APIs que el runtime usa sin comprobar (`globalThis`, `Object.fromEntries`, `Object.hasOwn`…), cargados antes que cualquier script de Next.
- **Tailwind CSS v4** genera CSS moderno (`@layer`, `padding-inline`, `gap` en flexbox, `@property`, `color-mix()`) que los navegadores antiguos ignoran. Se corrige transformando el CSS al compilar (por ejemplo, con `postcss-preset-env`).

**Probar sin la TV:** descarga el mismo Chromium que usa tu TV y abre ahí el sitio. Para Chromium 69 (revisión 576753):

```bash
npx @puppeteer/browsers install chromium@576753 --path C:\tools\chromium69
```

```powershell
& "C:\tools\chromium69\chromium\win64-576753\chrome-win32\chrome.exe" --user-data-dir=C:\temp\perfil69 --window-size=1920,1080 "https://tu-sitio/"
```

F12 abre DevTools para ver qué estilos o scripts fallan. Es un navegador sin actualizaciones de seguridad: úsalo solo para probar tus propios sitios.

## Depurar en la TV

Con la TV conectada por `sdb`, la app se puede abrir con el inspector de Chromium:

```bash
sdb -s <IP_DE_LA_TV>:26101 shell 0 was_kill AlozKiosk0          # cerrar la app si está abierta
sdb -s <IP_DE_LA_TV>:26101 shell 0 debug AlozKiosk0.kiosk        # imprime "port: NNNNN"
sdb -s <IP_DE_LA_TV>:26101 forward tcp:NNNNN tcp:NNNNN
```

Luego abre `http://localhost:NNNNN/json` en el PC: lista las páginas y su `webSocketDebuggerUrl` para conectarse por el protocolo de DevTools (consola, evaluar JavaScript, estilos calculados). En modo `iframe` el inspector muestra la app (`file:///index.html`); en `redirect`, la página del sitio. La TV no permite capturas de pantalla por este medio.

## Estructura del proyecto

```
.env.example        plantilla de configuración (documentada)
.env                tu configuración (no se versiona)
package.json        scripts: build y package
scripts/build.mjs   lee y valida .env, copia src/ a build/, genera config.js y empaqueta
src/config.xml      manifiesto Tizen: id de la app, icono, permisos, perfil TV
src/index.html      página contenedora a pantalla completa
src/style.css       estilos de la página contenedora (archivo aparte por la CSP de Tizen)
src/main.js         lógica de la app: protector de pantalla, sonido, red, auth, modos y zoom
src/icon.png        icono de Smart Hub (PNG 512x423, tamaño recomendado por Samsung)
build/              salida del build y el .wgt (se regenera, no se versiona)
```

Permisos que declara la app en `src/config.xml`: `internet`, `tv.inputdevice` (teclas CH+/CH−/0) y `tv.audio` (silencio y volumen). Identificador de la app: `AlozKiosk0.kiosk`.

## Seguridad y buenas prácticas

- **El repositorio es público.** Nunca commitear `.env`, `build/`, `.wgt` ni certificados (`*.p12`); ya están en `.gitignore`. `.env.example` solo lleva valores de ejemplo.
- **Las credenciales quedan en texto plano dentro del `.wgt`** (`config.js`). Usa un usuario dedicado para la TV, de solo lectura si es posible, nunca una cuenta personal, y no compartas el `.wgt`.
- **Respalda el certificado Samsung** (`%USERPROFILE%\SamsungCertificate\`) fuera del repo.
- **No editar `build/`**: se regenera en cada build. Los cambios van en `src/`.
- **Nada de CSS ni JS inline en `src/index.html`**: Tizen aplica a la app una CSP (`style-src 'self'`) que bloquea los `<style>` inline sin avisar en pantalla. Los estilos van en `src/style.css` y el código en `src/main.js`.
- **Código de `src/` compatible con navegadores antiguos**: el más viejo soportado es Chromium 47 (Tizen 3.0). Usa `var`, funciones normales y nada de sintaxis moderna sin probarla.
- **Variables nuevas**: documéntalas en `.env.example`, valídalas en `scripts/build.mjs` y descríbelas en este README.

## Limitaciones

- En TVs de consumo el **modo desarrollador puede desactivarse** tras un tiempo o con una actualización de firmware; habrá que reactivarlo y reinstalar.
- La app solo se instala en TVs cuyo DUID esté en el certificado.
- En modo `redirect` no hay zoom, recarga periódica ni teclas CH+/CH− (ver [Modos de carga](#modos-de-carga-redirect-vs-iframe)).
- El sonido depende de cómo lo reproduzca el sitio: con basic auth, `new Audio()` no suena en Tizen (ver [Sonido](#sonido)).
- Para un despliegue comercial permanente conviene una pantalla **Samsung de señalización** (línea comercial, con MagicInfo / URL Launcher), que hace esto de fábrica sin modo desarrollador.

## Solución de problemas

| Síntoma | Causa probable y solución |
| --- | --- |
| `No se encontró el CLI de Tizen` / `'tizen' is not recognized` | Tizen Studio no está instalado o le falta *Web CLI*. Ver [Instalar Tizen Studio](#instalar-tizen-studio), o define `TIZEN_HOME`. |
| `Could not find or load main class <parte de tu ruta>` | El SDK está en una ruta con espacios. Instala Tizen Studio en `C:\tizen-studio`. |
| `'sdb' is not recognized` | `C:\tizen-studio\tools` no está en el `PATH`; agrégalo o usa la ruta completa. |
| `There is no <X> target` | En `-t` va el **nombre del dispositivo** que muestra `sdb devices`, no el DUID ni la IP. |
| `npm run package` no menciona `Author certificate` | El perfil `TIZEN_PROFILE` no existe. Revisa con `tizen security-profiles list`. |
| `tizen install` falla por certificado | El perfil no es tipo Samsung o no incluye el DUID de la TV. |
| `sdb connect` no conecta | Modo desarrollador apagado, la TV no se reinició tras activarlo, o la IP del PC configurada en la TV cambió. |
| La app no aparece en la TV tras instalar | El paquete no estaba firmado o `-t` era incorrecto; revisa la salida de `tizen install`. |
| Pantalla negra en modo `iframe` | El sitio no permite ser embebido. Usa `redirect`. |
| Pantalla negra en cualquier modo | Sin red: la app espera y carga sola cuando vuelve. |
| Aparece el cuadro de login | Usuario o clave incorrectos en el `.env`, o el servidor rechazó la petición previa. |
| La página carga pero no suena ni actualiza datos | Credenciales heredadas en la URL (ver [Basic auth](#basic-auth)) o sitio incompatible con el navegador de la TV (ver [Compatibilidad](#compatibilidad-del-sitio-con-la-tv)). |
| No se escuchan las alertas | Si el sitio usa basic auth y `new Audio()`, el reproductor de la TV no descarga el audio: el sitio debe usar Web Audio (ver [Sonido](#sonido)). Si no, presiona **OK** una vez (bloqueo de autoplay) y revisa `KIOSK_VOLUME`. |
| Se ve sin márgenes, sin bordes o con elementos gigantes | El CSS del sitio es demasiado moderno para la TV. Ver [Compatibilidad](#compatibilidad-del-sitio-con-la-tv). |
| Se ve muy grande o muy chica | Modo `iframe` + `KIOSK_ZOOM` o CH+/CH−. En `redirect` no hay zoom. |
| La app muestra el icono genérico | La TV guardó el icono anterior en caché: sube `version` en `src/config.xml`, desinstala y vuelve a instalar (ver [Actualizar la app](#actualizar-la-app)). |
| Un cambio del `.env` no se refleja en la TV | La configuración va dentro del `.wgt`: vuelve a empaquetar e instalar. |
