const https = require('https')

const PROJECT_INFO_URL = 'https://raw.githubusercontent.com/e5studios/Abystale-Launcher-Files/main/project.json'

function getProjectInfo() {
    return new Promise((resolve, reject) => {

        https.get(PROJECT_INFO_URL, (res) => {

            let data = ''

            res.on('data', chunk => {
                data += chunk
            })

            res.on('end', () => {
                try {
                    resolve(JSON.parse(data))
                } catch(err) {
                    reject(err)
                }
            })

        }).on('error', reject)

    })
}

module.exports = {
    getProjectInfo
}