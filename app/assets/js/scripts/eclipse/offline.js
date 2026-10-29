const fs = require('fs')
const path = require('path')

const CONFIG_FOLDER = path.join(
    process.env.APPDATA,
    'E5 Studios',
    'Eclipse Launcher'
)

const CONFIG_FILE = path.join(
    CONFIG_FOLDER,
    'offline-user.json'
)

function isValidUsername(username) {
    return /^[A-Za-z0-9_]{3,16}$/.test(username)
}

function saveUsername(username) {
    if (!isValidUsername(username)) {
        throw new Error(
            'El nombre debe tener entre 3 y 16 caracteres y usar solo letras, números o guion bajo.'
        )
    }

    fs.mkdirSync(CONFIG_FOLDER, {
        recursive: true
    })

    fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify({ username }, null, 2),
        'utf8'
    )
}

function getUsername() {
    if (!fs.existsSync(CONFIG_FILE)) {
        return ''
    }

    try {
        const data = JSON.parse(
            fs.readFileSync(CONFIG_FILE, 'utf8')
        )

        return typeof data.username === 'string'
            ? data.username
            : ''
    } catch {
        return ''
    }
}

module.exports = {
    isValidUsername,
    saveUsername,
    getUsername
}