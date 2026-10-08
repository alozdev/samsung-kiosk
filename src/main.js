(function () {
    var cfg = window.KIOSK_CONFIG;

    // Desactivar el protector de pantalla de la TV
    try {
        webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (e) {}

    // URL con credenciales embebidas (https://user:pass@host/...), solo para navegación directa
    function urlWithCredentials() {
        var u = new URL(cfg.url);
        u.username = encodeURIComponent(cfg.user);
        u.password = encodeURIComponent(cfg.password);
        return u.href;
    }

    // Hace una petición autenticada para que el webview guarde las credenciales
    // en su caché de auth; la carga posterior de la página ya no pide login.
    function preauth(done) {
        var finished = false;
        function finish() {
            if (!finished) { finished = true; done(); }
        }
        var xhr = new XMLHttpRequest();
        xhr.open('GET', cfg.url, true, cfg.user, cfg.password);
        xhr.withCredentials = true;
        xhr.onloadend = finish;
        setTimeout(finish, 10000);
        xhr.send();
    }

    function load() {
        if (cfg.mode === 'iframe') {
            // Chromium bloquea user:pass@ en iframes, así que aquí dependemos del preauth
            var frame = document.createElement('iframe');
            frame.src = cfg.url;
            frame.setAttribute('allow', 'autoplay; fullscreen');
            document.body.appendChild(frame);
            if (cfg.reloadMinutes > 0) {
                setInterval(function () { frame.src = cfg.url; }, cfg.reloadMinutes * 60000);
            }
        } else {
            window.location.replace(cfg.user ? urlWithCredentials() : cfg.url);
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
