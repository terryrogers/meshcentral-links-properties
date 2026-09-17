"use strict";

const vendor = require('./vendor-server.cjs');
const Ajv = vendor.Ajv.default || vendor.Ajv;
const addFormats = vendor.addFormats.default || vendor.addFormats;
const Jexl = vendor.Jexl.Jexl || vendor.Jexl.default || vendor.Jexl;
const jmespath = vendor.jmespath.default || vendor.jmespath;
const Keyv = vendor.Keyv.Keyv || vendor.Keyv.default || vendor.Keyv;
const mysql = vendor.mysql.default || vendor.mysql;
const pg = vendor.pg.default || vendor.pg;
const initSqlJs = vendor.initSqlJs.default || vendor.initSqlJs;
const undici = vendor.undici.default || vendor.undici;

const ajv = new Ajv({ allErrors: true, strict: false, coerceTypes: true, useDefaults: true });
addFormats(ajv);
['textarea', 'password', 'tel', 'color', 'range', 'url'].forEach(function (format) { ajv.addFormat(format, true); });
const jexl = new Jexl();
const compiled = new Map();
function text(value) { return value == null ? '' : String(value); }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
const functionArguments = {
    now: [0, 0], concat: [2, Infinity], proper: [1, 1], upper: [1, 1], lower: [1, 1], trim: [1, 1], len: [1, 1],
    substring: [2, 3], left: [2, 2], right: [2, 2], coalesce: [2, Infinity],
    add: [2, Infinity], subtract: [2, 2], multiply: [2, Infinity], divide: [2, 2], mod: [2, 2], round: [1, 2], abs: [1, 1],
    replace: [3, 3], contains: [2, 2], startsWith: [2, 2], endsWith: [2, 2], split: [2, 2], join: [2, 2],
    first: [1, 1], last: [1, 1], padLeft: [2, 3], padRight: [2, 3], urlEncode: [1, 1], urlDecode: [1, 1],
    toString: [1, 1], toNumber: [1, 1], toBoolean: [1, 1], min: [1, Infinity], max: [1, Infinity], sum: [1, Infinity],
    average: [1, Infinity], unique: [1, 1], formatDate: [2, 2], dateAdd: [3, 3], dateDiff: [3, 3]
};
function functionArgumentCount(expression, opening) {
    let round = 1, square = 0, curly = 0, commas = 0, content = false, quote = '', escaped = false;
    for (let index = opening + 1; index < expression.length; index++) {
        const character = expression[index];
        if (quote) {
            content = true;
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") { quote = character; content = true; continue; }
        if (character === '(') { round++; content = true; continue; }
        if (character === ')') {
            round--;
            if (round === 0) return content ? commas + 1 : 0;
            content = true;
            continue;
        }
        if (character === '[') { square++; content = true; continue; }
        if (character === ']') { square--; content = true; continue; }
        if (character === '{') { curly++; content = true; continue; }
        if (character === '}') { curly--; content = true; continue; }
        if (character === ',' && round === 1 && square === 0 && curly === 0) { commas++; continue; }
        if (!/\s/.test(character)) content = true;
    }
    return null;
}
function validateFunctionCalls(expression) {
    expression = String(expression || '');
    let quote = '', escaped = false;
    for (let index = 0; index < expression.length; index++) {
        const character = expression[index];
        if (quote) {
            if (escaped) escaped = false;
            else if (character === '\\') escaped = true;
            else if (character === quote) quote = '';
            continue;
        }
        if (character === '"' || character === "'") { quote = character; continue; }
        if (!/[A-Za-z_]/.test(character)) continue;
        const start = index;
        while (index + 1 < expression.length && /[A-Za-z0-9_]/.test(expression[index + 1])) index++;
        const name = expression.slice(start, index + 1);
        let opening = index + 1;
        while (/\s/.test(expression[opening] || '')) opening++;
        if (expression[opening] !== '(') continue;
        const count = functionArgumentCount(expression, opening), spec = functionArguments[name];
        if (!spec) throw new Error('Unknown formula function "' + name + '".');
        if (count == null) continue;
        if (count < spec[0] || count > spec[1]) {
            const expected = spec[0] === spec[1] ? String(spec[0]) : (spec[1] === Infinity ? ('at least ' + spec[0]) : (spec[0] + ' to ' + spec[1]));
            throw new Error('Function "' + name + '" expects ' + expected + ' argument' + (expected === '1' ? '' : 's') + ' but received ' + count + '.');
        }
    }
    return true;
}
const functions = {
    concat: function () { return Array.prototype.map.call(arguments, text).join(''); },
    proper: function (v) { return text(v).toLowerCase().replace(/(^|[\s_-])([a-z])/g, function (_, lead, ch) { return lead + ch.toUpperCase(); }); },
    upper: function (v) { return text(v).toUpperCase(); }, lower: function (v) { return text(v).toLowerCase(); }, trim: function (v) { return text(v).trim(); },
    len: function (v) { return v == null ? 0 : (typeof v.length === 'number' ? v.length : Object.keys(v).length); },
    substring: function (v, start, length) { const s = text(v); return length == null ? s.substring(number(start)) : s.substring(number(start), number(start) + number(length)); },
    left: function (v, count) { return text(v).slice(0, Math.max(0, number(count))); },
    right: function (v, count) { const n = Math.max(0, number(count)); return n === 0 ? '' : text(v).slice(-n); },
    coalesce: function () { for (let i = 0; i < arguments.length; i++) if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i]; return ''; },
    add: function (a, b) { return number(a) + number(b); }, subtract: function (a, b) { return number(a) - number(b); }, multiply: function (a, b) { return number(a) * number(b); },
    divide: function (a, b) { const n = number(b); if (n === 0) throw new Error('Division by zero.'); return number(a) / n; },
    mod: function (a, b) { const n = number(b); if (n === 0) throw new Error('Division by zero.'); return number(a) % n; },
    round: function (v, places) { const p = Math.pow(10, Math.max(0, Math.min(12, number(places)))); return Math.round(number(v) * p) / p; },
    abs: function (v) { return Math.abs(number(v)); }, now: function () { return new Date().toISOString(); },
    replace: function (v, find, replacement) { return text(v).split(text(find)).join(text(replacement)); },
    contains: function (v, search) { return text(v).indexOf(text(search)) >= 0; },
    startsWith: function (v, search) { return text(v).startsWith(text(search)); },
    endsWith: function (v, search) { return text(v).endsWith(text(search)); },
    split: function (v, separator) { return text(v).split(text(separator)); },
    join: function (v, separator) { return Array.isArray(v) ? v.map(text).join(text(separator)) : text(v); },
    first: function (v) { return Array.isArray(v) ? v[0] : text(v).charAt(0); },
    last: function (v) { return Array.isArray(v) ? v[v.length - 1] : text(v).slice(-1); },
    padLeft: function (v, width, fill) { return text(v).padStart(Math.max(0, number(width)), text(fill || ' ').charAt(0)); },
    padRight: function (v, width, fill) { return text(v).padEnd(Math.max(0, number(width)), text(fill || ' ').charAt(0)); },
    urlEncode: function (v) { return encodeURIComponent(text(v)); }, urlDecode: function (v) { return decodeURIComponent(text(v)); },
    toString: function (v) { return text(v); }, toNumber: function (v) { return number(v); },
    toBoolean: function (v) { return v === true || v === 1 || /^(true|yes|on|1)$/i.test(text(v)); },
    min: function () { return Math.min.apply(Math, Array.prototype.concat.apply([], arguments).map(number)); },
    max: function () { return Math.max.apply(Math, Array.prototype.concat.apply([], arguments).map(number)); },
    sum: function (v) { var a = Array.isArray(v) ? v : Array.prototype.slice.call(arguments); return a.map(number).reduce(function (t, n) { return t + n; }, 0); },
    average: function (v) { var a = Array.isArray(v) ? v : Array.prototype.slice.call(arguments); return a.length ? functions.sum(a) / a.length : 0; },
    unique: function (v) { return Array.isArray(v) ? Array.from(new Set(v)) : v; },
    formatDate: function (v, format) { var d = new Date(v); if (isNaN(d.getTime())) return ''; var z = function (n) { return String(n).padStart(2, '0'); }; return text(format || 'YYYY-MM-DD').replace(/YYYY/g, d.getUTCFullYear()).replace(/MM/g, z(d.getUTCMonth() + 1)).replace(/DD/g, z(d.getUTCDate())).replace(/HH/g, z(d.getUTCHours())).replace(/mm/g, z(d.getUTCMinutes())).replace(/ss/g, z(d.getUTCSeconds())); },
    dateAdd: function (v, amount, unit) { var d = new Date(v), n = number(amount); if (isNaN(d.getTime())) return ''; var ms = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[text(unit).toLowerCase()]; if (ms) d = new Date(d.getTime() + n * ms); else if (/^month/i.test(unit)) d.setUTCMonth(d.getUTCMonth() + n); else if (/^year/i.test(unit)) d.setUTCFullYear(d.getUTCFullYear() + n); return d.toISOString(); },
    dateDiff: function (a, b, unit) { var ms = new Date(b).getTime() - new Date(a).getTime(); var scale = { second: 1000, minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[text(unit).toLowerCase()] || 1; return ms / scale; }
};
Object.keys(functions).forEach(function (name) { jexl.addFunction(name, functions[name]); });
function compile(expression) { if (compiled.has(expression)) return compiled.get(expression); const result = jexl.compile(expression); if (compiled.size >= 500) compiled.delete(compiled.keys().next().value); compiled.set(expression, result); return result; }
function evaluate(expression, context) { validateFunctionCalls(expression); return compile(expression).evalSync(context || {}); }
function check(expression) { validateFunctionCalls(expression); compile(expression); return true; }
function validate(schema, value) { const fn = ajv.compile({ type: 'object', properties: { value: schema }, required: ['value'] }); const wrapper = { value: value }; const ok = fn(wrapper); return { ok: ok, value: wrapper.value, errors: fn.errors || [] }; }
const functionCatalog = Object.keys(functions).map(function (name) { return { name: name }; });
module.exports = { ajv: ajv, evaluate: evaluate, check: check, functions: functions, functionCatalog: functionCatalog, validateFunctionCalls: validateFunctionCalls, jmespath: jmespath, Keyv: Keyv, validate: validate, mysql: mysql, pg: pg, initSqlJs: initSqlJs, undici: undici };
