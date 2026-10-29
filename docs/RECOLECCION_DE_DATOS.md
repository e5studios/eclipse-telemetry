# Recolección de información de rendimiento

Este documento describe, de forma completa y verificable, qué información
técnica recopila **Eclipse Launcher** del equipo donde se instala, para qué se
usa, dónde se publica y cómo puede solicitarse su revisión o eliminación.

> Documento de transparencia. El detalle de cada equipo aparece en
> [`dispositivos.md`](./dispositivos.md).

## 1. Base del consentimiento

La recopilación se autoriza en la **cláusula 1 del Acuerdo de Instalación y Uso**
que el usuario debe aceptar de forma obligatoria para instalar el launcher:

> «Al aceptar este acuerdo, el usuario autoriza a Eclipse 5 Studios a recopilar
> información técnica del equipo con el objetivo exclusivo de mejorar el
> rendimiento del launcher y de los modpacks en diferentes computadores.»

Si el usuario no acepta el acuerdo, el instalador no continúa y el launcher no
se instala.

## 2. Datos que se recopilan

| Campo | Ejemplo | Para qué se usa |
| --- | --- | --- |
| Nombre de usuario del equipo | `diego` | Identificar el equipo en los reportes de rendimiento. |
| Procesador (CPU) | `Intel(R) Core(TM) i7-12700` | Ajustar requisitos y valores por defecto de RAM/Java. |
| Núcleos lógicos | `20` | Calibrar el rendimiento esperado y los valores sugeridos. |
| Tarjeta gráfica (GPU) | `NVIDIA GeForce RTX 3060` | Detectar problemas de rendimiento gráfico por modelo. |
| Memoria RAM total | `31.8 GB` | Ajustar la memoria recomendada y el mínimo del launcher. |
| Sistema operativo | `Windows_NT 10.0.22631 (x64)` | Reproducir fallos específicos de una versión o arquitectura. |
| Versión del launcher | `BETA 2.0.0` | Separar reportes de distintas versiones. |
| Fecha del reporte | `2026-10-29 12:00 UTC` | Ordenar y depurar los datos. |
| Identificador de instalación | `5f1c2a9e-…` | Evitar duplicados y atender solicitudes de borrado. Es aleatorio y **no** se deriva del hardware. |

## 3. Datos que NO se recopilan

El launcher no recopila ni transmite:

- Contraseñas, tokens de Microsoft/Mojang ni credenciales de Minecraft.
- Archivos personales, capturas, historial de navegación ni portapapeles.
- Rutas completas del disco ni nombres de carpetas del usuario.
- Dirección IP con fines de perfilado (el servidor receptor puede verla en la
  conexión, pero no se almacena en el reporte).
- Contenido de los modpacks, partidas o chats.

## 4. Cuándo y cómo se envía

- Se envía **como máximo una vez cada 24 horas** por instalación.
- El primer envío ocurre en el primer arranque posterior a la instalación.
- El transporte es `HTTPS` mediante `POST` con cuerpo `JSON`.
- Si el envío falla, el perfil queda en una cola local y se reintenta en el
  siguiente arranque. La cola se descarta cuando el envío se completa.
- El endpoint se configura en
  [`app/assets/js/telemetry-config.json`](../app/assets/js/telemetry-config.json).

Ejemplo del cuerpo enviado:

```json
{
  "schema": 1,
  "installId": "5f1c2a9e-4b1d-4f0a-9d0e-7a3b2c1d0e9f",
  "collectedAt": "2026-10-29T12:00:00.000Z",
  "launcher": { "version": "2.0.0", "stage": "BETA" },
  "username": "diego",
  "cpu": { "model": "Intel(R) Core(TM) i7-12700", "cores": 20 },
  "gpu": "NVIDIA GeForce RTX 3060",
  "ramGb": 31.8,
  "os": {
    "platform": "win32",
    "name": "Windows_NT",
    "release": "10.0.22631",
    "arch": "x64"
  }
}
```

## 5. Almacenamiento local

El launcher guarda una copia del último perfil y la cola de reintentos en:

```
%APPDATA%\E5 Studios\Eclipse Launcher\telemetry.json
```

Ese archivo contiene exactamente los mismos campos que se envían. Puede
abrirse, revisarse o eliminarse en cualquier momento.

## 6. Publicación de los datos

Los reportes se publican en [`dispositivos.md`](./dispositivos.md), dentro de
este repositorio.

- Los datos se presentan en formato de tabla, un renglón por equipo.
- El identificador de instalación permite localizar y eliminar un renglón si el
  usuario lo solicita.
- No se publican contraseñas, tokens ni archivos.

> **Usuario enmascarado por defecto.** El receptor publica el nombre de usuario
> como `Usuario-xxxxxx` (derivado del identificador de instalación) salvo que el
> operador active `PUBLIC_RAW_USERNAME=true`. Esto evita exponer nombres de
> equipo de terceros en un repositorio público.

## 7. Conservación y eliminación

- Los reportes se conservan mientras sean útiles para el análisis de rendimiento.
- Cualquier usuario puede solicitar la revisión o eliminación de su reporte
  abriendo un issue en
  <https://github.com/e5studios/EclipseLauncher/issues> e indicando su
  identificador de instalación (visible en `telemetry.json`).
- La solicitud se atiende eliminando el renglón correspondiente de
  `dispositivos.md`.

## 8. Cómo desactivar la recopilación

El usuario puede desactivarla sin desinstalar el launcher:

1. Abrir `%APPDATA%\E5 Studios\Eclipse Launcher\telemetry.json`.
2. Cambiar `"enabled": true` por `"enabled": false`.
3. Guardar el archivo.

El launcher dejará de enviar perfiles en el siguiente arranque. También puede
eliminarse el archivo por completo; se regenerará con la recopilación activa.

## 9. Contacto

- Repositorio: <https://github.com/e5studios/EclipseLauncher>
- Issues: <https://github.com/e5studios/EclipseLauncher/issues>
- Canales oficiales de Eclipse 5 Studios (Discord y sitio web).
