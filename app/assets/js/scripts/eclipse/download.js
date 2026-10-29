const fs = require('fs')
const path = require('path')
const { pipeline } = require('stream')
const { promisify } = require('util')
const got = require('got')

const pipelineAsync = promisify(pipeline)

async function downloadFile(url, destination, onProgress = () => {}) {
    const destinationFolder = path.dirname(destination)

    fs.mkdirSync(destinationFolder, {
        recursive: true
    })

    const downloadStream = got.stream(url)

    downloadStream.on('downloadProgress', progress => {
        const percentage = Math.round(progress.percent * 100)

        onProgress({
            percentage,
            transferred: progress.transferred,
            total: progress.total
        })
    })

    await pipelineAsync(
        downloadStream,
        fs.createWriteStream(destination)
    )

    return destination
}

module.exports = {
    downloadFile
}