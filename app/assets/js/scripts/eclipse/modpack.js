/**
 * =====================================================
 * Eclipse Launcher - Modpack Manager
 * Developed by E5 Studios
 * =====================================================
 *
 * Installs the selected project directly inside the same
 * instance directory used by ProcessBuilder and Helios Core.
 */

const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')
const ConfigManager = require('../../configmanager')

const PROJECT_ID = 'Abystale-1.20.1'
const PROJECT_NAME = 'Abystale'

// Versión utilizada solamente mientras conectamos project.json con landing.js.
const DEFAULT_PROJECT_VERSION = '1.0.0'

// Directorios reales utilizados por Eclipse Launcher.
const LAUNCHER_FOLDER = ConfigManager.getDataDirectory()
const DOWNLOAD_FOLDER = path.join(LAUNCHER_FOLDER, 'downloads')
const MODPACK_FOLDER = path.join(
    ConfigManager.getInstanceDirectory(),
    PROJECT_ID
)

// Nombre genérico para cualquier versión descargada.
const ZIP_FILE = path.join(DOWNLOAD_FOLDER, 'Abystale-update.zip')

const INSTALL_MARKER = path.join(
    MODPACK_FOLDER,
    'eclipse-installation.json'
)

// Instalación utilizada por versiones antiguas del launcher.
const LEGACY_LAUNCHER_FOLDER = path.join(
    process.env.APPDATA,
    'E5 Studios',
    'Eclipse Launcher'
)

const LEGACY_MODPACK_FOLDER = path.join(
    LEGACY_LAUNCHER_FOLDER,
    'instances',
    PROJECT_ID
)

const LEGACY_INSTALL_MARKER = path.join(
    LEGACY_MODPACK_FOLDER,
    'eclipse-installation.json'
)

function samePath(a, b){
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
}

function copyDirectoryContents(source, destination){
    fs.mkdirSync(destination, { recursive: true })

    for(const entry of fs.readdirSync(source, { withFileTypes: true })){
        const sourcePath = path.join(source, entry.name)
        const destinationPath = path.join(destination, entry.name)

        if(entry.isDirectory()){
            copyDirectoryContents(sourcePath, destinationPath)
        } else {
            fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
            fs.copyFileSync(sourcePath, destinationPath)
        }
    }
}

/**
 * Migra una instalación creada por versiones antiguas del launcher.
 */
function migrateLegacyInstallation(){
    if(samePath(LEGACY_MODPACK_FOLDER, MODPACK_FOLDER)){
        return
    }

    if(!fs.existsSync(LEGACY_INSTALL_MARKER)){
        return
    }

    copyDirectoryContents(
        LEGACY_MODPACK_FOLDER,
        MODPACK_FOLDER
    )

    const migratedMarker = fs.existsSync(INSTALL_MARKER)
    const migratedMods = fs.existsSync(
        path.join(MODPACK_FOLDER, 'mods')
    )

    if(migratedMarker && migratedMods){
        fs.rmSync(
            LEGACY_MODPACK_FOLDER,
            {
                recursive: true,
                force: true
            }
        )
    }
}

/**
 * Comprueba si Abystale está instalado.
 */
function isModpackInstalled(){
    migrateLegacyInstallation()

    return fs.existsSync(INSTALL_MARKER)
        && fs.existsSync(path.join(MODPACK_FOLDER, 'mods'))
}

/**
 * Lee toda la información de eclipse-installation.json.
 *
 * @returns {Object|null}
 */
function getInstallationInfo(){
    migrateLegacyInstallation()

    if(!fs.existsSync(INSTALL_MARKER)){
        return null
    }

    try {
        const content = fs.readFileSync(
            INSTALL_MARKER,
            'utf8'
        )

        const installationInfo = JSON.parse(content)

        if(
            installationInfo == null
            || typeof installationInfo !== 'object'
        ){
            return null
        }

        return installationInfo
    } catch(err){
        console.error(
            'No se pudo leer eclipse-installation.json.',
            err
        )

        return null
    }
}

/**
 * Obtiene la versión instalada actualmente.
 *
 * @returns {string|null}
 */
function getInstalledVersion(){
    const installationInfo = getInstallationInfo()

    if(
        installationInfo == null
        || typeof installationInfo.version !== 'string'
        || installationInfo.version.trim().length === 0
    ){
        return null
    }

    return installationInfo.version.trim()
}

/**
 * Guarda la información de la instalación.
 *
 * @param {string} version Versión instalada.
 */
function writeInstallationMarker(version){
    if(
        typeof version !== 'string'
        || version.trim().length === 0
    ){
        throw new Error(
            'No se recibió una versión válida para registrar la instalación.'
        )
    }

    fs.mkdirSync(MODPACK_FOLDER, { recursive: true })

    fs.writeFileSync(
        INSTALL_MARKER,
        JSON.stringify(
            {
                projectId: PROJECT_ID,
                project: PROJECT_NAME,
                version: version.trim(),
                installedAt: new Date().toISOString(),
                instanceDirectory: MODPACK_FOLDER
            },
            null,
            2
        ),
        'utf8'
    )
}

/**
 * Instala el ZIP descargado.
 *
 * Cuando conectemos project.json, landing.js enviará aquí
 * projectInfo.latestVersion.
 *
 * @param {string} version Versión que se está instalando.
 */
function installModpackFromZip(version = DEFAULT_PROJECT_VERSION){
    if(!fs.existsSync(ZIP_FILE)){
        throw new Error(
            'No se encontró el archivo ZIP descargado de Abystale.'
        )
    }

    fs.mkdirSync(DOWNLOAD_FOLDER, { recursive: true })
    fs.mkdirSync(MODPACK_FOLDER, { recursive: true })

    const zip = new AdmZip(ZIP_FILE)
    const entries = zip.getEntries()

    if(entries.length === 0){
        throw new Error('El ZIP de Abystale está vacío.')
    }

    zip.extractAllTo(MODPACK_FOLDER, true)

    const modsFolder = path.join(MODPACK_FOLDER, 'mods')

    if(!fs.existsSync(modsFolder)){
        throw new Error(
            'La instalación terminó, pero el ZIP no dejó la carpeta mods directamente dentro de la instancia.'
        )
    }

    writeInstallationMarker(version)
}

/**
 * Elimina el ZIP después de instalarlo.
 */
function deleteDownloadedZip(){
    if(fs.existsSync(ZIP_FILE)){
        fs.unlinkSync(ZIP_FILE)
    }
}

module.exports = {
    PROJECT_ID,
    PROJECT_NAME,
    LAUNCHER_FOLDER,
    DOWNLOAD_FOLDER,
    MODPACK_FOLDER,
    ZIP_FILE,
    INSTALL_MARKER,
    isModpackInstalled,
    getInstallationInfo,
    getInstalledVersion,
    writeInstallationMarker,
    installModpackFromZip,
    deleteDownloadedZip,
    migrateLegacyInstallation
}