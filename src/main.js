(function () {
    var cfg = window.KIOSK_CONFIG;
    var ZOOM_KEY = 'kiosk-zoom';
    var ZOOM_STEP = 0.1;
    var panel = null;

    // Desactivar el protector de pantalla de la TV
    try {
        webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (e) {}

    // Activar el sonido: la página reproduce alertas y la TV podría estar en silencio
    try {
        tizen.tvaudiocontrol.setMute(false);
        if (cfg.volume !== null) {
            tizen.tvaudiocontrol.setVolume(cfg.volume);
        }
    } catch (e) {}

    // URL con credenciales embebidas (https://user:pass@host/...). Solo como último recurso:
    // la página hereda esas credenciales en sus rutas relativas (audio, fetch, imágenes)
    // y Chromium bloquea cualquier petición secundaria con credenciales en la URL.
    function urlWithCredentials() {
        var u = new URL(cfg.url);
        u.username = encodeURIComponent(cfg.user);
        u.password = encodeURIComponent(cfg.password);
        return u.href;
    }

    // Hace una petición autenticada para que el webview guarde las credenciales
    // en su caché de auth; la carga posterior de la página ya no pide login.
    // done(true) si el servidor aceptó las credenciales.
    function preauth(done) {
        var finished = false;
        var xhr = new XMLHttpRequest();
        function finish() {
            if (!finished) { finished = true; done(xhr.status >= 200 && xhr.status < 400); }
        }
        xhr.open('GET', cfg.url, true, cfg.user, cfg.password);
        xhr.withCredentials = true;
        xhr.onloadend = finish;
        setTimeout(finish, 10000);
        xhr.send();
    }

    // Zoom automático: la app siempre se dibuja a un ancho fijo (normalmente 1920),
    // aunque el panel sea de otra resolución. Se escala para que la página se vea
    // como en un monitor con la resolución física real de la TV.
    function autoZoom(done) {
        try {
            tizen.systeminfo.getPropertyValue('DISPLAY', function (display) {
                panel = display.resolutionWidth + 'x' + display.resolutionHeight;
                done(display.resolutionWidth > 0 ? window.innerWidth / display.resolutionWidth : 1);
            }, function () { done(1); });
        } catch (e) {
            done(1);
        }
    }

    // El zoom ajustado con el control se guarda junto con el KIOSK_ZOOM del .env con el
    // que se ajustó: si después cambia el .env, el ajuste viejo se descarta y manda el .env.
    function savedZoom() {
        try {
            var saved = JSON.parse(localStorage.getItem(ZOOM_KEY));
            return saved && saved.base === cfg.zoom && saved.zoom > 0 ? saved.zoom : null;
        } catch (e) {
            return null;
        }
    }

    function saveZoom(zoom) {
        try {
            if (zoom) {
                localStorage.setItem(ZOOM_KEY, JSON.stringify({ base: cfg.zoom, zoom: zoom }));
            } else {
                localStorage.removeItem(ZOOM_KEY);
            }
        } catch (e) {}
    }

    // Siguiente múltiplo de ZOOM_STEP hacia arriba o abajo (1.15 -> 1.2 / 1.1),
    // para que el zoom siempre quede en 100 %, 110 %, 120 %...
    function stepZoom(zoom, direction) {
        var steps = zoom / ZOOM_STEP;
        var next = direction > 0 ? Math.floor(steps + 1e-6) + 1 : Math.ceil(steps - 1e-6) - 1;
        return Math.max(0.3, Math.round(next * ZOOM_STEP * 100) / 100);
    }

    // Se escala el iframe completo: se agranda/achica su área y luego se aplica scale()
    // para que ocupe exactamente la pantalla.
    function applyZoom(frame, zoom) {
        frame.style.width = (100 / zoom) + 'vw';
        frame.style.height = (100 / zoom) + 'vh';
        frame.style.webkitTransform = 'scale(' + zoom + ')';
        frame.style.transform = 'scale(' + zoom + ')';
    }

    // Texto de diagnóstico: zoom, viewport de la app, panel físico y tamaño real del iframe
    function zoomInfo(frame, zoom) {
        var rect = frame.getBoundingClientRect();
        return 'Zoom ' + Math.round(zoom * 100) + '%' +
            ' | app ' + window.innerWidth + 'x' + window.innerHeight +
            ' | panel ' + (panel || '?') +
            ' | iframe ' + frame.offsetWidth + ' -> ' + Math.round(rect.width) + 'px';
    }

    var toastTimer;
    function toast(text, ms) {
        var el = document.getElementById('toast');
        el.textContent = text;
        el.style.display = 'block';
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.style.display = 'none'; }, ms || 2000);
    }

    // Control remoto: CH+ / CH- ajustan el zoom, 0 vuelve al valor del .env
    function bindRemote(frame, initialZoom) {
        var keys = { ChannelUp: 1, ChannelDown: -1, '0': 0 };
        var codes = {};
        Object.keys(keys).forEach(function (name) {
            try {
                tizen.tvinputdevice.registerKey(name);
                codes[tizen.tvinputdevice.getKey(name).code] = keys[name];
            } catch (e) {}
        });

        var zoom = savedZoom() || initialZoom;
        applyZoom(frame, zoom);
        toast(zoomInfo(frame, zoom), 6000);

        document.addEventListener('keydown', function (e) {
            if (!(e.keyCode in codes)) return;
            var step = codes[e.keyCode];
            if (step === 0) {
                zoom = initialZoom;
                saveZoom(null);
            } else {
                zoom = stepZoom(zoom, step);
                saveZoom(zoom);
            }
            applyZoom(frame, zoom);
            toast(zoomInfo(frame, zoom), 4000);
        });
    }

    function loadIframe() {
        // Chromium bloquea user:pass@ en iframes, así que aquí dependemos del preauth
        var frame = document.createElement('iframe');
        frame.src = cfg.url;
        frame.setAttribute('allow', 'autoplay; fullscreen');
        frame.setAttribute('tabindex', '-1');
        document.body.appendChild(frame);

        if (cfg.zoom === 'auto') {
            autoZoom(function (zoom) { bindRemote(frame, zoom); });
        } else {
            bindRemote(frame, cfg.zoom);
        }

        if (cfg.reloadMinutes > 0) {
            setInterval(function () { frame.src = cfg.url; }, cfg.reloadMinutes * 60000);
        }
    }

    function load(authCached) {
        if (cfg.mode === 'iframe') {
            loadIframe();
        } else {
            // Con las credenciales ya en caché se navega a la URL limpia
            window.location.replace(cfg.user && !authCached ? urlWithCredentials() : cfg.url);
        }
    }

    function start() {
        if (cfg.user) {
            preauth(load);
        } else {
            load();
        }
    }

    // Si la TV arranca sin red, esperar a tenerla antes de cargar
    if (navigator.onLine) {
        start();
    } else {
        window.addEventListener('online', start, { once: true });
    }
})();
