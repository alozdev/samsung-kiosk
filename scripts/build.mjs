import { readFileSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const root = join(import.meta.dirname, '..');
const envPath = join(root, '.env');
if (!existsSync(envPath)) {
    console.error('Missing .env (copy .env.example to .env)');
    process.exit(1);
}

const env = Object.fromEntries(
    readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith('#'))
        .map((line) => {
            const i = line.indexOf('=');
            return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
        })
);

const url = env.KIOSK_URL;
try {
    new URL(url);
} catch {
    console.error(`Invalid KIOSK_URL: ${url}`);
    process.exit(1);
}

const config = {
    url,
    mode: env.KIOSK_MODE === 'iframe' ? 'iframe' : 'redirect',
    reloadMinutes: Number(env.KIOSK_RELOAD_MINUTES) || 0,
    user: env.KIOSK_USER || '',
    password: env.KIOSK_PASSWORD || '',
    zoom: parseZoom(env.KIOSK_ZOOM),
    volume: parseVolume(env.KIOSK_VOLUME),
};

function parseVolume(value) {
    if (!value) return null;
    const volume = Number(value);
    if (!Number.isInteger(volume) || volume < 0 || volume > 100) {
        console.error(`Invalid KIOSK_VOLUME: ${value} (use an integer from 0 to 100, or leave it empty)`);
        process.exit(1);
    }
    return volume;
}

function parseZoom(value) {
    if (!value) return 1;
    if (value === 'auto') return 'auto';
    const zoom = Number(value);
    if (!(zoom > 0)) {
        console.error(`Invalid KIOSK_ZOOM: ${value} (use "auto" or a number, e.g. 1.25)`);
        process.exit(1);
    }
    return zoom;
}

if (config.mode === 'redirect' && config.zoom !== 'auto' && config.zoom !== 1) {
    console.warn('Warning: KIOSK_ZOOM only works with KIOSK_MODE=iframe; it is ignored in redirect mode.');
}

const buildDir = join(root, 'build');
rmSync(buildDir, { recursive: true, force: true });
cpSync(join(root, 'src'), buildDir, { recursive: true });
writeFileSync(join(buildDir, 'config.js'), `window.KIOSK_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log('build/ generated:', { ...config, password: config.password ? '***' : '' });

if (process.argv.includes('--package')) {
    const profile = env.TIZEN_PROFILE || 'kiosk';
    const tizen = findTizen(env.TIZEN_HOME);
    if (!tizen) {
        console.error(
            '\nTizen CLI not found. Install Tizen Studio (with TV Extensions) and then:\n' +
            '  - add <tizen-studio>\\tools\\ide\\bin to PATH, or\n' +
            '  - set TIZEN_HOME=<tizen-studio path> in .env'
        );
        process.exit(1);
    }
    try {
        execSync(`"${tizen}" package -t wgt -s ${profile} -- "${buildDir}"`, { stdio: 'inherit' });
    } catch {
        process.exit(1);
    }
}

function findTizen(tizenHome) {
    const exe = process.platform === 'win32' ? 'tizen.bat' : 'tizen';
    const homes = [
        tizenHome,
        'C:\\tizen-studio',
        join(homedir(), 'tizen-studio'),
        // SDK installed by the Tizen extension for VS Code
        join(homedir(), '.tizen-extension-platform', 'server', 'sdktools', 'data'),
    ].filter(Boolean);
    for (const home of homes) {
        const candidate = join(home, 'tools', 'ide', 'bin', exe);
        if (existsSync(candidate)) return candidate;
    }
    try {
        execSync(process.platform === 'win32' ? 'where tizen' : 'command -v tizen', { stdio: 'ignore' });
        return 'tizen';
    } catch {
        return null;
    }
}
