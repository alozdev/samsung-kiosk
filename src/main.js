(function () {
    var cfg = window.KIOSK_CONFIG;
    var ZOOM_KEY = 'kiosk-zoom';
    var ZOOM_STEP = 0.1;
    var panel = null;

    // Disable the TV's screen saver
    try {
        webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (e) {}

    // Turn sound on: the page may play alerts and the TV could be muted
    try {
        tizen.tvaudiocontrol.setMute(false);
        if (cfg.volume !== null) {
            tizen.tvaudiocontrol.setVolume(cfg.volume);
        }
    } catch (e) {}

    // URL with embedded credentials (https://user:pass@host/...). Last resort only:
    // the page inherits those credentials in its relative paths (audio, fetch, images)
    // and Chromium blocks any subresource request with credentials in the URL.
    function urlWithCredentials() {
        var u = new URL(cfg.url);
        u.username = encodeURIComponent(cfg.user);
        u.password = encodeURIComponent(cfg.password);
        return u.href;
    }

    // Makes an authenticated request so the webview stores the credentials in its
    // auth cache; the page then loads without asking for a login.
    // done(true) if the server accepted the credentials.
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

    // Automatic zoom: the app always renders at a fixed width (usually 1920), even if
    // the panel has another resolution. The page is scaled to look as it would on a
    // monitor with the TV's actual physical resolution.
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

    // The zoom adjusted with the remote is saved together with the .env KIOSK_ZOOM it was
    // adjusted from: if .env changes later, the old adjustment is dropped and .env wins.
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

    // Next multiple of ZOOM_STEP up or down (1.15 -> 1.2 / 1.1),
    // so the zoom always lands on 100 %, 110 %, 120 %...
    function stepZoom(zoom, direction) {
        var steps = zoom / ZOOM_STEP;
        var next = direction > 0 ? Math.floor(steps + 1e-6) + 1 : Math.ceil(steps - 1e-6) - 1;
        return Math.max(0.3, Math.round(next * ZOOM_STEP * 100) / 100);
    }

    // Scales the whole iframe: its box is enlarged/shrunk and then scale() is applied
    // so it covers exactly the screen.
    function applyZoom(frame, zoom) {
        frame.style.width = (100 / zoom) + 'vw';
        frame.style.height = (100 / zoom) + 'vh';
        frame.style.webkitTransform = 'scale(' + zoom + ')';
        frame.style.transform = 'scale(' + zoom + ')';
    }

    // Diagnostic text: zoom, app viewport, physical panel and actual iframe size
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

    // Remote control: CH+ / CH- adjust the zoom, 0 returns to the .env value
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
        // Chromium blocks user:pass@ in iframes, so here we rely on preauth
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
            // With the credentials already cached, navigate to the clean URL
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

    // If the TV starts without network, wait for it before loading
    if (navigator.onLine) {
        start();
    } else {
        window.addEventListener('online', start, { once: true });
    }
})();
