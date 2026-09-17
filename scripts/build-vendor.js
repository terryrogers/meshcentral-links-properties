'use strict';

const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');

fs.copyFileSync(require.resolve('jquery/dist/jquery.min.js'), path.join(root, 'includes', 'jquery.min.js'));
fs.copyFileSync(require.resolve('semantic-ui-css/semantic.min.js'), path.join(root, 'includes', 'semantic.min.js'));
fs.copyFileSync(require.resolve('semantic-ui-css/semantic.min.css'), path.join(root, 'includes', 'semantic.min.css'));
const semanticCssPath = path.join(root, 'includes', 'semantic.min.css');
fs.writeFileSync(
    semanticCssPath,
    fs.readFileSync(semanticCssPath, 'utf8').replaceAll(
        'themes/default/assets/',
        '/plugin-assets/devicepropertieslinks/themes/default/assets/'
    )
);
fs.cpSync(
    path.join(path.dirname(require.resolve('semantic-ui-css/semantic.min.css')), 'themes'),
    path.join(root, 'includes', 'themes'),
    { recursive: true, force: true }
);

Promise.all([
    esbuild.build({
        entryPoints: [path.join(root, 'src', 'vendor-browser-entry.js')],
        outfile: path.join(root, 'includes', 'vendor-browser.js'),
        bundle: true,
        minify: true,
        platform: 'browser',
        format: 'iife',
        target: ['chrome100', 'firefox100', 'safari15'],
        legalComments: 'linked',
        sourcemap: false
    }),
    esbuild.build({
        entryPoints: [path.join(root, 'src', 'vendor-server-entry.js')],
        outfile: path.join(root, 'lib', 'vendor-server.cjs'),
        bundle: true,
        minify: true,
        platform: 'node',
        format: 'cjs',
        target: ['node20'],
        legalComments: 'linked',
        sourcemap: false
    })
]).catch(function (error) {
    console.error(error);
    process.exit(1);
});
