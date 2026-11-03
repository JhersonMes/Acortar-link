'use strict';

// Copia la lógica compartida a la página web y a la extensión.
// Uso: npm run sync

const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const origen = path.join(raiz, 'shared', 'desacortador.js');
const COPIAS = [
  path.join(raiz, 'public', 'js', 'desacortador.js'),
  path.join(raiz, 'extension', 'lib', 'desacortador.js'),
];

if (require.main === module) {
  for (const destino of COPIAS) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origen, destino);
    console.log('Copiado a', path.relative(raiz, destino));
  }
}

module.exports = { origen, COPIAS };
