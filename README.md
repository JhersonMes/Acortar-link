# Salta Acortadores

Descubre a dónde lleva de verdad un enlace acortado y salta las páginas de anuncios cuando es posible.

El proyecto tiene dos partes que comparten la misma lógica:

- **Página web**: pegas un enlace y te muestra el destino real y todo el recorrido (cada redirección).
- **Extensión para el navegador**: salta automáticamente las páginas intermedias y convierte los enlaces de las páginas en enlaces directos.

## Qué puede y qué no puede hacer

| Tipo de enlace | Ejemplos | ¿Funciona? |
| --- | --- | --- |
| Acortadores normales (redirección del servidor) | bit.ly, tinyurl, t.co, cutt.ly | ✅ La página web sigue las redirecciones y muestra el destino |
| Enlaces con el destino escondido dentro | `ouo.io/qs/…?s=https://…`, `linkvertise…/dynamic?r=<Base64>`, `google.com/url?q=…`, `l.facebook.com/l.php?u=…` | ✅ Web y extensión: se extrae sin visitar la página de anuncios |
| Páginas que redirigen con `<meta refresh>` o JavaScript simple | Muchos acortadores pequeños | ✅ La página web y el botón “Revelar” de la extensión |
| Acortadores que solo dan el destino después del captcha o la cuenta regresiva | `ouo.io/AbC123`, `linkvertise.com/123/nombre`, shrinkme, exe.io… | ❌ No hay forma honesta de saberlo sin completar esos pasos: la herramienta te avisa en vez de inventar |

Para el último caso, **uBlock Origin** al menos quita los anuncios y las ventanas emergentes de la página intermedia.

## Página web

### Probarla en tu computadora

Necesitas [Node.js](https://nodejs.org) 20 o más reciente. No hay dependencias que instalar.

```bash
npm start
```

Abre <http://localhost:3000>. Para usar otro puerto: `PORT=8080 npm start`.

### Publicarla en internet (gratis, con Vercel)

[![Desplegar en Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FJhersonMes%2FAcortar-link)

1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub.
2. Pulsa el botón de arriba (o “Add New → Project” e importa este repositorio).
3. No cambies nada en la configuración y pulsa **Deploy**.

Vercel sirve la página desde `public/` y la API desde `api/resolver.js`. Te da una dirección del tipo `https://acortar-link.vercel.app`.

También funciona en cualquier hosting que ejecute Node (Render, Railway, un VPS…) con `npm start`.

### Sin servidor (GitHub Pages u otro hosting estático)

Si solo subes la carpeta `public/`, la página funciona igual pero **solo revisa el propio enlace** (destinos escondidos, Base64…), sin seguir redirecciones. Si además tienes la API publicada en otro sitio, pon su dirección en `public/index.html`:

```html
<meta name="desacortador-api" content="https://tu-app.vercel.app">
```

### Atajos

- `https://tu-sitio/?url=<enlace>` revisa un enlace directamente.
- La página ofrece un **marcador** (bookmarklet): arrástralo a la barra de marcadores y, en cualquier página, púlsalo para revisar esa dirección.

### API

```
GET /api/resolver?url=https://bit.ly/abc
```

```json
{
  "original": "https://bit.ly/abc",
  "final": "https://ejemplo.com/articulo",
  "estado": "completo",
  "aviso": null,
  "pasos": [
    { "url": "https://bit.ly/abc", "via": "http", "codigo": 301 }
  ]
}
```

- `estado`: `completo`, `bloqueado` (acortador con captcha o cuenta regresiva), `sin-cambios` (no redirige) o `incompleto` (se cortó a mitad de camino; `final` es el último destino conocido).
- `via`: `http` (redirección del servidor), `meta` (`<meta refresh>`), `js` (JavaScript) o `enlace` (destino escondido en el propio enlace).

Por seguridad, el servidor no visita direcciones internas (`localhost`, `192.168.x.x`, `10.x.x.x`, `169.254.169.254`…), así nadie puede usarlo para entrar a la red donde está alojado.

## Extensión para el navegador

Lo que hace:

- **Salto automático**: si abres un enlace de un acortador o redirector conocido que trae el destino dentro, la extensión cancela la página de anuncios y te lleva directo al destino.
- **Enlaces directos**: en cualquier página, los enlaces que pasan por esos sitios se cambian por el destino real antes de que hagas clic.
- **Revelar**: en el ícono de la extensión pegas cualquier enlace y te dice a dónde lleva, con el recorrido completo. También con clic derecho sobre un enlace → *Revelar destino real del enlace*.
- **Tus acortadores**: en *Opciones* puedes agregar otros dominios.

La extensión solo salta automáticamente en sitios conocidos (o en los que agregues), para no romper inicios de sesión ni otras páginas que usan `?redirect=`.

### Instalar en Chrome, Edge, Brave u Opera

1. Descarga este repositorio (botón verde **Code → Download ZIP**) y descomprímelo.
2. Abre `chrome://extensions` (en Edge: `edge://extensions`).
3. Activa el **Modo de desarrollador** (arriba a la derecha).
4. Pulsa **Cargar descomprimida** y elige la carpeta `extension`.
5. Fija el ícono en la barra para tenerlo a mano.

### Instalar en Firefox

- **Para probarla**: abre `about:debugging#/runtime/this-firefox` → **Cargar complemento temporal…** → elige `extension/manifest.json`. Se quita al cerrar Firefox.
- **Para dejarla instalada**: Firefox solo acepta complementos firmados. Crea una cuenta en [addons.mozilla.org](https://addons.mozilla.org/developers/), sube un ZIP con el contenido de la carpeta `extension` como complemento *no listado* y Mozilla te devuelve el `.xpi` firmado.
- Si no salta nada, revisa en `about:addons` → Salta Acortadores → **Permisos** que tenga acceso a todos los sitios.

## Agregar acortadores

La lista está en `shared/desacortador.js` (`REGLAS`). Cada regla tiene:

```js
{ host: 'ouo.io', param: 's', anuncios: true }
{ host: 'google.*', ruta: '/url', param: 'q' }   // google.com, google.com.pe, google.es…
```

Después de editar `shared/desacortador.js`, ejecuta `npm run sync` para copiarlo a la página web y a la extensión.

## Desarrollo

```bash
npm test        # pruebas (lógica, servidor, API)
npm run sync    # copia shared/desacortador.js a public/js/ y extension/lib/
npm start       # servidor local
```

```
shared/desacortador.js     lógica compartida (detección de destinos, recorrido)
lib/resolver.js            visita los enlaces desde Node, con protección de red interna
api/resolver.js            API /api/resolver (Vercel y servidor local)
server.js                  servidor local: página + API
public/                    página web
extension/                 extensión (Manifest V3, Chrome y Firefox)
test/                      pruebas con node:test
```

## Una aclaración

Los acortadores con anuncios le pagan al autor del enlace por cada visita. Saltarlos le quita ese ingreso, así que si un creador te interesa, considera apoyarlo de otra forma.
