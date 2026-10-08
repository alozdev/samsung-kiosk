import { readFileSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';

const root = join(import.meta.dirname, '..');
const envPath = join(root, '.env');
if (!existsSync(envPath)) {
    console.error('Falta .env (copia .env.example a .env)');
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
    console.error(`KIOSK_URL inválida: ${url}`);
    process.exit(1);
}

const config = {
    url,
    mode: env.KIOSK_MODE === 'iframe' ? 'iframe' : 'redirect',
    reloadMinutes: Number(env.KIOSK_RELOAD_MINUTES) || 0,
    user: env.KIOSK_USER || '',
    password: env.KIOSK_PASSWORD || '',
};

const buildDir = join(root, 'build');
rmSync(buildDir, { recursive: true, force: true });
cpSync(join(root, 'src'), buildDir, { recursive: true });
writeFileSync(join(buildDir, 'config.js'), `window.KIOSK_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log('build/ generado:', { ...config, password: config.password ? '***' : '' });

if (process.argv.includes('--package')) {
    const profile = env.TIZEN_PROFILE || 'kiosk';
    const tizen = findTizen(env.TIZEN_HOME);
    if (!tizen) {
        console.error(
            '\nNo se encontró el CLI de Tizen. Instala Tizen Studio (con TV Extensions) y luego:\n' +
            '  - agrega <tizen-studio>\\tools\\ide\\bin al PATH, o\n' +
            '  - define TIZEN_HOME=<ruta de tizen-studio> en el .env'
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
        // SDK instalado por la extensión Tizen de VS Code
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
