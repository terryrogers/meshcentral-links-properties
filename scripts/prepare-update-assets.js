'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));

if (manifest.version !== pkg.version) {
    throw new Error(`Version mismatch: config.json is ${manifest.version}, package.json is ${pkg.version}.`);
}

const archive = path.join(root, 'dist', `devicepropertieslinks-${manifest.version}.zip`);
if (!fs.existsSync(archive)) {
    throw new Error(`Release archive is missing: ${archive}`);
}

const output = path.join(root, 'dist', 'update-assets');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

fs.copyFileSync(path.join(root, 'config.json'), path.join(output, 'config.json'));
fs.copyFileSync(path.join(root, 'changelog.md'), path.join(output, 'changelog.md'));
fs.copyFileSync(archive, path.join(output, 'devicepropertieslinks.zip'));

console.log(`Prepared update assets for Links & Properties ${manifest.version}: ${output}`);
