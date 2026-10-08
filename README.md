# samsung-kiosk

App web para Samsung Smart TV (Tizen) que muestra **una sola URL a pantalla completa**, sin barra de navegador, bordes ni interfaz. Pensada para usar la TV como kiosk o pantalla informativa: se enciende, abre la página y se queda ahí.

La URL y demás opciones se configuran en un archivo `.env`; el build las incrusta en la app.

## Características

- Pantalla completa, sin márgenes ni menús (fondo negro mientras carga).
- URL configurable por `.env`.
- Soporte opcional de **basic auth**.
- Desactiva el protector de pantalla de la TV.
- Si la TV arranca sin red, espera a tener conexión antes de cargar.
- Dos modos de carga: `redirect` (por defecto) o `iframe` (con auto-recarga opcional).

## Requisitos

| Qué | Para qué |
| --- | --- |
| [Node.js](https://nodejs.org) 20.11+ | Ejecutar el script de build |
| [Tizen Studio](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html) + *TV Extensions* | CLI `tizen` y `sdb` para empaquetar e instalar |
| Certificado **Samsung** (Certificate Manager de Tizen Studio) | Firmar el `.wgt`; debe incluir el DUID de la TV |
| Samsung Smart TV con Tizen 3.0+ (modelos 2017 en adelante) | Dónde corre la app |

`tizen` y `sdb` deben estar en el `PATH` (normalmente en `C:\tizen-studio\tools\ide\bin` y `C:\tizen-studio\tools`).

## Configuración

Copia la plantilla y edítala:

```bash
cp .env.example .env
```

| Variable | Default | Descripción |
| --- | --- | --- |
| `KIOSK_URL` | — | **Obligatoria.** URL que se mostrará. |
| `KIOSK_MODE` | `redirect` | `redirect` o `iframe` (ver abajo). |
| `KIOSK_RELOAD_MINUTES` | `0` | Solo `iframe`: recarga la página cada N minutos. `0` = nunca. |
| `KIOSK_USER` | vacío | Usuario de basic auth (opcional). |
| `KIOSK_PASSWORD` | vacío | Clave de basic auth (opcional). |
| `TIZEN_PROFILE` | `kiosk` | Nombre del perfil de certificado en Tizen Studio. |

### Modos de carga

- **`redirect`**: la app navega directamente a la URL. Funciona con cualquier sitio. Es el recomendado.
- **`iframe`**: la página se carga dentro de un iframe. Permite auto-recarga periódica, pero **muchos sitios bloquean ser embebidos** (`X-Frame-Options` / `frame-ancestors`) y se verá en blanco.

### Basic auth

Si `KIOSK_USER` tiene valor, antes de cargar la página la app hace una petición autenticada para que el webview guarde las credenciales. En modo `redirect` además navega a `https://usuario:clave@host/...` como respaldo. En modo `iframe` solo se usa la petición previa, porque Chromium no acepta credenciales en la URL de un iframe.

## Uso

### 1. Preparar la TV (una sola vez)

1. En la TV abre **Apps**, marca `1 2 3 4 5` con el control remoto.
2. Activa **Developer mode**, ingresa la IP del PC desde donde vas a instalar y reinicia la TV.
3. En Tizen Studio → **Certificate Manager**, crea un perfil tipo **Samsung** con el mismo nombre que `TIZEN_PROFILE`, registrando el DUID de la TV (se obtiene al conectarla con el Device Manager).

### 2. Compilar, empaquetar e instalar

```bash
npm run build      # genera build/ con la configuración del .env
npm run package    # build + crea el .wgt firmado

sdb connect <IP_DE_LA_TV>
tizen install -n Kiosk.wgt -t <nombre-del-dispositivo> -- build
```

`sdb devices` muestra el nombre del dispositivo. Para cambiar la URL basta con editar `.env` y repetir este paso.

### 3. Abrir sola al encender

En la mayoría de los modelos: **Ajustes → General → Funciones inteligentes → Ejecutar automáticamente la última app**. Abre la app una vez y desde ahí se abrirá al encender la TV.

### Probar en el PC

`npm run build` y abre `build/index.html` en un navegador. El error 404 de `webapis.js` es normal fuera de la TV.

## Estructura

```
.env.example        plantilla de configuración
scripts/build.mjs   lee .env, copia src/ a build/ y genera config.js
src/config.xml      manifiesto Tizen (permisos, perfil TV, navegación)
src/index.html      página contenedora a pantalla completa
src/main.js         lógica: protector de pantalla, red, auth y carga de la URL
```

## Reglas y buenas prácticas

- **Nunca commitear `.env`** (ya está en `.gitignore`); solo `.env.example`, sin datos reales.
- **No editar `build/`**: se regenera en cada build. Los cambios van en `src/`.
- **Credenciales**: quedan en texto plano dentro del `.wgt` (`config.js`). Usa un usuario dedicado con permisos mínimos, solo lectura si es posible; nunca una cuenta personal.
- **El `.wgt` contiene la configuración**: no lo compartas si incluye credenciales.
- Al agregar variables nuevas, documentarlas en `.env.example` y en este README.
- Mantener el código de `src/` compatible con el navegador más antiguo que se quiera soportar (Tizen 3.0 usa un Chromium antiguo): evitar sintaxis moderna sin probarla en la TV.

## Limitaciones conocidas

- En TVs de consumo el **modo desarrollador puede desactivarse** tras unas semanas o con una actualización de firmware; habrá que reactivarlo y reinstalar.
- Para un despliegue comercial permanente conviene una pantalla **Samsung de señalización** (línea comercial, con MagicInfo/URL Launcher), que hace esto de fábrica.
- Sin icono propio: para agregarlo, coloca `src/icon.png` y añade `<icon src="icon.png"/>` en `src/config.xml`.
- Con el modo `redirect` la app pierde el control de la página tras navegar (no hay auto-recarga).

## Solución de problemas

| Síntoma | Causa probable |
| --- | --- |
| Pantalla en blanco en modo `iframe` | El sitio bloquea iframes → usa `redirect`. |
| Aparece el cuadro de login igual | La versión de Chromium de la TV no reutiliza las credenciales; prueba modo `redirect`. |
| `tizen install` falla por certificado | El perfil no es tipo Samsung o no incluye el DUID de la TV. |
| `sdb connect` no conecta | El modo desarrollador está apagado o la IP del PC configurada en la TV no coincide. |
| Pantalla negra sin cargar | La TV no tiene red; la app espera conexión y carga sola al recuperarla. |
