# samsung-kiosk

App for Samsung Smart TVs (Tizen) that turns the TV into a **kiosk display**: when opened it shows **a single web page in full screen**, with no browser bar, borders or menus, and stays there. Useful for dashboards, system monitors, information screens or any page that must always be visible.

The page to show and the rest of the options are defined in a `.env` file. A build script embeds them into the app, packages it as a signed `.wgt` and installs it on the TV over the network.

## Contents

1. [How it works](#how-it-works)
2. [Requirements](#requirements)
3. [Installing Tizen Studio](#installing-tizen-studio)
4. [Configuration (`.env`)](#configuration-env)
5. [Load modes: `redirect` vs `iframe`](#load-modes-redirect-vs-iframe)
6. [Installing on the TV](#installing-on-the-tv)
7. [Updating the app](#updating-the-app)
8. [Daily use and remote control](#daily-use-and-remote-control)
9. [Site compatibility with the TV](#site-compatibility-with-the-tv)
10. [Debugging on the TV](#debugging-on-the-tv)
11. [Project structure](#project-structure)
12. [Security and best practices](#security-and-best-practices)
13. [Limitations](#limitations)
14. [Troubleshooting](#troubleshooting)

## How it works

```
.env ──► npm run package ──► build/Kiosk.wgt (signed) ──► tizen install ──► TV
         (scripts/build.mjs)
```

1. `scripts/build.mjs` reads `.env`, validates the values, copies `src/` to `build/` and generates `build/config.js` with the configuration.
2. With `--package`, it signs `build/` with your Samsung certificate and produces `build/Kiosk.wgt`.
3. `tizen install` sends the `.wgt` to the TV over the network (requires the TV's developer mode).

When it opens on the TV, the app (`src/main.js`):

1. Disables the screen saver.
2. Unmutes the TV and, if configured, sets the volume.
3. If there is no network, waits for it.
4. If basic auth is configured, makes an authenticated request so the TV caches the credentials.
5. Loads the page according to the [mode](#load-modes-redirect-vs-iframe): navigating straight to it (`redirect`) or inside an iframe (`iframe`).

The configuration is **embedded in the `.wgt`**: changing `.env` has no effect on the TV until you package and install again.

## Requirements

| What | Why |
| --- | --- |
| [Node.js](https://nodejs.org) 20.11 or later | Runs the build script. |
| **Tizen Studio** with *TV Extensions* and *Web CLI* | The `tizen` (package, install, launch) and `sdb` (connect to the TV) commands. See [Installing Tizen Studio](#installing-tizen-studio). |
| Samsung account | Creating the Samsung certificate used to sign the app. |
| Samsung Smart TV with Tizen 3.0 or later (2017 models onwards) | Where the app runs. Must be on the same network as the PC. |

Without Tizen Studio, `npm run build` works but `npm run package` fails with `Tizen CLI not found`.

### Which Tizen does my TV have

On the TV, **Settings → Support → About This TV** shows the model code. The year letter in the code tells the version (for example, `UN32`**`T`**`4310` is a 2020 model):

| Letter | Year | Tizen | Built-in browser |
| --- | --- | --- | --- |
| M | 2017 | 3.0 | Chromium 47 |
| N | 2018 | 4.0 | Chromium 56 |
| R | 2019 | 5.0 | Chromium 63 |
| T | 2020 | 5.5 | Chromium 69 |
| A | 2021 | 6.0 | Chromium 76 |
| B | 2022 | 6.5 | Chromium 85 |
| C | 2023 | 7.0 | Chromium 94 |
| D | 2024 | 8.0 | Chromium 108 |

The exact version is available with the TV connected: `sdb capability` (`platform_version` line). The built-in browser matters more than it seems: see [Site compatibility](#site-compatibility-with-the-tv).

## Installing Tizen Studio

1. Download **Tizen Studio (with IDE)** from <https://developer.tizen.org/development/tizen-studio/download>. Recent installers already bundle Java.
2. Install it in **`C:\tizen-studio`**, the path the build script looks in by default. **Avoid paths with spaces**: some Tizen scripts break with them.
3. When it finishes, the **Package Manager** opens (it is also in `C:\tizen-studio\package-manager\`). Install:
   - **Main SDK** → *Tizen SDK tools* (includes *Web CLI*, the `tizen` command).
   - **Extension SDK** → *TV Extensions* (latest version) and *Samsung Certificate Extension*.
4. Add to `PATH` (recommended):
   - `C:\tizen-studio\tools\ide\bin` → `tizen` command
   - `C:\tizen-studio\tools` → `sdb` command
5. In a **new terminal**, check with `tizen version` and `sdb version`.

If you don't add them to `PATH`, use full paths in the commands (for example `C:\tizen-studio\tools\sdb.exe connect ...`); `npm run package` finds Tizen Studio anyway. If you installed it in another folder, set it in `TIZEN_HOME` in `.env`.

### Alternative: Tizen extension for VS Code

The **Tizen** extension for VS Code installs a reduced SDK in `%USERPROFILE%\.tizen-extension-platform\server\sdktools\data`, which the build script also searches. It ships `sdb`, Certificate Manager and Package Manager, but **not** the `tizen` command or TV support: you must install *Web CLI* and *TV Extensions* from its Package Manager. Since that path is inside the user folder, the `tizen` command fails if your user name contains spaces; in that case use Tizen Studio in `C:\tizen-studio`.

## Configuration (`.env`)

```bash
cp .env.example .env
```

`.env.example` explains every variable. Summary:

| Variable | Default | Mode | Description |
| --- | --- | --- | --- |
| `KIOSK_URL` | — | both | **Required.** Page to show, without credentials in the URL. |
| `KIOSK_MODE` | `redirect` | — | `redirect` or `iframe`. See [Load modes](#load-modes-redirect-vs-iframe). |
| `KIOSK_ZOOM` | `1` | iframe | Page scale: `1` = 100 %, `1.25` = 125 %, or `auto`. See [Zoom](#zoom-iframe-only). |
| `KIOSK_RELOAD_MINUTES` | `0` | iframe | Reloads the page every N minutes. `0` = never. |
| `KIOSK_USER` | empty | both | Basic auth user. Empty if the site doesn't require it. See [Basic auth](#basic-auth). |
| `KIOSK_PASSWORD` | empty | both | Basic auth password. |
| `KIOSK_VOLUME` | empty | both | TV volume when the app opens (0–100). Always unmutes; empty = keep the current volume. |
| `TIZEN_PROFILE` | `kiosk` | — | Name of the Samsung certificate profile in the Certificate Manager. |
| `TIZEN_HOME` | empty | — | Tizen Studio folder, if it is not in a known location or in `PATH`. |

In `redirect` mode, `KIOSK_ZOOM` and `KIOSK_RELOAD_MINUTES` are ignored (the build warns if you set a zoom other than `1`).

## Load modes: `redirect` vs `iframe`

The core difference: in **`redirect`** the app navigates to the page and **ceases to exist**; the page is left alone on screen. In **`iframe`** the app **stays around** the page and shows it inside an iframe, so it can keep acting on it.

| | `redirect` | `iframe` |
| --- | --- | --- |
| Works with any site | ✅ | ⚠️ Only if the site allows being embedded |
| Borderless full screen | ✅ | ✅ |
| Basic auth | ✅ | ✅ |
| Page sound | ✅ | ✅ |
| Screen saver disabled and volume | ✅ (on start) | ✅ (on start) |
| Waits for network on start | ✅ | ✅ |
| Zoom (`KIOSK_ZOOM`, CH+/CH−) | ❌ | ✅ |
| Periodic reload (`KIOSK_RELOAD_MINUTES`) | ❌ | ✅ |
| Remote control keys | All reach the page | CH+, CH− and 0 are used by the app for zoom |

**When to use each:**

- **`iframe`**, if the site allows it: it is the most flexible. To check, make sure the site's response does **not** include `X-Frame-Options` or a restrictive `Content-Security-Policy: frame-ancestors` (`curl -I https://your-site`). If it isn't allowed, the TV shows a black screen.
- **`redirect`**, if the site can't be embedded or if the page needs to receive every remote control key.

**Why can't `redirect` zoom?** On the TV the app doesn't run in a Chromium you can pass flags to: it runs in Tizen's app engine, which has no zoom option, and once it navigates away the app's code is gone. In `redirect`, if scaling is needed, the page itself must do it (for example, by accepting a `?zoom=` parameter).

### Zoom (iframe only)

Tizen apps render at a fixed width of 1920 px, regardless of the panel's actual resolution. If the page looks too big or too small:

- **Fixed in `.env`**: `KIOSK_ZOOM=1.25` (bigger) or `0.8` (smaller).
- **With the remote control**: **CH+** / **CH−** go up or down to the next multiple of 10 % (100 %, 110 %, 120 %…). The value is shown on screen and saved on the TV, even across power-offs and reinstalls. **0** clears the adjustment and returns to the `.env` value. If you change `KIOSK_ZOOM` in `.env` and reinstall, the saved adjustment is discarded and the new value applies.
- **`auto`**: scales according to the panel's physical resolution, so the page looks as it would on a monitor of that resolution (on a 1366 px panel: 1920 / 1366 ≈ 140 %). It usually over-enlarges pages designed for 1920 px; use it only if the page looks small at `1`.

When the app opens in iframe mode, a notice appears for a few seconds in the top-right corner (`Zoom … | app … | panel … | iframe …`) with the applied zoom and the detected resolutions, useful for diagnosis.

### Basic auth

If `KIOSK_USER` is set, before loading the page the app makes a request with the user and password so the TV caches the credentials; the page then loads without asking for a login, in both modes.

In `redirect`, if that request fails, the app navigates to `https://user:password@site/` as a last resort. This is avoided whenever possible: with credentials in the URL, the page inherits them in its relative paths (audio, `fetch`, images) and the browser **blocks those requests**. Typical symptom: the page loads but plays no sound and doesn't refresh its data. In `iframe` there is no such fallback, because iframes don't accept credentials in the URL.

### Sound

The app unmutes the TV when it opens and, if `KIOSK_VOLUME` is set, sets the volume. Whether the page plays sound depends on **how it plays audio**:

- On Tizen, `<audio>` / `new Audio()` is downloaded by the **TV's native player**, which **does not use the browser's basic auth credentials** and doesn't play `blob:` URLs either: it stays `stalled`, without playing or raising an error. With basic auth, `new Audio()` plays nothing in either mode.
- The **Web Audio API** does work, in both `redirect` and `iframe` (verified on a Tizen 5.5 TV): download the file with `fetch()` (which uses the credentials), decode it with `decodeAudioData` and play it through an `AudioBufferSource`. On Chromium 69 it also starts without any autoplay restriction; newer TVs (Chromium 71+) may require a first interaction.

This **is solved in the site**, not in this app. If the site doesn't use basic auth, `new Audio()` may work, but the browser may block autoplay until the first interaction (press **OK**).

## Installing on the TV

### 1. Enable developer mode (once)

1. Find your **PC's IP** with `ipconfig` (*IPv4 Address* field).
2. On the TV open **Apps** and enter `1 2 3 4 5` with the remote control.
3. Turn on **Developer mode**, enter your PC's IP and **restart the TV** (power off and on).
4. Find the **TV's IP**: **Settings → General → Network → Network Status → IP Settings** (on 2022+ models: **Settings → Connection → Network**).

It's a good idea to **reserve fixed IPs** for the TV and the PC on the router: if the PC's IP changes, you must repeat this step; if the TV's changes, you must reconnect with the new IP.

### 2. Connect the TV

```bash
sdb connect <TV_IP>
sdb devices
```

`sdb devices` lists the TV with its **device name** in the last column (for example `UN32T4310AFXZX`). That name is what the `tizen ... -t` commands use; **don't confuse it with the DUID**.

### 3. Create the Samsung certificate (once)

The TV only installs apps signed with a Samsung certificate that includes its **DUID** (the device's unique identifier).

With the TV connected (step 2), open the **Certificate Manager** (`C:\tizen-studio\tools\certificate-manager\`):

1. **+** → type **Samsung** → device **TV**.
2. Profile name: the same as `TIZEN_PROFILE` in `.env`.
3. Create a new author certificate and keep its password.
4. Sign in with your Samsung account.
5. In the distributor certificate, check that the connected TV's DUID is listed (it is detected automatically). To see it manually: `sdb shell 0 getduid`.

The certificate files are stored in `%USERPROFILE%\SamsungCertificate\<profile>\`. **Back them up**: if you reinstall Tizen Studio you don't need a new one, just register the profile again pointing to those files (from the Certificate Manager or with `tizen security-profiles add`). To use another TV, its DUID must be added to the distributor certificate.

### 4. Package, install and launch

```bash
npm run package
tizen install -n Kiosk.wgt -t <DEVICE_NAME> -- build
tizen run -p AlozKiosk0.kiosk -t <DEVICE_NAME>
```

- `npm run package` produces a signed `build/Kiosk.wgt`. The output must mention `Author certificate` and `Distributor1 certificate`; otherwise the package wasn't signed and the TV will reject it (check `TIZEN_PROFILE`).
- `tizen run` launches the app on the TV (optional). On the TV it shows up as **Kiosk** under Apps.

### 5. Open automatically on power-on

On most models: **Settings → General → Smart Features → Autorun Last App**. If the app was open when the TV was turned off, it opens again when the TV is turned on.

## Updating the app

After changing `.env` or the code:

```bash
sdb connect <TV_IP>
npm run package
tizen install -n Kiosk.wgt -t <DEVICE_NAME> -- build
tizen run -p AlozKiosk0.kiosk -t <DEVICE_NAME>
```

Installing replaces the previous version. If you change the app's **icon or name**, also bump `version` in `src/config.xml` and uninstall before installing (`tizen uninstall -p AlozKiosk0.kiosk -t <DEVICE_NAME>`): the TV caches the icon and otherwise keeps showing the old one.

## Daily use and remote control

- The app opens the page and needs no interaction.
- In `iframe` mode: **CH+** / **CH−** adjust the zoom and **0** resets it.
- To exit, use the remote's **Home** button.
- If the network is down on start, the screen stays black until it comes back, and then the page loads on its own.

## Site compatibility with the TV

The page is rendered by the **TV's built-in browser**, which is usually much older than a desktop one (see the [table](#which-tizen-does-my-tv-have): a 2020 TV uses Chromium 69, from 2018). A site that looks fine on the PC may look broken on the TV: no margins or borders, huge elements, or data that doesn't refresh. **This app can't fix that**: the site has to be made compatible.

Common issues with modern frameworks:

- **Next.js 15+** assumes Chrome 111+. You need to declare the TV's browser in `browserslist` and add polyfills for the APIs the runtime uses without checking (`globalThis`, `Object.fromEntries`, `Object.hasOwn`…), loaded before any Next script.
- **Tailwind CSS v4** emits modern CSS (`@layer`, `padding-inline`, flexbox `gap`, `@property`, `color-mix()`) that old browsers ignore. It can be fixed by transforming the CSS at build time (for example, with `postcss-preset-env`).

**Testing without the TV:** download the same Chromium your TV uses and open the site there. For Chromium 69 (revision 576753):

```bash
npx @puppeteer/browsers install chromium@576753 --path C:\tools\chromium69
```

```powershell
& "C:\tools\chromium69\chromium\win64-576753\chrome-win32\chrome.exe" --user-data-dir=C:\temp\profile69 --window-size=1920,1080 "https://your-site/"
```

F12 opens DevTools to see which styles or scripts fail. It is a browser without security updates: use it only to test your own sites.

## Debugging on the TV

With the TV connected through `sdb`, the app can be opened with the Chromium inspector:

```bash
sdb -s <TV_IP>:26101 shell 0 was_kill AlozKiosk0          # close the app if it is open
sdb -s <TV_IP>:26101 shell 0 debug AlozKiosk0.kiosk        # prints "port: NNNNN"
sdb -s <TV_IP>:26101 forward tcp:NNNNN tcp:NNNNN
```

Then open `http://localhost:NNNNN/json` on the PC: it lists the pages and their `webSocketDebuggerUrl` to connect through the DevTools protocol (console, evaluate JavaScript, computed styles). In `iframe` mode the inspector shows the app (`file:///index.html`), and the site runs in a separate execution context inside it; in `redirect`, it shows the site's page. The TV doesn't allow screenshots through this channel.

## Project structure

```
.env.example        configuration template (documented)
.env                your configuration (not versioned)
package.json        scripts: build and package
scripts/build.mjs   reads and validates .env, copies src/ to build/, generates config.js and packages
src/config.xml      Tizen manifest: app id, icon, privileges, TV profile
src/index.html      full-screen container page
src/style.css       container page styles (separate file because of Tizen's CSP)
src/main.js         app logic: screen saver, sound, network, auth, modes and zoom
src/icon.png        Smart Hub icon (PNG 512x423, Samsung's recommended size)
build/              build output and the .wgt (regenerated, not versioned)
```

Privileges declared in `src/config.xml`: `internet`, `tv.inputdevice` (CH+/CH−/0 keys) and `tv.audio` (mute and volume). App ID: `AlozKiosk0.kiosk`.

## Security and best practices

- **The repository is public.** Never commit `.env`, `build/`, `.wgt` files or certificates (`*.p12`); they are already in `.gitignore`. `.env.example` only contains sample values.
- **Credentials are stored in plain text inside the `.wgt`** (`config.js`). Use a dedicated user for the TV, read-only if possible, never a personal account, and don't share the `.wgt`.
- **Back up the Samsung certificate** (`%USERPROFILE%\SamsungCertificate\`) outside the repo.
- **Don't edit `build/`**: it is regenerated on every build. Changes go in `src/`.
- **No inline CSS or JS in `src/index.html`**: Tizen applies a CSP to the app (`style-src 'self'`) that silently blocks inline `<style>` blocks. Styles go in `src/style.css` and code in `src/main.js`.
- **Keep `src/` compatible with old browsers**: the oldest supported is Chromium 47 (Tizen 3.0). Use `var`, plain functions and no modern syntax without testing it.
- **New variables**: document them in `.env.example`, validate them in `scripts/build.mjs` and describe them in this README.

## Limitations

- On consumer TVs, **developer mode may turn itself off** after a while or after a firmware update; you will need to re-enable it and reinstall.
- The app only installs on TVs whose DUID is in the certificate.
- In `redirect` mode there is no zoom, periodic reload or CH+/CH− keys (see [Load modes](#load-modes-redirect-vs-iframe)).
- Sound depends on how the site plays it: with basic auth, `new Audio()` doesn't play on Tizen (see [Sound](#sound)).
- For a permanent commercial deployment, a **Samsung signage display** (commercial line, with MagicInfo / URL Launcher) is a better fit: it does this out of the box without developer mode.

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `Tizen CLI not found` / `'tizen' is not recognized` | Tizen Studio isn't installed or is missing *Web CLI*. See [Installing Tizen Studio](#installing-tizen-studio), or set `TIZEN_HOME`. |
| `Could not find or load main class <part of your path>` | The SDK is in a path with spaces. Install Tizen Studio in `C:\tizen-studio`. |
| `'sdb' is not recognized` | `C:\tizen-studio\tools` isn't in `PATH`; add it or use the full path. |
| `There is no <X> target` | `-t` takes the **device name** shown by `sdb devices`, not the DUID or the IP. |
| `npm run package` doesn't mention `Author certificate` | The `TIZEN_PROFILE` profile doesn't exist. Check with `tizen security-profiles list`. |
| `tizen install` fails with a certificate error | The profile isn't a Samsung one or doesn't include the TV's DUID. |
| `sdb connect` doesn't connect | Developer mode is off, the TV wasn't restarted after enabling it, or the PC IP set on the TV changed. |
| The app doesn't show up on the TV after installing | The package wasn't signed or `-t` was wrong; check the `tizen install` output. |
| Black screen in `iframe` mode | The site doesn't allow being embedded. Use `redirect`. |
| Black screen in any mode | No network: the app waits and loads by itself when it comes back. |
| The login prompt appears | Wrong user or password in `.env`, or the server rejected the initial request. |
| The page loads but plays no sound and doesn't refresh data | Credentials inherited from the URL (see [Basic auth](#basic-auth)) or a site incompatible with the TV's browser (see [Compatibility](#site-compatibility-with-the-tv)). |
| Alerts can't be heard | If the site uses basic auth and `new Audio()`, the TV's player doesn't download the audio: the site must use Web Audio (see [Sound](#sound)). Otherwise press **OK** once (autoplay block) and check `KIOSK_VOLUME`. |
| No margins, no borders or huge elements | The site's CSS is too modern for the TV. See [Compatibility](#site-compatibility-with-the-tv). |
| The page looks too big or too small | `iframe` mode + `KIOSK_ZOOM` or CH+/CH−. There is no zoom in `redirect`. |
| The app shows the generic icon | The TV cached the previous icon: bump `version` in `src/config.xml`, uninstall and install again (see [Updating the app](#updating-the-app)). |
| A `.env` change isn't reflected on the TV | The configuration lives inside the `.wgt`: package and install again. |
