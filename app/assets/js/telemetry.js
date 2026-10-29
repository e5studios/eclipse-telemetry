/**
 * Eclipse Launcher - Recoleccion de informacion de rendimiento.
 *
 * Envia un perfil tecnico del equipo al endpoint configurado en
 * `telemetry-config.json`. El detalle de los campos y su uso esta
 * documentado en `docs/RECOLECCION_DE_DATOS.md`.
 *
 * Reglas de diseno:
 *  - Solo se recogen los campos declarados en el acuerdo de instalacion:
 *    usuario del equipo, CPU, GPU, RAM y sistema operativo.
 *  - Nunca se envian contrasenas, tokens, archivos ni rutas personales.
 *  - El envio se hace como maximo una vez cada `intervalHours` horas.
 *  - Si el envio falla, el perfil queda en una cola local y se reintenta
 *    en el siguiente arranque.
 */

const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')
const os     = require('os')
const http   = require('http')
const https  = require('https')
const { execFile } = require('child_process')

const SCHEMA_VERSION = 1
const STATE_FILE = 'telemetry.json'

let statePath = null
let log = (...args) => console.log('[Telemetry]', ...args)

/**
 * Carga la configuracion empaquetada con el launcher.
 *
 * @returns {{enabled: boolean, endpoint: string, intervalHours: number, timeoutMs: number}}
 */
function loadConfig(){
    const defaults = {
        enabled: true,
        endpoint: '',
        sharedKey: '',
        intervalHours: 24,
        timeoutMs: 8000
    }

    try {
        const raw = fs.readFileSync(path.join(__dirname, 'telemetry-config.json'), 'utf8').replace(/^\uFEFF/, '')
        const parsed = JSON.parse(raw)

        return {
            enabled: parsed.enabled !== false,
            endpoint: typeof parsed.endpoint === 'string' ? parsed.endpoint.trim() : '',
            sharedKey: typeof parsed.sharedKey === 'string' ? parsed.sharedKey.trim() : '',
            intervalHours: Number.isFinite(parsed.intervalHours) ? parsed.intervalHours : defaults.intervalHours,
            timeoutMs: Number.isFinite(parsed.timeoutMs) ? parsed.timeoutMs : defaults.timeoutMs
        }
    } catch(err){
        log('No se pudo leer telemetry-config.json, se usa la configuracion por defecto:', err.message)
        return defaults
    }
}

/**
 * Lee el estado local. Si no existe, lo crea con un identificador de
 * instalacion aleatorio (no derivado del hardware).
 *
 * @returns {object}
 */
function loadState(){
    try {
        const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'))

        return {
            enabled: parsed.enabled !== false,
            installId: typeof parsed.installId === 'string' ? parsed.installId : crypto.randomUUID(),
            firstSeen: typeof parsed.firstSeen === 'string' ? parsed.firstSeen : new Date().toISOString(),
            lastSentAt: typeof parsed.lastSentAt === 'string' ? parsed.lastSentAt : null,
            pending: Array.isArray(parsed.pending) ? parsed.pending : [],
            lastPayload: parsed.lastPayload || null
        }
    } catch(err){
        return {
            enabled: true,
            installId: crypto.randomUUID(),
            firstSeen: new Date().toISOString(),
            lastSentAt: null,
            pending: [],
            lastPayload: null
        }
    }
}

function saveState(state){
    try {
        fs.mkdirSync(path.dirname(statePath), { recursive: true })
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
    } catch(err){
        log('No se pudo guardar el estado local:', err.message)
    }
}

function run(command, args, timeout){
    return new Promise((resolve) => {
        execFile(command, args, {
            timeout: timeout,
            windowsHide: true,
            maxBuffer: 1024 * 256
        }, (err, stdout) => {
            if(err){
                resolve('')
                return
            }

            resolve(String(stdout || '').trim())
        })
    })
}

/**
 * Detecta el nombre de la GPU sin depender de paquetes externos.
 *
 * @param {number} timeout Milisegundos maximos de espera.
 * @returns {Promise<string>}
 */
async function detectGpu(timeout){
    try {
        if(process.platform === 'win32'){
            const ps = await run('powershell.exe', [
                '-NoProfile',
                '-NonInteractive',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                "Get-CimInstance Win32_VideoController | Where-Object { $_.Name -notmatch 'Basic|Remote|Parsec|Virtual' } | Select-Object -First 1 -ExpandProperty Name"
            ], timeout)

            if(ps.length > 0){
                return ps.split(/\r?\n/)[0].trim()
            }

            const wmic = await run('wmic', [
                'path',
                'win32_VideoController',
                'get',
                'name'
            ], timeout)

            const lines = wmic.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
            if(lines.length > 1){
                return lines[1]
            }
        } else if(process.platform === 'darwin'){
            const out = await run('system_profiler', ['SPDisplaysDataType'], timeout)
            const match = out.match(/Chipset Model:\s*(.+)/)

            if(match){
                return match[1].trim()
            }
        } else {
            const out = await run('sh', ['-c', "lspci 2>/dev/null | grep -i -E 'vga|3d|display' | head -n 1"], timeout)

            if(out.length > 0){
                return out.replace(/^.*?:\s*/, '').trim()
            }
        }
    } catch(err){
        log('No se pudo detectar la GPU:', err.message)
    }

    return 'Desconocida'
}

function roundGb(bytes){
    return Math.round((bytes / 1073741824) * 10) / 10
}

/**
 * Construye el perfil tecnico del equipo.
 *
 * @param {import('electron').App} app
 * @param {object} state
 * @returns {Promise<object>}
 */
async function collectProfile(app, state){
    const cpus = os.cpus()
    const firstCpu = cpus.length > 0 ? cpus[0] : null
    const gpu = await detectGpu(5000)
    let username = 'Desconocido'

    try {
        username = os.userInfo().username
    } catch(err){
        log('No se pudo leer el nombre de usuario del equipo:', err.message)
    }

    return {
        schema: SCHEMA_VERSION,
        installId: state.installId,
        collectedAt: new Date().toISOString(),
        launcher: {
            version: app.getVersion(),
            stage: 'BETA'
        },
        username: username,
        cpu: {
            model: firstCpu ? firstCpu.model.trim() : 'Desconocida',
            cores: cpus.length
        },
        gpu: gpu,
        ramGb: roundGb(os.totalmem()),
        os: {
            platform: process.platform,
            name: os.type(),
            release: os.release(),
            arch: process.arch
        }
    }
}

/**
 * POST JSON sin dependencias externas.
 *
 * @param {string} endpoint
 * @param {object} payload
 * @param {number} timeoutMs
 * @returns {Promise<{ok: boolean, status: number}>}
 */
function postJson(endpoint, payload, timeoutMs, sharedKey){
    return new Promise((resolve) => {
        let url

        try {
            url = new URL(endpoint)
        } catch(err){
            resolve({ ok: false, status: 0 })
            return
        }

        const body = Buffer.from(JSON.stringify(payload), 'utf8')
        const transport = url.protocol === 'http:' ? http : https

        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': body.length,
            'User-Agent': `EclipseLauncher/${payload.launcher.version}`
        }

        if(typeof sharedKey === 'string' && sharedKey.length > 0){
            headers['X-Eclipse-Key'] = sharedKey
        }

        const req = transport.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (url.protocol === 'http:' ? 80 : 443),
            path: `${url.pathname}${url.search}`,
            method: 'POST',
            headers: headers,
            timeout: timeoutMs
        }, (res) => {
            res.resume()
            res.on('end', () => {
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode })
            })
        })

        req.on('timeout', () => {
            req.destroy()
            resolve({ ok: false, status: 0 })
        })

        req.on('error', () => {
            resolve({ ok: false, status: 0 })
        })

        req.write(body)
        req.end()
    })
}

/**
 * Reintenta los envios pendientes de sesiones anteriores.
 *
 * @param {object} state
 * @param {object} config
 * @returns {Promise<number>} Cantidad de envios exitosos.
 */
async function flushPending(state, config){
    if(state.pending.length === 0){
        return 0
    }

    const remaining = []
    let sent = 0

    for(const payload of state.pending.slice(0, 25)){
        const result = await postJson(config.endpoint, payload, config.timeoutMs, config.sharedKey)

        if(result.ok){
            sent++
        } else {
            remaining.push(payload)
        }
    }

    state.pending = remaining.concat(state.pending.slice(25))
    saveState(state)

    return sent
}

function hoursSince(isoDate){
    if(isoDate == null){
        return Number.POSITIVE_INFINITY
    }

    const then = Date.parse(isoDate)

    if(Number.isNaN(then)){
        return Number.POSITIVE_INFINITY
    }

    return (Date.now() - then) / 3600000
}

/**
 * Punto de entrada. Se llama una vez que Electron esta listo.
 *
 * @param {import('electron').App} app
 */
async function start(app){
    const config = loadConfig()

    if(!config.enabled){
        log('Recoleccion deshabilitada por configuracion.')
        return
    }

    statePath = path.join(app.getPath('userData'), STATE_FILE)

    const state = loadState()
    saveState(state)

    if(state.enabled === false){
        log('Recoleccion deshabilitada por el usuario (telemetry.json).')
        return
    }

    if(config.endpoint.length === 0){
        log('Endpoint no configurado. Se omite el envio (revisa telemetry-config.json).')
        return
    }

    try {
        if(await flushPending(state, config) > 0){
            state.lastSentAt = new Date().toISOString()
            saveState(state)
        }

        if(hoursSince(state.lastSentAt) < config.intervalHours){
            log('Envio omitido: ya se envio un perfil recientemente.')
            return
        }

        const profile = await collectProfile(app, state)
        state.lastPayload = profile
        saveState(state)

        const result = await postJson(config.endpoint, profile, config.timeoutMs, config.sharedKey)

        if(result.ok){
            state.lastSentAt = new Date().toISOString()
            log('Perfil enviado correctamente.')
        } else {
            state.pending.push(profile)
            log(`No se pudo enviar el perfil (status ${result.status}). Queda en cola para el proximo arranque.`)
        }

        saveState(state)
    } catch(err){
        log('Error inesperado durante la recoleccion:', err.message)
    }
}

module.exports = { start }
