/**
 * Eclipse Launcher - receptor HTTPS de telemetria.
 *
 * Desplegar como Cloudflare Worker (plan gratuito sirve).
 *
 * Variables de entorno del Worker:
 *   GITHUB_TOKEN         Token fine-grained con permiso "Contents: Read and write"
 *                        SOLO sobre el repositorio del launcher. Nunca se
 *                        incluye dentro del .exe.
 *   SHARED_KEY           Clave larga y aleatoria. Debe coincidir con
 *                        "sharedKey" de app/assets/js/telemetry-config.json.
 *   GITHUB_REPO          e5studios/EclipseLauncher
 *   GITHUB_BRANCH        main
 *   GITHUB_PATH          docs/dispositivos.md
 *   PUBLIC_RAW_USERNAME  "true" para publicar el nombre de usuario tal cual.
 *                        Por defecto se publica como "Usuario-xxxxxx".
 *
 * El Worker valida, ordena y agrega un renglon en el documento publico.
 * No guarda los datos en ningun otro lugar.
 */

const DEFAULT_REPO = 'e5studios/EclipseLauncher'
const DEFAULT_BRANCH = 'main'
const DEFAULT_PATH = 'docs/dispositivos.md'
const FIN_MARKER = '<!-- FIN_DATOS -->'

const EMPTY_DOC = `# Información recopilada de los equipos

Reporte técnico generado por **Eclipse Launcher**.

| Fecha (UTC) | Equipo | Sistema operativo | CPU | GPU | RAM | Launcher | ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
${FIN_MARKER}
`

export default {
    async fetch(request, env){
        if(request.method !== 'POST'){
            return json({ ok: false, error: 'method_not_allowed' }, 405)
        }

        if(!env.SHARED_KEY || request.headers.get('x-eclipse-key') !== env.SHARED_KEY){
            return json({ ok: false, error: 'unauthorized' }, 401)
        }

        let payload

        try {
            payload = await request.json()
        } catch(err){
            return json({ ok: false, error: 'invalid_json' }, 400)
        }

        const invalid = validate(payload)

        if(invalid != null){
            return json({ ok: false, error: invalid }, 400)
        }

        try {
            const row = formatRow(payload, env)
            await appendRow(env, payload, row)

            return json({ ok: true }, 200)
        } catch(err){
            console.error('No se pudo publicar el reporte:', err)

            return json({ ok: false, error: 'publish_failed' }, 502)
        }
    }
}

function json(body, status){
    return new Response(JSON.stringify(body), {
        status: status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
    })
}

function cell(value, max){
    return String(value == null ? '' : value)
        .replace(/\|/g, '/')
        .replace(/[\r\n]+/g, ' ')
        .trim()
        .slice(0, max || 80)
}

function isText(value, max){
    return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

/**
 * Devuelve un mensaje de error o null si el payload es valido.
 */
function validate(data){
    if(data == null || typeof data !== 'object'){
        return 'invalid_payload'
    }

    if(!isText(data.installId, 64)) return 'invalid_install_id'
    if(!isText(data.username, 128)) return 'invalid_username'
    if(!isText(data.gpu, 160)) return 'invalid_gpu'
    if(data.cpu == null || !isText(data.cpu.model, 160)) return 'invalid_cpu'
    if(data.os == null || !isText(data.os.name, 64) || !isText(data.os.release, 64)) return 'invalid_os'
    if(typeof data.ramGb !== 'number' || data.ramGb <= 0 || data.ramGb > 4096) return 'invalid_ram'
    if(data.launcher == null || !isText(data.launcher.version, 32)) return 'invalid_launcher'

    return null
}

function displayUser(data, env){
    if(env.PUBLIC_RAW_USERNAME === 'true'){
        return cell(data.username, 40)
    }

    const id = String(data.installId).replace(/[^a-f0-9]/gi, '').toLowerCase().slice(0, 6) || '000000'

    return `Usuario-${id}`
}

function formatRow(data, env){
    const date = new Date(data.collectedAt)
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
    const stamp = safeDate.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'

    const os = `${cell(data.os.name, 32)} ${cell(data.os.release, 32)} (${cell(data.os.arch, 16)})`
    const launcher = `${cell(data.launcher.stage, 16)} ${cell(data.launcher.version, 24)}`.trim()
    const ram = `${Number(data.ramGb).toFixed(1)} GB`
    const id = cell(data.installId, 64).slice(0, 8)

    return `| ${stamp} | ${displayUser(data, env)} | ${os} | ${cell(data.cpu.model, 90)} | ${cell(data.gpu, 90)} | ${ram} | ${launcher} | ${id} |`
}

async function github(env, path, init){
    const options = init || {}

    const response = await fetch(`https://api.github.com${path}`, {
        method: options.method || 'GET',
        body: options.body,
        headers: {
            'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'EclipseLauncher-Telemetry',
            'Content-Type': 'application/json'
        }
    })

    return response
}

async function readDocument(env){
    const repo = env.GITHUB_REPO || DEFAULT_REPO
    const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH
    const filePath = env.GITHUB_PATH || DEFAULT_PATH

    const response = await github(env, `/repos/${repo}/contents/${filePath}?ref=${encodeURIComponent(branch)}`)

    if(response.status === 404){
        return { content: EMPTY_DOC, sha: null }
    }

    if(!response.ok){
        throw new Error(`GitHub GET ${response.status}`)
    }

    const data = await response.json()

    return {
        content: decodeBase64(data.content || ''),
        sha: data.sha
    }
}

async function appendRow(env, payload, row){
    const repo = env.GITHUB_REPO || DEFAULT_REPO
    const branch = env.GITHUB_BRANCH || DEFAULT_BRANCH
    const filePath = env.GITHUB_PATH || DEFAULT_PATH

    for(let attempt = 0; attempt < 3; attempt++){
        const current = await readDocument(env)
        const lines = current.content.replace(/\r\n/g, '\n').split('\n')
        const day = new Date(payload.collectedAt).toISOString().slice(0, 10)
        const installId = String(payload.installId)

        // Evita duplicados del mismo equipo en el mismo dia.
        const duplicated = lines.slice(-400).some(line =>
            line.includes(installId.slice(0, 8)) && line.includes(day)
        )

        if(duplicated){
            return
        }

        const index = lines.lastIndexOf(FIN_MARKER)
        const updated = index >= 0
            ? [...lines.slice(0, index), row, ...lines.slice(index)].join('\n')
            : `${current.replace(/\s*$/, '')}\n${row}\n`

        const body = {
            message: `telemetria: nuevo reporte (${installId.slice(0, 8)})`,
            content: encodeBase64(updated),
            branch: branch
        }

        if(current.sha != null){
            body.sha = current.sha
        }

        const response = await github(env, `/repos/${repo}/contents/${filePath}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        })

        if(response.ok){
            return
        }

        if(response.status !== 409 && response.status !== 422){
            throw new Error(`GitHub PUT ${response.status}`)
        }
    }

    throw new Error('No se pudo actualizar el documento tras 3 intentos')
}

function decodeBase64(value){
    const clean = String(value).replace(/\s/g, '')
    const binary = atob(clean)
    const bytes = new Uint8Array(binary.length)

    for(let i = 0; i < binary.length; i++){
        bytes[i] = binary.charCodeAt(i)
    }

    return new TextDecoder().decode(bytes)
}

function encodeBase64(value){
    const bytes = new TextEncoder().encode(value)
    let binary = ''

    for(let i = 0; i < bytes.length; i++){
        binary += String.fromCharCode(bytes[i])
    }

    return btoa(binary)
}
