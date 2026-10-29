# Configurar el receptor de telemetría

El launcher envía el perfil del equipo a un endpoint HTTPS propio. En este repo
se incluye un Worker de Cloudflare listo para desplegar en
[`telemetry-worker.js`](./telemetry-worker.js).

## 1. Crear el token de GitHub

1. Ir a **GitHub → Settings → Developer settings → Personal access tokens →
   Fine-grained tokens**.
2. Crear un token limitado al repositorio `e5studios/EclipseLauncher`.
3. Permiso: **Contents → Read and write**. Nada más.
4. Guardar el token; solo se pega en el Worker, nunca en el launcher.

## 2. Desplegar el Worker

1. En Cloudflare → **Workers & Pages → Create → Worker**.
2. Pegar el contenido de `telemetry-worker.js`.
3. En **Settings → Variables and Secrets** agregar:

| Variable | Tipo | Valor |
| --- | --- | --- |
| `GITHUB_TOKEN` | Secret | Token del paso 1. |
| `SHARED_KEY` | Secret | Cadena larga y aleatoria (mínimo 32 caracteres). |
| `GITHUB_REPO` | Text | `e5studios/EclipseLauncher` |
| `GITHUB_BRANCH` | Text | `main` |
| `GITHUB_PATH` | Text | `docs/dispositivos.md` |
| `PUBLIC_RAW_USERNAME` | Text | `false` (usuario enmascarado) o `true` (usuario real). |

4. Anotar la URL pública del Worker, por ejemplo:
   `https://eclipse-telemetry.e5studios.workers.dev`.

## 3. Configurar el launcher

Editar `app/assets/js/telemetry-config.json` antes de compilar:

```json
{
  "enabled": true,
  "endpoint": "https://eclipse-telemetry.e5studios.workers.dev",
  "sharedKey": "la-misma-clave-que-SHARED_KEY",
  "intervalHours": 24,
  "timeoutMs": 8000
}
```

> La `sharedKey` queda dentro del instalador y puede extraerse. Sirve para
> frenar envíos accidentales, no como seguridad real. Si hay abuso, rota la
> clave y publica una nueva versión.

## 4. Probar sin instalar

```bash
curl -X POST "https://TU-WORKER.workers.dev" \
  -H "Content-Type: application/json" \
  -H "X-Eclipse-Key: TU_SHARED_KEY" \
  -d '{
    "schema": 1,
    "installId": "5f1c2a9e-4b1d-4f0a-9d0e-7a3b2c1d0e9f",
    "collectedAt": "2026-10-29T12:00:00.000Z",
    "launcher": { "version": "2.0.0", "stage": "BETA" },
    "username": "equipo-prueba",
    "cpu": { "model": "Intel Core i7-12700", "cores": 20 },
    "gpu": "NVIDIA GeForce RTX 3060",
    "ramGb": 31.8,
    "os": { "platform": "win32", "name": "Windows_NT", "release": "10.0.22631", "arch": "x64" }
  }'
```

Si responde `{"ok":true}`, el renglón debe aparecer en
[`dispositivos.md`](./dispositivos.md).

## 5. Alternativa sin Cloudflare

Cualquier servidor que reciba `POST` con `Content-Type: application/json` y el
header `X-Eclipse-Key` sirve. El launcher solo espera un código `2xx`.
