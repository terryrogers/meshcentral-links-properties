const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const jexl = require('jexl');
const jmespath = require('jmespath');
const KeyvPackage = require('keyv');
const mysql = require('mysql2/promise');
const pg = require('pg');
const initSqlJs = require('sql.js/dist/sql-asm.js');
const undici = require('undici');

module.exports = {
    Ajv: Ajv.default || Ajv,
    addFormats: addFormats.default || addFormats,
    Jexl: jexl.Jexl,
    jmespath,
    Keyv: KeyvPackage.Keyv || KeyvPackage.default || KeyvPackage,
    mysql,
    pg,
    initSqlJs,
    undici
};
