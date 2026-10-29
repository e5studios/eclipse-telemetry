/**
 * Eclipse Launcher
 * Pantalla inicial de nombre offline
 */

const Offline = require('./assets/js/scripts/eclipse/offline')

const usernameInput = document.getElementById('eclipseUsernameInput')
const usernameError = document.getElementById('eclipseUsernameError')
const welcomeButton = document.getElementById('welcomeButton')

usernameInput.value = Offline.getUsername()

welcomeButton.addEventListener('click', () => {
    const username = usernameInput.value.trim()

    if (!Offline.isValidUsername(username)) {
        usernameError.textContent =
            'Usa entre 3 y 16 caracteres: letras, números o _.'
        return
    }

    try {
        Offline.saveUsername(username)
        usernameError.textContent = ''

        switchView(VIEWS.welcome, VIEWS.landing)

    } catch (error) {
        usernameError.textContent = error.message
    }
})