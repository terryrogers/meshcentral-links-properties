/**
 * Links & Properties for MeshCentral.
 * Copyright (c) 2026 The Tech Wizard.
 * Licensed under the Apache License, Version 2.0.
 */
"use strict";

module.exports.devicepropertieslinks = function (parent) {
    const obj = {};
    const PLUGIN = 'devicepropertieslinks';
    const CONFIG_TYPE = 'devicepropertieslinks-config';
    const VALUES_TYPE = 'devicepropertieslinks-values';
    const MAX_DEFINITIONS = 250;
    const MAX_LINKS = 250;
    const MAX_ITEMS = 500;
    const MAX_DATA_SOURCES = 50;
    const MAX_AUTHENTICATION_SECRETS = 100;
    const PROPERTY_TYPES = new Set(['url', 'text', 'multiline', 'password', 'email', 'tel', 'color', 'number', 'integer', 'range', 'boolean', 'date', 'time', 'datetime', 'month', 'week', 'select', 'multiselect', 'tags']);
    const LINK_PROTOCOLS = new Set(['web', 'custom']);
    // These two schemes execute content in the MeshCentral page itself. All OS-handler
    // schemes, including unknown/custom schemes and file:, are otherwise permitted.
    const MASK_TRANSFORMS = new Set(['none', 'upper', 'lower']);
    const ITEM_KINDS = new Set(['link', 'command']);
    const COMMAND_SHELLS = new Set(['cmd', 'ps', 'sh', 'agent']);
    const COMMAND_MODES = new Set(['run', 'terminal']);
    // pluginGroup is accepted only while migrating pre-2.2.2 configuration. A local
    // group controls presentation and is not a device visibility attribute.
    const RULE_FIELDS = new Set(['group', 'tag', 'device', 'user', 'userGroup', 'pluginGroup', 'os', 'connected']);
    const RULE_OPERATORS = new Set(['is', 'isNot']);
    const GROUP_OPERATORS = new Set(['and', 'or', 'not']);

    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.db = obj.meshServer.db;
    obj.path = require('path');
    obj.fs = require('fs');
    obj.tls = require('tls');
    obj.net = require('net');
    obj.presetDefaultsPath = obj.path.join(__dirname, 'defaults', 'property-presets.json');
    obj.presetDataPath = obj.path.join(__dirname, 'data', 'property-presets.json');
    const runtime = require('./lib/runtime');
    const apiCache = new runtime.Keyv({ namespace: 'devicepropertieslinks-api', ttl: 300000 });
    let sqlJsPromise = null;
    obj.exports = [
        'onWebUIStartupEnd',
        'onDeviceRefreshEnd',
        'devicePropertiesLinksDeviceData',
        'devicePropertiesLinksOperationResult',
        'devicePropertiesLinksAdminData',
        'devicePropertiesLinksAdminResult',
        'devicePropertiesLinksFormulaPreview',
        'devicePropertiesLinksDataSourcePreview',
        'dplState','dplEsc','dplDialog','dplDialogClose','dplIntercept','dplRenderItems','dplRestoreQuickCommands','dplRun','dplExec','dplFinish','dplShowOutput','dplTypeTerminal','dplMyDevicesInit','dplBulkOpen','dplBulkPicker','dplBulkRun','dplContextUpdate','dplContextHide','dplInstallPropertiesPage','dplShowCustomPage','dplShowInformation','dplShowProperties','dplHideProperties'
    ];

    function installPermissionDatabaseCompatibility() {
        const db = obj.meshServer.db;
        if (!db || (typeof db.getPluginPermissions === 'function' && typeof db.setPluginPermissions === 'function')) return;
        const connectionOptions = obj.meshServer.args && obj.meshServer.args.mariadb;
        if (!connectionOptions) return;
        const modulePath = require.resolve('mariadb', { paths: [obj.path.dirname(require.main.filename)] });
        const mariadb = require(modulePath);
        obj.permissionDatabasePool = mariadb.createPool(Object.assign({}, connectionOptions, { connectionLimit: 2 }));
        db.getPluginPermissions = function (pluginName, callback) {
            const id = 'pluginpermission//' + pluginName;
            obj.permissionDatabasePool.query('SELECT doc FROM pluginpermissions WHERE id = ?', [id]).then(function (rows) {
                if (!rows || rows.length === 0 || !rows[0].doc) { callback(null, []); return; }
                let doc = rows[0].doc;
                if (Buffer.isBuffer(doc)) doc = doc.toString('utf8');
                if (typeof doc === 'string') doc = JSON.parse(doc);
                callback(null, [doc]);
            }).catch(function (error) { callback(error, []); });
        };
        db.setPluginPermissions = function (pluginName, data, callback) {
            const id = 'pluginpermission//' + pluginName;
            const document = Object.assign({}, data);
            delete document._id;
            obj.permissionDatabasePool.query(
                'INSERT INTO pluginpermissions (id, doc) VALUES (?, ?) ON DUPLICATE KEY UPDATE doc = VALUES(doc)',
                [id, JSON.stringify(document)]
            ).then(function () { if (callback) callback(null); }).catch(function (error) { if (callback) callback(error); });
        };
    }

    installPermissionDatabaseCompatibility();
    if (typeof obj.parent.registerPermissions === 'function') {
        obj.parent.registerPermissions(PLUGIN, {
            manage_definitions: {
                title: 'Manage device property and link definitions',
                desc: 'Create, edit, import, export, and delete property and direct-link definitions.',
                default: 'denied'
            },
            manage_data_sources: {
                title: 'Manage Data Sources',
                desc: 'Create, test, inspect, edit, and delete Static List, Database Query, and API Query Data Sources, including stored credentials.',
                default: 'denied'
            },
            edit_device_values: {
                title: 'Edit device property values',
                desc: 'Edit property values for devices the user can access.',
                default: 'denied'
            }
        });
    }

    function isFullAdmin(user) {
        return !!user && (user.siteadmin === 0xFFFFFFFF || user.siteadmin === -1 || Number(user.siteadmin) === 4294967295);
    }

    function hasPluginPermission(user, permission) {
        if (isFullAdmin(user)) return true;
        if (!user || typeof obj.parent.checkPluginPermission !== 'function') return false;
        try { return obj.parent.checkPluginPermission(user, PLUGIN, permission) === true; } catch (ex) { return false; }
    }

    function adminPermissions(user) {
        return {
            manageDefinitions: hasPluginPermission(user, 'manage_definitions'),
            manageDataSources: hasPluginPermission(user, 'manage_data_sources')
        };
    }

    function configId(domainId) { return 'pluginconfig//' + PLUGIN + '//' + domainId; }
    function valuesId(nodeId) { return 'pluginvalues//' + PLUGIN + '//' + nodeId; }
    function nowIso() { return new Date().toISOString(); }
    function cleanString(value, max, allowEmpty) {
        if (typeof value !== 'string') return allowEmpty ? '' : null;
        const result = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
        if ((!allowEmpty && result.length === 0) || result.length > max) return null;
        return result;
    }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }

    function sanitizePresetCatalog(input) {
        input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        function presetMap(source, kind) {
            const output = {};
            source = source && typeof source === 'object' && !Array.isArray(source) ? source : {};
            Object.keys(source).slice(0, 100).forEach(function (key) {
                if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) return;
                const entry = source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) ? source[key] : {};
                const item = { label: cleanString(entry.label, 100, true) || key };
                if (kind === 'validation') {
                    item.pattern = cleanString(entry.pattern, 512, true);
                    item.flags = (cleanString(entry.flags, 5, true) || '').replace(/[^imu]/g, '');
                    item.minimumLength = entry.minimumLength == null ? null : Math.max(0, Math.min(8192, Math.trunc(Number(entry.minimumLength) || 0)));
                    item.maximumLength = entry.maximumLength == null ? null : Math.max(1, Math.min(8192, Math.trunc(Number(entry.maximumLength) || 1)));
                    item.message = cleanString(entry.message, 300, true);
                    if (item.pattern) { try { new RegExp(item.pattern, item.flags); } catch (ex) { return; } }
                } else {
                    item.pattern = cleanString(entry.pattern, 128, true);
                    item.placeholder = cleanString(entry.placeholder, 128, true);
                    item.transform = MASK_TRANSFORMS.has(entry.transform) ? entry.transform : 'none';
                }
                output[key] = item;
            });
            if (!output.custom) output.custom = { label: 'Custom' };
            return output;
        }
        return {
            schemaVersion: 1,
            validationPresets: presetMap(input.validationPresets, 'validation'),
            inputMaskPresets: presetMap(input.inputMaskPresets, 'mask')
        };
    }

    function defaultPresetCatalog() {
        return sanitizePresetCatalog(JSON.parse(obj.fs.readFileSync(obj.presetDefaultsPath, 'utf8')));
    }

    function ensurePresetCatalogFile() {
        obj.fs.mkdirSync(obj.path.dirname(obj.presetDataPath), { recursive: true });
        if (!obj.fs.existsSync(obj.presetDataPath)) obj.fs.copyFileSync(obj.presetDefaultsPath, obj.presetDataPath);
    }

    function loadPresetCatalog() {
        try {
            if (!obj.fs.existsSync(obj.presetDataPath)) return defaultPresetCatalog();
            return sanitizePresetCatalog(JSON.parse(obj.fs.readFileSync(obj.presetDataPath, 'utf8')));
        } catch (error) {
            console.warn('Links & Properties preset file:', error.message);
            return defaultPresetCatalog();
        }
    }
    function makeId(prefix) { return prefix + '-' + require('crypto').randomBytes(8).toString('hex'); }

    function defaultRule() { return { kind: 'group', op: 'and', children: [] }; }
    function defaultConfig(domainId) {
        return {
            _id: configId(domainId),
            type: CONFIG_TYPE,
            domain: domainId,
            schemaVersion: 3,
            revision: 0,
            updated: null,
            updatedBy: null,
            properties: [],
            links: [],
            displayGroups: [],
            items: [],
            authenticationSecrets: [],
            dataSources: []
        };
    }

    function sanitizeRuleNode(input, depth, counter) {
        if (input == null) return null;
        if (depth > 5) throw new Error('Visibility rules cannot be nested more than five levels.');
        counter.count++;
        if (counter.count > 100) throw new Error('A visibility rule cannot contain more than 100 entries.');
        if (input.kind === 'condition') {
            if (!RULE_FIELDS.has(input.field)) throw new Error('A visibility condition has an unsupported field.');
            if (!RULE_OPERATORS.has(input.op)) throw new Error('A visibility condition has an unsupported operator.');
            const value = cleanString(input.value, 512, false);
            if (!value) throw new Error('Each visibility condition requires a value.');
            if (input.field === 'pluginGroup') return null;
            return { kind: 'condition', field: input.field, op: input.op, value: value };
        }
        if (input.kind !== 'group' || !GROUP_OPERATORS.has(input.op)) throw new Error('A visibility group is invalid.');
        const children = Array.isArray(input.children) ? input.children : [];
        return { kind: 'group', op: input.op, children: children.map(function (child) { return sanitizeRuleNode(child, depth + 1, counter); }).filter(Boolean) };
    }

    function sanitizeRule(input, depth, counter) {
        return sanitizeRuleNode(input, depth, counter) || defaultRule();
    }

    function visibilityRule(input) {
        if (!input || typeof input !== 'object') return defaultRule();
        if (input.kind === 'condition') return input.field === 'pluginGroup' ? null : input;
        const children = Array.isArray(input.children) ? input.children.map(visibilityRule).filter(Boolean) : [];
        return { kind: 'group', op: GROUP_OPERATORS.has(input.op) ? input.op : 'and', children: children };
    }

    function sanitizeOptions(options) {
        if (!Array.isArray(options) || options.length < 1 || options.length > 100) throw new Error('Selectable List properties require between 1 and 100 options.');
        const seen = new Set();
        return options.map(function (option) {
            const value = cleanString(option && option.value, 64, false);
            const label = cleanString(option && option.label, 100, false);
            if (!value || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) throw new Error('Selectable List option values may contain letters, numbers, dots, dashes, and underscores.');
            if (!label) throw new Error('Every Selectable List option requires a label.');
            const normalized = value.toLowerCase();
            if (seen.has(normalized)) throw new Error('Selectable List option values must be unique.');
            seen.add(normalized);
            return { value: value, label: label };
        });
    }

    function sanitizeValidation(input, label) {
        input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        const minimumLength = (input.minimumLength === '' || input.minimumLength == null) ? null : Number(input.minimumLength);
        const maximumLength = (input.maximumLength === '' || input.maximumLength == null) ? null : Number(input.maximumLength);
        if ((minimumLength != null && (!Number.isInteger(minimumLength) || minimumLength < 0 || minimumLength > 8192)) || (maximumLength != null && (!Number.isInteger(maximumLength) || maximumLength < 1 || maximumLength > 8192))) throw new Error('The validation length limits for "' + label + '" are invalid.');
        if (minimumLength != null && maximumLength != null && minimumLength > maximumLength) throw new Error('The validation minimum length for "' + label + '" cannot exceed its maximum.');
        const pattern = cleanString(input.pattern, 512, true);
        const flags = (cleanString(input.flags, 5, true) || '').replace(/[^imu]/g, '');
        if (pattern) { try { new RegExp(pattern, flags); } catch (ex) { throw new Error('The validation expression for "' + label + '" is invalid: ' + ex.message); } }
        return {
            preset: Object.prototype.hasOwnProperty.call(loadPresetCatalog().validationPresets, input.preset) ? input.preset : 'custom',
            minimumLength: minimumLength,
            maximumLength: maximumLength,
            pattern: pattern,
            flags: flags,
            message: cleanString(input.message, 300, true)
        };
    }

    function sanitizeInputMask(input) {
        input = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
        const transform = MASK_TRANSFORMS.has(input.transform) ? input.transform : 'none';
        return {
            preset: Object.prototype.hasOwnProperty.call(loadPresetCatalog().inputMaskPresets, input.preset) ? input.preset : 'custom',
            pattern: cleanString(input.pattern, 128, true),
            placeholder: cleanString(input.placeholder, 128, true),
            transform: transform
        };
    }

    function hasValidationConfiguration(input) {
        return Boolean(input&&typeof input==='object'&&!Array.isArray(input)&&(input.pattern||input.message||input.minimumLength!=null||input.maximumLength!=null||(input.preset&&input.preset!=='custom')));
    }

    function hasInputMaskConfiguration(input) {
        return Boolean(input&&typeof input==='object'&&!Array.isArray(input)&&(input.pattern||input.placeholder||(input.transform&&input.transform!=='none')));
    }

    function sanitizeProperty(input, usedKeys, usedIds, usedLabels) {
        const id = cleanString(input && input.id, 80, false) || makeId('property');
        if (usedIds.has(id)) throw new Error('Property identifiers must be unique.');
        usedIds.add(id);
        const label = cleanString(input.label, 512, false);
        if (!label) throw new Error('Every property requires a display name.');
        if (/[{}]/.test(label)) throw new Error('Property display names cannot contain formulas.');
        const normalizedLabel = label.toLocaleLowerCase();
        if (usedLabels.has(normalizedLabel)) throw new Error('Property display names must be unique.');
        usedLabels.add(normalizedLabel);
        let key = cleanString(input && input.key, 64, false);
        if (!key) { key = label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); if (!/^[a-z]/.test(key)) key = 'property_' + key; key = key.slice(0, 64); const baseKey=key; let keySuffix=2; while(usedKeys.has(key.toLowerCase())){const suffix='_'+keySuffix++;key=baseKey.slice(0,64-suffix.length)+suffix;} }
        if (!key || !/^[a-z][A-Za-z0-9_]{0,63}$/.test(key)) throw new Error('Property keys must begin with a lowercase letter and contain only letters, numbers, and underscores.');
        const normalizedKey = key.toLowerCase();
        if (usedKeys.has(normalizedKey)) throw new Error('Property keys must be unique.');
        usedKeys.add(normalizedKey);
        const type = cleanString(input.type, 20, false);
        if (!PROPERTY_TYPES.has(type)) throw new Error('Property "' + label + '" has an unsupported type.');
        const propertyMode = input.propertyMode === 'readonly' || (!input.propertyMode && input.valueTemplate) ? 'readonly' : 'input';
        const description = cleanString(input.description, 500, true);
        if (description) validateTemplateSyntax(description, 'Property description');
        const validationEnabled=input.validationEnabled===true||(input.validationEnabled==null&&hasValidationConfiguration(input.validation));
        const inputMaskEnabled=input.inputMaskEnabled===true||(input.inputMaskEnabled==null&&hasInputMaskConfiguration(input.inputMask));
        const property = {
            id: id,
            key: key,
            label: label,
            type: type,
            propertyMode: propertyMode,
            description: description,
            valueTemplate: propertyMode === 'readonly' ? cleanString(input.valueTemplate, 4096, true) : '',
            defaultTemplate: propertyMode === 'input' ? cleanString(input.defaultTemplate, 4096, true) : '',
            labelColor: /^#[0-9a-f]{6}$/i.test(input.labelColor || '') ? input.labelColor.toLowerCase() : '#071a4a',
            labelBackgroundColor: /^#[0-9a-f]{6}$/i.test(input.labelBackgroundColor || '') ? input.labelBackgroundColor.toLowerCase() : '#ffffff',
            labelBold: input.labelBold === true,
            labelItalic: input.labelItalic === true,
            labelUnderline: input.labelUnderline === true,
            valueColor: propertyMode === 'readonly' && /^#[0-9a-f]{6}$/i.test(input.valueColor || '') ? input.valueColor.toLowerCase() : '#071a4a',
            valueBackgroundColor: propertyMode === 'readonly' && /^#[0-9a-f]{6}$/i.test(input.valueBackgroundColor || '') ? input.valueBackgroundColor.toLowerCase() : '#ffffff',
            valueBold: propertyMode === 'readonly' && input.valueBold === true,
            valueItalic: propertyMode === 'readonly' && input.valueItalic === true,
            valueUnderline: propertyMode === 'readonly' && input.valueUnderline === true,
            validationEnabled: validationEnabled,
            inputMaskEnabled: inputMaskEnabled,
            enabled: input.enabled !== false,
            order: Number.isFinite(Number(input.order)) ? Math.max(0, Math.min(9999, Math.trunc(Number(input.order)))) : 0,
            rule: sanitizeRule(input.rule, 0, { count: 0 })
        };
        if(validationEnabled)property.validation=sanitizeValidation(input.validation,label);
        if(inputMaskEnabled)property.inputMask=sanitizeInputMask(input.inputMask);
        if (propertyMode === 'readonly' && !property.valueTemplate) throw new Error('Read-Only property "' + label + '" requires a computed value.');
        if (property.valueTemplate) validateTemplateSyntax(property.valueTemplate, 'Property computed value');
        if (property.defaultTemplate) validateTemplateSyntax(property.defaultTemplate, 'Property default value');
        if (type === 'number' || type === 'integer' || type === 'range') {
            property.minimum = (input.minimum === '' || input.minimum == null) ? null : Number(input.minimum);
            property.maximum = (input.maximum === '' || input.maximum == null) ? null : Number(input.maximum);
            property.step = (input.step === '' || input.step == null) ? null : Number(input.step);
            property.unit = cleanString(input.unit, 30, true);
            if ((property.minimum != null && !Number.isFinite(property.minimum)) || (property.maximum != null && !Number.isFinite(property.maximum)) || (property.step != null && (!Number.isFinite(property.step) || property.step <= 0))) throw new Error('The numeric constraints for "' + label + '" are invalid.');
            if (property.minimum != null && property.maximum != null && property.minimum > property.maximum) throw new Error('The minimum for "' + label + '" cannot exceed its maximum.');
        }
        if (type === 'select' || type === 'multiselect') {
            property.options = Array.isArray(input.options) && input.options.length ? sanitizeOptions(input.options) : [];
            if (!property.options.length && !(input.optionSource && input.optionSource.sourceKey)) throw new Error('Selectable List properties require static options or a dynamic data source.');
        }
        if (input.optionSource && typeof input.optionSource === 'object') {
            property.optionSource = {
                sourceKey: cleanString(input.optionSource.sourceKey, 64, true),
                valueExpression: cleanString(input.optionSource.valueExpression, 512, true),
                labelExpression: cleanString(input.optionSource.labelExpression, 512, true)
            };
        }
        if (input.schema && typeof input.schema === 'object' && !Array.isArray(input.schema)) {
            const encoded = JSON.stringify(input.schema);
            if (encoded.length > 16384 || /"(?:\$ref|__proto__|prototype|constructor)"\s*:/.test(encoded)) throw new Error('The advanced JSON Schema for "' + label + '" contains unsupported or unsafe content.');
            property.schema = clone(input.schema);
        }
        return property;
    }

    function sanitizeAuthenticationSecret(input, usedIds, usedNames) {
        const id = cleanString(input && input.id, 80, false) || makeId('secret');
        const name = cleanString(input && input.name, 120, false);
        const description = cleanString(input && input.description, 500, true);
        const type = ['bearerStored', 'headerStored', 'basicStored'].includes(input && input.type) ? input.type : '';
        if (!name || !type) throw new Error('Every Authentication Secret requires a Name and Type.');
        if (usedIds.has(id)) throw new Error('Authentication Secret identifiers must be unique.');
        const normalizedName = name.toLocaleLowerCase();
        if (usedNames.has(normalizedName)) throw new Error('Authentication Secret names must be unique.');
        usedIds.add(id); usedNames.add(normalizedName);
        const headerName = cleanString(input.headerName, 100, true);
        const token = cleanString(input.token, 4096, true);
        const username = cleanString(input.username, 512, true);
        const password = cleanString(input.password, 4096, true);
        if (headerName && !/^[A-Za-z0-9-]{1,100}$/.test(headerName)) throw new Error('The Authentication Secret header name is invalid.');
        if ((type === 'bearerStored' || type === 'headerStored') && !token) throw new Error('The Authentication Secret requires a token or key.');
        if (type === 'headerStored' && !headerName) throw new Error('The Authentication Secret requires a header name.');
        if (type === 'basicStored' && (!username || !password)) throw new Error('The Authentication Secret requires a username and password.');
        return { id: id, name: name, description: description, type: type, headerName: type === 'headerStored' ? headerName : '', token: type === 'basicStored' ? '' : token, username: type === 'basicStored' ? username : '', password: type === 'basicStored' ? password : '' };
    }

    function composeDataSourceOutputExpression(inputExpression, filterExpression, outputExpression) {
        let expression = String(inputExpression || '').trim();
        filterExpression = String(filterExpression || '').trim();
        outputExpression = String(outputExpression || '').trim();
        if (outputExpression === '@') outputExpression = '';
        if (!expression) return '';
        if (filterExpression) expression = expression.replace(/\[\]\s*$/, '') + '[?' + filterExpression + '] | [0]';
        if (outputExpression) expression += /^\[/.test(outputExpression) ? outputExpression : '.' + outputExpression;
        return expression;
    }

    function wildcardFilterParts(filterExpression) {
        const match = /^(.+?)\s*(==|!=|matches)\s*(['"])([\s\S]*)\3\s*$/i.exec(String(filterExpression || '').trim());
        if (!match || !/[*?]/.test(match[4])) return null;
        return { fieldExpression: match[1].trim(), pattern: match[4], negate: match[2] === '!=' };
    }

    function wildcardMatches(value, pattern) {
        let expression = '^';
        for (const character of String(pattern || '')) {
            if (character === '*') expression += '.*';
            else if (character === '?') expression += '.';
            else expression += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        return new RegExp(expression + '$', 'i').test(String(value == null ? '' : value));
    }

    function stripFilterParentheses(expression) {
        expression = String(expression || '').trim();
        while (expression[0] === '(' && expression[expression.length - 1] === ')') {
            let depth = 0, quote = '', escaped = false, wraps = true;
            for (let index = 0; index < expression.length; index++) {
                const character = expression[index];
                if (quote) {
                    if (escaped) escaped = false;
                    else if (character === '\\') escaped = true;
                    else if (character === quote) quote = '';
                    continue;
                }
                if (character === "'" || character === '"') quote = character;
                else if (character === '(') depth++;
                else if (character === ')') {
                    depth--;
                    if (depth === 0 && index < expression.length - 1) { wraps = false; break; }
                }
            }
            if (!wraps || depth !== 0 || quote) break;
            expression = expression.slice(1, -1).trim();
        }
        return expression;
    }

    function findFilterOperator(expression, operator) {
        let depth = 0, quote = '', escaped = false;
        for (let index = 0; index <= expression.length - operator.length; index++) {
            const character = expression[index];
            if (quote) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === quote) quote = '';
                continue;
            }
            if (character === "'" || character === '"') quote = character;
            else if (character === '(') depth++;
            else if (character === ')') depth--;
            else if (depth === 0 && expression.slice(index, index + operator.length) === operator) return index;
        }
        return -1;
    }

    function visitFilterAtoms(filterExpression, visitor) {
        const expression = stripFilterParentheses(filterExpression);
        let operatorIndex = findFilterOperator(expression, '||');
        if (operatorIndex >= 0) {
            visitFilterAtoms(expression.slice(0, operatorIndex), visitor);
            visitFilterAtoms(expression.slice(operatorIndex + 2), visitor);
            return;
        }
        operatorIndex = findFilterOperator(expression, '&&');
        if (operatorIndex >= 0) {
            visitFilterAtoms(expression.slice(0, operatorIndex), visitor);
            visitFilterAtoms(expression.slice(operatorIndex + 2), visitor);
            return;
        }
        if (!expression) throw new Error('Filter expressions cannot contain empty conditions.');
        visitor(expression);
    }

    function validateFilterExpression(filterExpression) {
        if (!String(filterExpression || '').trim()) return;
        visitFilterAtoms(filterExpression, function (expression) {
            const wildcard = wildcardFilterParts(expression);
            runtime.jmespath.compile(wildcard ? wildcard.fieldExpression : expression);
        });
    }

    function evaluateFilterPredicate(entry, filterExpression) {
        const expression = stripFilterParentheses(filterExpression);
        let operatorIndex = findFilterOperator(expression, '||');
        if (operatorIndex >= 0) return evaluateFilterPredicate(entry, expression.slice(0, operatorIndex)) || evaluateFilterPredicate(entry, expression.slice(operatorIndex + 2));
        operatorIndex = findFilterOperator(expression, '&&');
        if (operatorIndex >= 0) return evaluateFilterPredicate(entry, expression.slice(0, operatorIndex)) && evaluateFilterPredicate(entry, expression.slice(operatorIndex + 2));
        const wildcard = wildcardFilterParts(expression);
        if (wildcard) {
            const matched = wildcardMatches(runtime.jmespath.search(entry, wildcard.fieldExpression), wildcard.pattern);
            return wildcard.negate ? !matched : matched;
        }
        return Boolean(runtime.jmespath.search(entry, expression));
    }

    function evaluateDataSourceOutput(response, definition) {
        const inputExpression = String(definition.inputExpression || definition.expression || '@').trim() || '@';
        const filterExpression = String(definition.filterExpression || '').trim();
        const outputExpression = String(definition.outputExpression || '').trim();
        if (!filterExpression) {
            const expression = composeDataSourceOutputExpression(inputExpression, filterExpression, outputExpression);
            return expression ? runtime.jmespath.search(response, expression) : response;
        }
        const input = runtime.jmespath.search(response, inputExpression);
        const entries = Array.isArray(input) ? input : (input == null ? [] : [input]);
        const selected = entries.find(function (entry) {
            return evaluateFilterPredicate(entry, filterExpression);
        });
        if (selected == null) return null;
        if (!outputExpression || outputExpression === '@') return selected;
        return runtime.jmespath.search(selected, outputExpression);
    }

    function sanitizeDataSource(input, usedIds, usedKeys, usedNames, authenticationSecretIds) {
        const id = cleanString(input && input.id, 80, false) || makeId('source');
        const name = cleanString(input.name, 120, false);
        let key = cleanString(input && input.key, 64, false);
        if (!key) { key = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); if (!/^[a-z]/.test(key)) key = 'source_' + key; key = key.slice(0, 64); }
        if (!key || !/^[a-z][A-Za-z0-9_]{0,63}$/.test(key)) throw new Error('Data-source keys must begin with a lowercase letter.');
        if (usedIds.has(id) || usedKeys.has(key.toLowerCase())) throw new Error('Data-source identifiers and keys must be unique.');
        usedIds.add(id); usedKeys.add(key.toLowerCase());
        const normalizedName = name.toLocaleLowerCase();
        if (usedNames.has(normalizedName)) throw new Error('Data Source names must be unique.');
        usedNames.add(normalizedName);
        const sourceType = ['staticList', 'databaseQuery', 'apiQuery'].includes(input.sourceType) ? input.sourceType : 'apiQuery';
        function deriveOutputKey(outputName) { let outputKey = String(outputName || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').replace(/_+/g, '_').replace(/^_+|_+$/g, ''); if (!/^[a-z]/.test(outputKey)) outputKey = 'value_' + outputKey; return outputKey.slice(0, 64); }
        function singleOutput(output) { const outputName = cleanString(output && output.name, 120, false), outputKey = deriveOutputKey(outputName); if (!outputName || !outputKey) throw new Error('The Data Source requires an Output Variable name.'); return { name: outputName, key: outputKey }; }
        const description = cleanString(input.description, 500, true);
        const common = { id: id, key: key, name: name, description: description, sourceType: sourceType, enabled: input.enabled === true };
        if (sourceType === 'staticList') {
            const entries = [];
            (Array.isArray(input.entries) ? input.entries : []).forEach(function (entry) { const entryName = cleanString(entry && entry.name, 512, false), entryValue = cleanString(entry && entry.value, 2048, false); if (!entryName || !entryValue) throw new Error('Every Static List entry requires a Name and Value.'); entries.push({ name: entryName, value: entryValue }); });
            if (!entries.length || entries.length > 2000) throw new Error('A Static List requires between 1 and 2000 entries.');
            common.entryMode = input.entryMode === 'advanced' ? 'advanced' : 'friendly'; common.entries = entries; common.output = singleOutput(input.output); return common;
        }
        if (sourceType === 'databaseQuery') {
            const databaseType = ['mysql', 'mariadb', 'postgresql', 'sqlite'].includes(input.databaseType) ? input.databaseType : '';
            if (!databaseType) throw new Error('Select a supported Database Type.');
            const connectionInput = input.connection && typeof input.connection === 'object' ? input.connection : {};
            const connection = { host: cleanString(connectionInput.host, 253, true), port: Math.max(1, Math.min(65535, Number(connectionInput.port) || (databaseType === 'postgresql' ? 5432 : 3306))), database: cleanString(connectionInput.database, 512, true), username: cleanString(connectionInput.username, 512, true), password: cleanString(connectionInput.password, 4096, true), filename: cleanString(connectionInput.filename, 2048, true), ssl: connectionInput.ssl === true };
            if (databaseType === 'sqlite') { if (!connection.filename || !obj.path.isAbsolute(connection.filename)) throw new Error('SQLite requires an absolute database filename.'); }
            else if (!connection.host || !connection.database || !connection.username) throw new Error('The selected database requires Host, Database and Username connection fields.');
            const queryTemplate = cleanString(input.queryTemplate, 16384, false);
            if (!queryTemplate) throw new Error('Enter a database query.'); validateTemplateSyntax(queryTemplate, 'Database query');
            const queryWithoutTrailingSemicolon = queryTemplate.trim().replace(/;\s*$/, '');
            if (!/^\s*(?:select|with)\b/i.test(queryWithoutTrailingSemicolon) || /;/.test(queryWithoutTrailingSemicolon)) throw new Error('Database Queries must be a single read-only SELECT or WITH statement.');
            const filterExpression = cleanString(input.filterExpression, 1024, true); try { if (filterExpression) runtime.jmespath.compile(filterExpression); } catch (error) { throw new Error('The database Filter expression is invalid.'); }
            const output = singleOutput(input.output); output.mode = ['set', 'row', 'column', 'cell'].includes(input.output && input.output.mode) ? input.output.mode : 'set'; output.rowIndex = Math.max(0, Math.min(999999, Math.trunc(Number(input.output && input.output.rowIndex) || 0))); output.column = cleanString(input.output && input.output.column, 512, true);
            if ((output.mode === 'column' || output.mode === 'cell') && !output.column) throw new Error('The selected Output Variable mode requires a Column.');
            common.databaseType = databaseType; common.connection = connection; common.queryTemplate = queryTemplate; common.filterExpression = filterExpression; common.limit = Math.max(1, Math.min(10000, Math.trunc(Number(input.limit) || 500))); common.output = output; return common;
        }
        const urlTemplate = cleanString(input.urlTemplate, 2048, false);
        const method = String(input.method || 'GET').toUpperCase();
        if (!name || !urlTemplate || !['GET', 'POST'].includes(method)) throw new Error('Each data source requires a name, URL and GET or POST method.');
        validateTemplateSyntax(urlTemplate, 'Data-source URL');
        const auth = input.auth && typeof input.auth === 'object' ? input.auth : {};
        const authSecretId = cleanString(input.authSecretId, 80, true);
        if (authSecretId && !authenticationSecretIds.has(authSecretId)) throw new Error('The selected Authentication Secret is unavailable.');
        const authType = ['none', 'bearerStored', 'headerStored', 'basicStored', 'bearerEnv', 'headerEnv', 'basicEnv'].includes(auth.type) ? auth.type : 'none';
        function envName(v) { v = cleanString(v, 100, true); if (v && !/^[A-Z_][A-Z0-9_]*$/.test(v)) throw new Error('Environment-variable names must use uppercase letters, digits and underscores.'); return v; }
        const authHeaderName = cleanString(auth.headerName, 100, true), storedToken = cleanString(auth.token, 4096, true), storedUsername = cleanString(auth.username, 512, true), storedPassword = cleanString(auth.password, 4096, true);
        if (authHeaderName && !/^[A-Za-z0-9-]{1,100}$/.test(authHeaderName)) throw new Error('The authentication header name is invalid.');
        if ((authType === 'bearerStored' || authType === 'headerStored') && !storedToken) throw new Error('The selected stored authentication requires a token or key.');
        if (authType === 'headerStored' && !authHeaderName) throw new Error('Stored header authentication requires a header name.');
        if (authType === 'basicStored' && (!storedUsername || !storedPassword)) throw new Error('Stored basic authentication requires a username and password.');
        const requestVariables = [], usedVariableKeys = new Set();
        (Array.isArray(input.requestVariables) ? input.requestVariables : []).forEach(function (variable) {
            const variableKey = cleanString(variable && variable.key, 64, false), valueTemplate = cleanString(variable && variable.valueTemplate, 2048, false);
            if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(variableKey)) throw new Error('Request-variable placeholders must begin with a letter or underscore and contain only letters, digits and underscores.');
            if (usedVariableKeys.has(variableKey.toLowerCase())) throw new Error('Request-variable placeholders must be unique.');
            if (['api', 'property', 'device', 'group', 'system', 'user', 'request', 'now'].includes(variableKey.toLowerCase())) throw new Error('Request variable "' + variableKey + '" uses a reserved name.');
            if (!valueTemplate) throw new Error('Request variable "' + variableKey + '" requires a value or formula.');
            validateTemplateSyntax(valueTemplate, 'Request variable "' + variableKey + '"'); usedVariableKeys.add(variableKey.toLowerCase()); requestVariables.push({ key: variableKey, valueTemplate: valueTemplate });
        });
        if (requestVariables.length > 50) throw new Error('No more than 50 request variables are allowed per data source.');
        const hasGlobalOutputFilter = Object.prototype.hasOwnProperty.call(input, 'outputFilterExpression');
        const globalOutputFilterExpression = cleanString(input.outputFilterExpression, 1024, true);
        const outputs = [], usedOutputKeys = new Set(), usedOutputNames = new Set();
        (Array.isArray(input.outputs) ? input.outputs : []).forEach(function (output) {
            const outputName = cleanString(output && output.name, 120, false), outputKey = cleanString(output && output.key, 64, false);
            const hasGuidedFields = output && (output.inputExpression != null || output.filterExpression != null || output.outputExpression != null);
            const legacyExpression = cleanString(output && output.expression, 1024, true);
            const inputExpression = cleanString(hasGuidedFields ? output.inputExpression : (legacyExpression || '@'), 1024, true);
            const filterExpression = hasGlobalOutputFilter ? globalOutputFilterExpression : cleanString(output && output.filterExpression, 1024, true);
            const outputExpression = cleanString(output && output.outputExpression, 1024, true);
            const expression = composeDataSourceOutputExpression(inputExpression, filterExpression, outputExpression);
            if (!outputName || !/^[a-z][a-z0-9_]{0,63}$/.test(outputKey)) throw new Error('Every output variable requires a name and a lowercase internal variable.');
            if (!inputExpression) throw new Error('Every output variable requires an Input.');
            if (usedOutputKeys.has(outputKey) || usedOutputNames.has(outputName.toLowerCase())) throw new Error('Output variable names and internal variables must be unique within a data source.');
            try {
                runtime.jmespath.compile(inputExpression);
                if (outputExpression && outputExpression !== '@') runtime.jmespath.compile(outputExpression);
                validateFilterExpression(filterExpression);
            } catch (error) { throw new Error('Output variable "' + outputName + '" has an invalid Input, Filter, or Output expression.'); }
            usedOutputKeys.add(outputKey); usedOutputNames.add(outputName.toLowerCase()); outputs.push({ name: outputName, key: outputKey, inputExpression: inputExpression, filterExpression: filterExpression, outputExpression: outputExpression, expression: expression });
        });
        if (outputs.length > 100) throw new Error('No more than 100 output variables are allowed per data source.');
        const headers = {};
        if (input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)) Object.keys(input.headers).forEach(function (header) {
            if (!/^[A-Za-z0-9-]{1,100}$/.test(header)) throw new Error('Data source "' + name + '" has an invalid header name.');
            const value = cleanString(String(input.headers[header]), 2048, true); if (/[\r\n]/.test(value)) throw new Error('Data-source headers cannot contain line breaks.'); validateTemplateSyntax(value, 'Data-source header'); headers[header] = value;
        });
        const bodyTemplate = cleanString(input.bodyTemplate, 16384, true); if (bodyTemplate) validateTemplateSyntax(bodyTemplate, 'Data-source body');
        const apiSource = {
            id: id, key: key, name: name, description: description, sourceType: 'apiQuery', enabled: input.enabled === true, method: method, urlTemplate: urlTemplate,
            bodyTemplate: bodyTemplate, responseExpression: outputs.length ? '' : cleanString(input.responseExpression, 1024, true), requestVariables: requestVariables, outputs: outputs,
            tlsVerify: input.tlsVerify !== false, timeoutMs: Math.max(500, Math.min(30000, Number(input.timeoutMs) || 5000)),
            maxBytes: Math.max(1024, Math.min(5242880, Number(input.maxBytes) || 524288)),
            cacheTtlSeconds: Math.max(0, Math.min(86400, Number(input.cacheTtlSeconds) || 300)),
            headers: headers,
            authSecretId: authSecretId,
            auth: { type: authType, token: storedToken, username: storedUsername, password: storedPassword, tokenEnv: envName(auth.tokenEnv), headerName: authHeaderName, usernameEnv: envName(auth.usernameEnv), passwordEnv: envName(auth.passwordEnv) }
        };
        if (hasGlobalOutputFilter) apiSource.outputFilterExpression = globalOutputFilterExpression;
        return apiSource;
    }

    function sanitizeLink(input, usedIds) {
        const id = cleanString(input && input.id, 80, false) || makeId('link');
        if (usedIds.has(id)) throw new Error('Link identifiers must be unique.');
        usedIds.add(id);
        const name = cleanString(input && input.name, 512, false);
        const urlTemplate = cleanString(input && input.urlTemplate, 2048, false);
        if (!name || !urlTemplate) throw new Error('Every direct link requires a name and URL template.');
        const protocol = LINK_PROTOCOLS.has(input && input.protocol) ? input.protocol : 'web';
        const defaultUrlTemplate = cleanString(input && input.defaultUrlTemplate, 2048, true);
        const description = cleanString(input.description, 300, true);
        validateTemplateSyntax(name, 'Link name');
        validateTemplateSyntax(urlTemplate, 'Link URL');
        if (defaultUrlTemplate) validateTemplateSyntax(defaultUrlTemplate, 'Link fallback URL');
        if (description) validateTemplateSyntax(description, 'Link description');
        return {
            id: id,
            name: name,
            urlTemplate: urlTemplate,
            defaultUrlTemplate: defaultUrlTemplate,
            protocol: protocol,
            description: description,
            enabled: input.enabled !== false,
            order: Number.isFinite(Number(input.order)) ? Math.max(-100000, Math.min(100000, Number(input.order))) : 0,
            rule: sanitizeRule(input.rule, 0, { count: 0 })
        };
    }

    function sanitizeDisplayGroup(input, usedIds) {
        const id = cleanString(input && input.id, 80, false) || makeId('group');
        if (usedIds.has(id)) throw new Error('Display-group identifiers must be unique.');
        usedIds.add(id);
        const name = cleanString(input && input.name, 120, false);
        if (!name) throw new Error('Every display group requires a name.');
        validateTemplateSyntax(name, 'Display-group name');
        return { id: id, name: name, description: cleanString(input.description, 300, true), color: cleanString(input.color, 20, true), order: Number(input.order) || 0, rule: sanitizeRule(input.rule, 0, { count: 0 }) };
    }

    function sanitizeLinkProtocol(value) {
        value = (cleanString(value, 64, true) || 'web').toLowerCase();
        return LINK_PROTOCOLS.has(value) || /^[a-z][a-z0-9+.-]*$/.test(value) ? value : 'web';
    }

    function sanitizeItem(input, usedIds) {
        const id = cleanString(input && input.id, 80, false) || makeId('item');
        if (usedIds.has(id)) throw new Error('Quick command and link identifiers must be unique.');
        usedIds.add(id);
        const kind = ITEM_KINDS.has(input && input.kind) ? input.kind : 'link';
        const displayNameTemplate = cleanString(input.displayNameTemplate || input.name, 512, false);
        if (!displayNameTemplate) throw new Error('Every quick command or link requires a display name.');
        validateTemplateSyntax(displayNameTemplate, 'Item display name');
        const displayDescriptionTemplate = cleanString(input.displayDescriptionTemplate || input.description, 500, true);
        if (displayDescriptionTemplate) validateTemplateSyntax(displayDescriptionTemplate, 'Item display description');
        const hintTemplate = cleanString(input.hintTemplate, 500, true);
        if (hintTemplate) validateTemplateSyntax(hintTemplate, 'Item hint');
        const item = {
            id: id, kind: kind, displayGroupId: cleanString(input.displayGroupId, 80, true),
            row: Math.max(1, Math.min(9999, Math.trunc(Number(input.row) || 1))), position: Math.max(1, Math.min(9999, Math.trunc(Number(input.position) || 1))),
            displayNameTemplate: displayNameTemplate, displayDescriptionTemplate: displayDescriptionTemplate,
            color: cleanString(input.color, 20, true), hintTemplate: hintTemplate, ruleMode: input.ruleMode === 'inherit' ? 'inherit' : 'override', enabled: input.enabled !== false,
            showGeneral: input.showGeneral !== false, showTerminal: input.showTerminal === true,
            rule: sanitizeRule(input.rule, 0, { count: 0 })
        };
        if (kind === 'link') {
            const source = input.link || input;
            item.link = {
                urlTemplate: cleanString(source.urlTemplate, 2048, false), defaultUrlTemplate: cleanString(source.defaultUrlTemplate, 2048, true),
                protocol: sanitizeLinkProtocol(source.protocol), target: ['same', 'new'].includes(source.target) ? source.target : 'new'
            };
            if (!item.link.urlTemplate) throw new Error('Every link requires a URL template.');
            validateTemplateSyntax(item.link.urlTemplate, 'Link URL');
            if (item.link.defaultUrlTemplate) validateTemplateSyntax(item.link.defaultUrlTemplate, 'Link fallback URL');
        } else {
            const source = input.command || input;
            item.command = {
                shell: COMMAND_SHELLS.has(source.shell) ? source.shell : 'cmd', mode: COMMAND_MODES.has(source.mode) ? source.mode : 'run',
                commandTemplate: cleanString(source.commandTemplate || source.command, 16384, false), runAs: [0, 1, 2].includes(Number(source.runAs)) ? Number(source.runAs) : 0,
                confirm: source.confirm === true, confirmTemplate: cleanString(source.confirmTemplate, 1000, true)
            };
            if (!item.command.commandTemplate) throw new Error('Every quick command requires command text.');
            validateTemplateSyntax(item.command.commandTemplate, 'Command');
            if (item.command.confirmTemplate) validateTemplateSyntax(item.command.confirmTemplate, 'Command confirmation');
        }
        return item;
    }

    function migrateLegacyLinks(input) {
        if (Array.isArray(input.items)) return input.items;
        return (Array.isArray(input.links) ? input.links : []).map(function (link, index) {
            return { id: link.id, kind: 'link', displayNameTemplate: link.name, displayDescriptionTemplate: link.description, row: 1, position: Number(link.order) || (index + 1), enabled: link.enabled, ruleMode: 'override', rule: link.rule, showGeneral: true, link: { urlTemplate: link.urlTemplate, defaultUrlTemplate: link.defaultUrlTemplate, protocol: link.protocol, target: 'new' } };
        });
    }

    function sanitizeConfig(input, domainId, userId) {
        if (!input || typeof input !== 'object') throw new Error('The configuration is invalid.');
        const propertiesInput = Array.isArray(input.properties) ? input.properties : [];
        const linksInput = Array.isArray(input.links) ? input.links : [];
        const itemsInput = migrateLegacyLinks(input);
        const groupsInput = Array.isArray(input.displayGroups) ? input.displayGroups : [];
        const authenticationSecretsInput = Array.isArray(input.authenticationSecrets) ? input.authenticationSecrets : [];
        const sourcesInput = Array.isArray(input.dataSources) ? input.dataSources : [];
        if (propertiesInput.length > MAX_DEFINITIONS) throw new Error('No more than ' + MAX_DEFINITIONS + ' property definitions are allowed.');
        if (linksInput.length > MAX_LINKS) throw new Error('No more than ' + MAX_LINKS + ' direct-link definitions are allowed.');
        if (itemsInput.length > MAX_ITEMS) throw new Error('No more than ' + MAX_ITEMS + ' quick commands and links are allowed.');
        if (sourcesInput.length > MAX_DATA_SOURCES) throw new Error('No more than ' + MAX_DATA_SOURCES + ' data sources are allowed.');
        if (authenticationSecretsInput.length > MAX_AUTHENTICATION_SECRETS) throw new Error('No more than ' + MAX_AUTHENTICATION_SECRETS + ' Authentication Secrets are allowed.');
        const usedKeys = new Set();
        const usedPropertyIds = new Set(), usedPropertyLabels = new Set();
        const usedLinkIds = new Set();
        const usedSourceIds = new Set(), usedSourceKeys = new Set(), usedSourceNames = new Set();
        const usedAuthenticationSecretIds = new Set(), usedAuthenticationSecretNames = new Set();
        const usedItemIds = new Set(), usedGroupIds = new Set();
        const authenticationSecrets = authenticationSecretsInput.map(function (item) { return sanitizeAuthenticationSecret(item, usedAuthenticationSecretIds, usedAuthenticationSecretNames); });
        return {
            _id: configId(domainId),
            type: CONFIG_TYPE,
            domain: domainId,
            schemaVersion: 3,
            revision: Number.isInteger(input.revision) ? input.revision : 0,
            updated: nowIso(),
            updatedBy: userId,
            properties: propertiesInput.map(function (item) { return sanitizeProperty(item, usedKeys, usedPropertyIds, usedPropertyLabels); }),
            links: [],
            displayGroups: groupsInput.map(function (item) { return sanitizeDisplayGroup(item, usedGroupIds); }),
            items: itemsInput.map(function (item) { return sanitizeItem(item, usedItemIds); }),
            authenticationSecrets: authenticationSecrets,
            dataSources: sourcesInput.map(function (item) { return sanitizeDataSource(item, usedSourceIds, usedSourceKeys, usedSourceNames, usedAuthenticationSecretIds); })
        };
    }

    function evaluateRule(rule, context) {
        if (!rule) return true;
        if (rule.kind === 'condition') {
            let matches = false;
            if (rule.field === 'group') matches = context.groupId === rule.value;
            if (rule.field === 'device') matches = context.nodeId === rule.value;
            if (rule.field === 'tag') matches = context.tags.indexOf(rule.value) >= 0;
            if (rule.field === 'user') matches = context.userId === rule.value;
            if (rule.field === 'userGroup') matches = context.userGroups.indexOf(rule.value) >= 0;
            if (rule.field === 'pluginGroup') matches = context.pluginGroups.indexOf(rule.value) >= 0;
            if (rule.field === 'os') matches = context.os === rule.value;
            if (rule.field === 'connected') matches = String(context.connected) === String(rule.value);
            return rule.op === 'isNot' ? !matches : matches;
        }
        const children = Array.isArray(rule.children) ? rule.children : [];
        if (rule.op === 'or') return children.length > 0 && children.some(function (child) { return evaluateRule(child, context); });
        if (rule.op === 'not') return !children.some(function (child) { return evaluateRule(child, context); });
        return children.every(function (child) { return evaluateRule(child, context); });
    }

    function effectiveItemRule(item, groupsById) {
        const localGroup = groupsById && groupsById[item && item.displayGroupId];
        return visibilityRule(item && item.ruleMode === 'inherit' && localGroup ? localGroup.rule : (item && item.rule)) || defaultRule();
    }

    function propertyHasValue(value) { return value !== undefined && value !== null && value !== ''; }
    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        const parts = value.split('-').map(Number);
        const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        return date.getUTCFullYear() === parts[0] && date.getUTCMonth() === parts[1] - 1 && date.getUTCDate() === parts[2];
    }

    function validateValue(definition, input) {
        if (input === undefined || input === null || input === '') return null;
        if ((definition.type === 'multiselect' || definition.type === 'tags') && !Array.isArray(input)) throw new Error(definition.label + ' must contain a list of values.');
        let output;
        if (definition.type === 'boolean') {
            if (input === true || input === false) output = input;
            else if (input === 'true') output = true;
            else if (input === 'false') output = false;
            else throw new Error(definition.label + ' must be Yes, No, or Not set.');
        } else if (definition.type === 'number' || definition.type === 'integer' || definition.type === 'range') {
            const number = Number(input);
            if (!Number.isFinite(number)) throw new Error(definition.label + ' must be a number.');
            if (definition.type === 'integer' && !Number.isInteger(number)) throw new Error(definition.label + ' must be a whole number.');
            if (definition.minimum != null && number < definition.minimum) throw new Error(definition.label + ' must be at least ' + definition.minimum + '.');
            if (definition.maximum != null && number > definition.maximum) throw new Error(definition.label + ' must be no more than ' + definition.maximum + '.');
            output = number;
        } else if (definition.type === 'multiselect' || definition.type === 'tags') {
            output = input.map(function (value) { const cleaned = cleanString(String(value), 512, false); if (!cleaned) throw new Error(definition.label + ' contains an invalid value.'); return cleaned; });
            if (definition.type === 'multiselect' && output.some(function (value) { return !definition.options.some(function (option) { return option.value === value; }); })) throw new Error(definition.label + ' has an invalid selection.');
        } else {
            const text = cleanString(String(input), definition.type === 'multiline' ? 8192 : (definition.type === 'url' ? 2048 : 512), false);
            if (!text) throw new Error(definition.label + ' is invalid or too long.');
            if (definition.type === 'url') {
                let parsed;
                try { parsed = new URL(text); } catch (ex) { throw new Error(definition.label + ' must be a complete HTTP or HTTPS URL.'); }
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(definition.label + ' must use HTTP or HTTPS.');
                output = parsed.toString();
            } else {
                if (definition.type === 'date' && !validDate(text)) throw new Error(definition.label + ' must be a valid date.');
                if (definition.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error(definition.label + ' must be a valid email address.');
                if (definition.type === 'select' && !definition.optionSource && !definition.options.some(function (option) { return option.value === text; })) throw new Error(definition.label + ' has an invalid selection.');
                output = text;
            }
        }
        const schemaResult = runtime.validate(schemaForProperty(definition), output);
        if (!schemaResult.ok) throw new Error((definition.validation && definition.validation.message) || (definition.label + ' is invalid: ' + (schemaResult.errors[0] && schemaResult.errors[0].message || 'schema validation failed') + '.'));
        output = schemaResult.value;
        const validation = definition.validation || {};
        const validationText = String(output);
        const message = validation.message || (definition.label + ' does not match its validation rules.');
        if (validation.minimumLength != null && validationText.length < validation.minimumLength) throw new Error(message);
        if (validation.maximumLength != null && validationText.length > validation.maximumLength) throw new Error(message);
        if (validation.pattern) {
            let expression;
            try { expression = new RegExp(validation.pattern, validation.flags || ''); } catch (ex) { throw new Error(definition.label + ' has an invalid validation expression.'); }
            if (!expression.test(validationText)) throw new Error(message);
        }
        return output;
    }

    const MISSING = Symbol('missing');

    function expressionFunction(name, args, context) {
        name = name.toLowerCase();
        if (name === 'now') return context.now;
        if (name === 'coalesce') {
            for (let i = 0; i < args.length; i++) if (args[i] !== MISSING && propertyHasValue(args[i])) return args[i];
            return MISSING;
        }
        if (args.some(function (value) { return value === MISSING; })) return MISSING;
        const string = function (value) { return value == null ? '' : String(value); };
        const number = function (value) { const result = Number(value); return Number.isFinite(result) ? result : MISSING; };
        if (name === 'concat') return args.map(string).join('');
        if (name === 'upper') return args.length === 1 ? string(args[0]).toUpperCase() : MISSING;
        if (name === 'lower') return args.length === 1 ? string(args[0]).toLowerCase() : MISSING;
        if (name === 'proper') return args.length === 1 ? string(args[0]).toLowerCase().replace(/\b[a-z]/g, function (letter) { return letter.toUpperCase(); }) : MISSING;
        if (name === 'trim') return args.length === 1 ? string(args[0]).trim() : MISSING;
        if (name === 'len') return args.length === 1 ? string(args[0]).length : MISSING;
        if (name === 'left') { const count = number(args[1]); return args.length === 2 && count !== MISSING ? string(args[0]).slice(0, Math.max(0, count)) : MISSING; }
        if (name === 'right') { const count = number(args[1]); return args.length === 2 && count !== MISSING ? string(args[0]).slice(-Math.max(0, count)) : MISSING; }
        if (name === 'substring') {
            const start = number(args[1]);
            const length = args.length > 2 ? number(args[2]) : null;
            if ((args.length !== 2 && args.length !== 3) || start === MISSING || length === MISSING) return MISSING;
            return length == null ? string(args[0]).substring(Math.max(0, start)) : string(args[0]).substring(Math.max(0, start), Math.max(0, start) + Math.max(0, length));
        }
        if (name === 'add') {
            const values = args.map(number); if (values.some(function (value) { return value === MISSING; })) return MISSING;
            return values.reduce(function (total, value) { return total + value; }, 0);
        }
        if (name === 'subtract' || name === 'sub') { const a = number(args[0]); const b = number(args[1]); return args.length === 2 && a !== MISSING && b !== MISSING ? a - b : MISSING; }
        if (name === 'multiply' || name === 'mul') {
            const values = args.map(number); if (!values.length || values.some(function (value) { return value === MISSING; })) return MISSING;
            return values.reduce(function (total, value) { return total * value; }, 1);
        }
        if (name === 'divide' || name === 'div') { const a = number(args[0]); const b = number(args[1]); return args.length === 2 && a !== MISSING && b !== MISSING && b !== 0 ? a / b : MISSING; }
        if (name === 'mod') { const a = number(args[0]); const b = number(args[1]); return args.length === 2 && a !== MISSING && b !== MISSING && b !== 0 ? a % b : MISSING; }
        if (name === 'round') { const value = number(args[0]); const places = args.length > 1 ? number(args[1]) : 0; if (value === MISSING || places === MISSING) return MISSING; const scale = Math.pow(10, places); return Math.round(value * scale) / scale; }
        if (name === 'abs') { const value = number(args[0]); return args.length === 1 && value !== MISSING ? Math.abs(value) : MISSING; }
        throw new Error('Unknown formula function "' + name + '".');
    }

    function evaluateExpression(source, context, values, syntaxOnly) {
        if (syntaxOnly) { runtime.check(source); return 'x'; }
        const jexlContext = {
            property: values || {},
            device: { name: context.deviceName, hostname: context.hostname, ip: context.ip, id: context.nodeId },
            group: { name: context.groupName, id: context.groupId },
            user: { id: context.userId, name: context.userName, email: context.userEmail, groups: context.userGroups },
            system: context.system || {},
            api: context.api || {},
            request: context.request || {}
        };
        Object.keys(context.request || {}).forEach(function (key) { if (!Object.prototype.hasOwnProperty.call(jexlContext, key)) jexlContext[key] = context.request[key]; });
        try {
            const evaluated = runtime.evaluate(source, jexlContext);
            return evaluated === undefined ? MISSING : evaluated;
        } catch (error) {
            const match = /Jexl Function ([^ ]+) is not defined/.exec(error.message || '');
            throw new Error(match ? ('Unknown formula function "' + match[1] + '".') : error.message);
        }
        /* Legacy parser retained below as a rollback-safe reference; JEXL now handles evaluation. */
        let position = 0;
        function skip() { while (/\s/.test(source[position] || '')) position++; }
        function readIdentifier() {
            skip(); const start = position;
            if (!/[A-Za-z_]/.test(source[position] || '')) throw new Error('Expected a variable or function at position ' + (position + 1) + '.');
            position++; while (/[A-Za-z0-9_.]/.test(source[position] || '')) position++;
            return source.slice(start, position);
        }
        function readString() {
            const quote = source[position++]; let output = '';
            while (position < source.length) {
                const character = source[position++];
                if (character === quote) return output;
                if (character === '\\') {
                    if (position >= source.length) break;
                    const escaped = source[position++];
                    output += escaped === 'n' ? '\n' : (escaped === 'r' ? '\r' : (escaped === 't' ? '\t' : escaped));
                } else output += character;
            }
            throw new Error('Unterminated string in formula.');
        }
        function resolveVariable(identifier) {
            if (syntaxOnly) return 'x';
            if (identifier.startsWith('property.')) return Object.prototype.hasOwnProperty.call(values, identifier.slice(9)) ? values[identifier.slice(9)] : MISSING;
            const variables = {
                'device.name': context.deviceName, 'device.hostname': context.hostname, 'device.ip': context.ip, 'device.id': context.nodeId,
                'group.name': context.groupName, 'group.id': context.groupId,
                'system.serverName': context.system && context.system.serverName,
                'system.dnsName': context.system && context.system.dnsName,
                'system.serverUrl': context.system && context.system.serverUrl,
                'system.domain': context.system && context.system.domain
            };
            return Object.prototype.hasOwnProperty.call(variables, identifier) && propertyHasValue(variables[identifier]) ? variables[identifier] : MISSING;
        }
        function primary() {
            skip(); const character = source[position];
            if (character === '"' || character === "'") return readString();
            if (character === '(') { position++; const value = additive(); skip(); if (source[position++] !== ')') throw new Error('Expected closing parenthesis in formula.'); return value; }
            if (/[0-9.]/.test(character || '')) {
                const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(position));
                if (!match) throw new Error('Invalid number in formula.');
                position += match[0].length;
                const value = Number(match[0]); if (!Number.isFinite(value)) throw new Error('Invalid number in formula.'); return value;
            }
            const identifier = readIdentifier(); skip();
            if (source[position] !== '(') {
                if (identifier === 'true') return true; if (identifier === 'false') return false; if (identifier === 'null') return null;
                return resolveVariable(identifier);
            }
            position++; const args = []; skip();
            if (source[position] !== ')') {
                while (true) { args.push(additive()); skip(); if (source[position] === ',') { position++; continue; } break; }
            }
            if (source[position++] !== ')') throw new Error('Expected closing parenthesis after function arguments.');
            return expressionFunction(identifier, args, context);
        }
        function unary() { skip(); if (source[position] === '-') { position++; const value = unary(); const number = Number(value); return value === MISSING || !Number.isFinite(number) ? MISSING : -number; } return primary(); }
        function multiplicative() {
            let value = unary();
            while (true) { skip(); const operator = source[position]; if (operator !== '*' && operator !== '/' && operator !== '%') break; position++; const right = unary(); if (value === MISSING || right === MISSING) value = MISSING; else { const a = Number(value), b = Number(right); value = !Number.isFinite(a) || !Number.isFinite(b) || ((operator === '/' || operator === '%') && b === 0) ? MISSING : (operator === '*' ? a * b : (operator === '/' ? a / b : a % b)); } }
            return value;
        }
        function additive() {
            let value = multiplicative();
            while (true) { skip(); const operator = source[position]; if (operator !== '+' && operator !== '-') break; position++; const right = multiplicative(); if (value === MISSING || right === MISSING) value = MISSING; else if (operator === '+' && (typeof value === 'string' || typeof right === 'string')) value = String(value) + String(right); else { const a = Number(value), b = Number(right); value = !Number.isFinite(a) || !Number.isFinite(b) ? MISSING : (operator === '+' ? a + b : a - b); } }
            return value;
        }
        const result = additive(); skip();
        if (position !== source.length) throw new Error('Unexpected formula content at position ' + (position + 1) + '.');
        return result;
    }

    function validateTemplateSyntax(template, fieldName) {
        if (!template) return;
        let match; const expression = /\{([^{}]+)\}/g;
        while ((match = expression.exec(template)) !== null) {
            try { evaluateExpression(match[1], { now: '2026-01-01T00:00:00.000Z' }, {}, true); } catch (error) { throw new Error(fieldName + ': ' + error.message); }
        }
        const stripped = template.replace(expression, '');
        if (/[{}]/.test(stripped)) throw new Error(fieldName + ': unmatched formula brace.');
    }

    function renderTemplate(template, context, values) {
        if (typeof template !== 'string') return null;
        let missing = false;
        const result = template.replace(/\{([^{}]+)\}/g, function (match, expression) {
            const value = evaluateExpression(expression, context, values || {}, false);
            if (value === MISSING || value === undefined || value === null) { missing = true; return ''; }
            return String(value);
        });
        if (missing || /[{}]/.test(result) || result.length > 8192) return null;
        return result;
    }

    function systemContext(session) {
        const domain = (session && session.domain) || {};
        const settings = (obj.meshServer.config && obj.meshServer.config.settings) || {};
        const dnsName = domain.dns || settings.cert || (obj.meshServer.args && obj.meshServer.args.cert) || '';
        let serverUrl = dnsName ? ('https://' + dnsName + '/') : '';
        if (domain.url && /^https?:\/\//i.test(domain.url)) serverUrl = domain.url.replace(/\/?$/, '/');
        return {
            serverName: domain.title || domain.title2 || dnsName || 'MeshCentral',
            dnsName: dnsName,
            serverUrl: serverUrl,
            domain: domain.id || ''
        };
    }

    function contextFor(node, mesh, session) {
        const agentId = node.agent && Number(node.agent.id);
        let os = 'unknown';
        if ([1, 2, 3, 4, 5, 6, 7, 13, 24, 34].includes(agentId) || /windows/i.test(node.osdesc || '')) os = 'windows';
        else if ([14, 16, 29, 10005].includes(agentId) || /mac\s?os|os\s?x/i.test(node.osdesc || '')) os = 'macos';
        else if (node.agent || /linux|unix|bsd/i.test(node.osdesc || '')) os = 'linux';
        const user = session && session.user || {};
        return {
            nodeId: node._id,
            groupId: node.meshid || '',
            tags: Array.isArray(node.tags) ? node.tags.slice() : [],
            deviceName: node.name || '',
            hostname: node.host || node.name || '',
            ip: node.host || '',
            groupName: mesh ? (mesh.name || '') : '',
            userId: user._id || '', userName: user.name || '', userEmail: user.email || '',
            userGroups: Array.isArray(user.groups) ? user.groups.slice() : Object.keys(user.links || {}).filter(function (key) { return key.indexOf('ugrp/') === 0; }),
            pluginGroups: Array.isArray(node.pluginGroups) ? node.pluginGroups.slice() : [],
            os: os, connected: Boolean((node.conn || 0) & 1),
            system: session ? systemContext(session) : (node.system || {}),
            now: new Date().toISOString(),
            api: {}
        };
    }

    function contextWithoutDevice(session) {
        return contextFor({ _id: '', meshid: '', name: '', host: '', tags: [], pluginGroups: [], conn: 0 }, null, session);
    }

    function schemaForProperty(definition, options) {
        let schema;
        if (definition.schema) schema = clone(definition.schema);
        else if (definition.type === 'boolean') schema = { type: ['boolean', 'null'] };
        else if (definition.type === 'number' || definition.type === 'range') schema = { type: 'number' };
        else if (definition.type === 'integer') schema = { type: 'integer' };
        else if (definition.type === 'multiselect' || definition.type === 'tags') schema = { type: 'array', items: { type: 'string' }, uniqueItems: true };
        else schema = { type: 'string' };
        schema.title = definition.label;
        if (definition.description) schema.description = definition.description;
        const formatMap = { url: 'url', email: 'email', date: 'date', time: 'time', datetime: 'date-time' };
        if (formatMap[definition.type]) schema.format = formatMap[definition.type];
        if (definition.type === 'multiline') schema.format = 'textarea';
        if (definition.type === 'password') schema.format = 'password';
        if (definition.type === 'tel') schema.format = 'tel';
        if (definition.type === 'color') schema.format = 'color';
        if (definition.type === 'range') schema.format = 'range';
        if (definition.type === 'month') schema.pattern = '^\\d{4}-(0[1-9]|1[0-2])$';
        if (definition.type === 'week') schema.pattern = '^\\d{4}-W(0[1-9]|[1-4]\\d|5[0-3])$';
        if (definition.minimum != null) schema.minimum = definition.minimum;
        if (definition.maximum != null) schema.maximum = definition.maximum;
        if (definition.step != null) schema.multipleOf = definition.step;
        if (definition.validation) {
            if (definition.validation.minimumLength != null) schema.minLength = definition.validation.minimumLength;
            if (definition.validation.maximumLength != null) schema.maxLength = definition.validation.maximumLength;
            if (definition.validation.pattern && !definition.validation.flags) schema.pattern = definition.validation.pattern;
        }
        const list = Array.isArray(options) ? options : definition.options;
        if (Array.isArray(list) && list.length) {
            if (definition.type === 'multiselect') { schema.items = { type: 'string', enum: list.map(function (o) { return o.value; }) }; schema.items['x-enumTitles'] = list.map(function (o) { return o.label; }); }
            else { schema.enum = list.map(function (o) { return o.value; }); schema['x-enumTitles'] = list.map(function (o) { return o.label; }); }
        }
        if (definition.valueTemplate) schema.readOnly = true;
        return schema;
    }

    function formSchema(definitions, dynamicOptions) {
        const schema = { type: 'object', properties: {} };
        definitions.forEach(function (definition) {
            schema.properties[definition.key] = schemaForProperty(definition, dynamicOptions && dynamicOptions[definition.key]);
        });
        return schema;
    }

    function dataSourceDependencies(source) {
        const dependencies = new Set(), templates = [source.urlTemplate || '', source.bodyTemplate || '', source.queryTemplate || ''];
        (source.requestVariables || []).forEach(function (variable) { templates.push(variable.valueTemplate || ''); });
        Object.keys(source.headers || {}).forEach(function (name) { templates.push(String(source.headers[name] || '')); });
        templates.forEach(function (template) {
            let match; const expression = /\bapi\.([a-z][a-z0-9_]{0,63})\b/gi;
            while ((match = expression.exec(template)) !== null) dependencies.add(match[1].toLowerCase());
        });
        return Array.from(dependencies);
    }

    function dataSourceReferenceUsage(config, source) {
        const usages = [], seen = new Set(), sourceKey = String(source && source.key || '').toLowerCase();
        if (!sourceKey) return usages;
        const outputNames = new Map();
        (source.outputs || []).forEach(function (output) { outputNames.set(String(output.key || '').toLowerCase(), output.name || output.key); });
        if (source.output && source.output.key) outputNames.set(String(source.output.key).toLowerCase(), source.output.name || source.output.key);
        const escapedKey = sourceKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        function add(outputKey, location) {
            outputKey = String(outputKey || '').toLowerCase();
            const reference = 'api.' + sourceKey + (outputKey ? '.' + outputKey : '');
            const identity = reference + '|' + location;
            if (seen.has(identity)) return;
            seen.add(identity);
            usages.push({ outputKey: outputKey, outputName: outputNames.get(outputKey) || (outputKey || 'Data Source result'), reference: reference, location: location });
        }
        function scan(location, value) {
            if (typeof value !== 'string' || !value) return;
            const expression = new RegExp('\\bapi\\.' + escapedKey + '(?:\\.([a-z][a-z0-9_]{0,63}))?', 'gi');
            let match;
            while ((match = expression.exec(value)) !== null) add(match[1] || '', location);
        }
        (config.dataSources || []).forEach(function (candidate) {
            if (candidate.id === source.id) return;
            const prefix = 'Data Source "' + candidate.name + '"';
            scan(prefix + ' URL', candidate.urlTemplate);
            scan(prefix + ' request body', candidate.bodyTemplate);
            scan(prefix + ' database query', candidate.queryTemplate);
            (candidate.requestVariables || []).forEach(function (variable) { scan(prefix + ' Request Variable "' + variable.key + '"', variable.valueTemplate); });
            Object.keys(candidate.headers || {}).forEach(function (name) { scan(prefix + ' Header "' + name + '"', candidate.headers[name]); });
        });
        (config.properties || []).forEach(function (property) {
            const prefix = 'Property "' + property.label + '"';
            scan(prefix + ' Computed Value', property.valueTemplate);
            scan(prefix + ' Default Value', property.defaultTemplate);
            if (property.optionSource && String(property.optionSource.sourceKey || '').toLowerCase() === sourceKey) add('', prefix + ' selectable-list options');
        });
        (config.items || []).forEach(function (item) {
            const prefix = 'Link "' + item.displayNameTemplate + '"';
            scan(prefix + ' Name', item.displayNameTemplate);
            scan(prefix + ' Description', item.displayDescriptionTemplate);
            scan(prefix + ' Hint', item.hintTemplate);
            if (item.link) { scan(prefix + ' URL', item.link.urlTemplate); scan(prefix + ' fallback URL', item.link.defaultUrlTemplate); }
            if (item.command) { scan(prefix + ' Command', item.command.commandTemplate); scan(prefix + ' confirmation', item.command.confirmTemplate); }
        });
        (config.displayGroups || []).forEach(function (group) {
            scan('Link Group "' + group.name + '" Name', group.name);
            scan('Link Group "' + group.name + '" Description', group.description);
        });
        return usages;
    }

    function dataSourceDeletionError(source, usages) {
        if (!usages.length) return '';
        return 'Data Source "' + source.name + '" cannot be deleted because its outputs are still in use:\n' + usages.map(function (usage) {
            return '- "' + usage.outputName + '" (' + usage.reference + ') — ' + usage.location;
        }).join('\n');
    }

    function dataSourceExecutionOrder(sources) {
        const byKey = new Map(), pending = new Map(), ordered = [];
        sources.forEach(function (source) { byKey.set(source.key.toLowerCase(), source); pending.set(source.key.toLowerCase(), source); });
        while (pending.size) {
            let progressed = false;
            for (const entry of Array.from(pending.entries())) {
                const key = entry[0], source = entry[1], dependencies = dataSourceDependencies(source);
                const missing = dependencies.find(function (dependency) { return !byKey.has(dependency); });
                if (missing) throw new Error('Data source "' + source.name + '" depends on unavailable data source "' + missing + '". Ensure it exists and is enabled.');
                if (dependencies.includes(key)) throw new Error('Data source "' + source.name + '" cannot depend on its own outputs.');
                if (dependencies.some(function (dependency) { return pending.has(dependency); })) continue;
                ordered.push(source); pending.delete(key); progressed = true;
            }
            if (!progressed) throw new Error('Data source dependencies contain a circular reference: ' + Array.from(pending.values()).map(function (source) { return source.name; }).join(', ') + '.');
        }
        return ordered;
    }

    function dataSourceDependencyClosure(sources, targetKey) {
        const byKey = new Map(), selected = new Set();
        sources.forEach(function (source) { byKey.set(String(source.key || '').toLowerCase(), source); });
        function add(key) {
            key = String(key || '').toLowerCase();
            if (selected.has(key)) return;
            const source = byKey.get(key);
            if (!source) throw new Error('Data source dependency "' + key + '" is unavailable.');
            selected.add(key);
            dataSourceDependencies(source).forEach(add);
        }
        add(targetKey);
        return sources.filter(function (source) { return selected.has(String(source.key || '').toLowerCase()); });
    }

    function fetchFailureMessage(source, url, error) {
        const chain = [], seen = new Set();
        let current = error;
        while (current && typeof current === 'object' && !seen.has(current) && chain.length < 5) { chain.push(current); seen.add(current); current = current.cause; }
        const code = chain.map(function (entry) { return entry.code || entry.errno; }).find(Boolean);
        const name = chain.map(function (entry) { return entry.name; }).find(Boolean);
        const rawMessage = chain.map(function (entry) { return entry.message; }).filter(Boolean).pop() || 'No additional technical detail was supplied.';
        let explanation = 'The request could not be completed.';
        if (['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code)) explanation = 'TLS certificate verification failed. Trust the issuing CA in the MeshCentral container, correct the certificate, or untick Verify TLS Certificate for this trusted internal Data Source.';
        else if (code === 'ECONNREFUSED') explanation = 'The destination rejected the connection. Confirm that the service is listening on the selected host and port and that no firewall is rejecting it.';
        else if (code === 'ENOTFOUND') explanation = 'DNS could not resolve the destination hostname from the MeshCentral container.';
        else if (code === 'EAI_AGAIN') explanation = 'DNS resolution temporarily failed from the MeshCentral container.';
        else if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || name === 'AbortError') explanation = 'The request timed out before the destination responded. Check routing, firewall rules and the configured timeout.';
        else if (code === 'ECONNRESET') explanation = 'The destination reset the connection before the response completed.';
        const detailParts = [];
        if (code) detailParts.push('code ' + code);
        chain.forEach(function (entry) {
            if (entry.address) detailParts.push('address ' + entry.address);
            if (entry.port) detailParts.push('port ' + entry.port);
            if (entry.syscall) detailParts.push('operation ' + entry.syscall);
        });
        const uniqueDetails = Array.from(new Set(detailParts));
        const safeMessage = cleanString(rawMessage, 500, false).replace(/[\r\n]+/g, ' ');
        return 'Data source "' + source.name + '" could not fetch ' + url.protocol + '//' + url.host + '. ' + explanation + ' Cause: ' + safeMessage + (uniqueDetails.length ? ' (' + uniqueDetails.join(', ') + ')' : '') + '.';
    }

    function inspectTlsCertificate(rawUrl) {
        return new Promise(function (resolve, reject) {
            let url;
            try { url = new URL(rawUrl); } catch (error) { reject(new Error('Enter a valid HTTPS URL before viewing its certificate.')); return; }
            if (url.protocol !== 'https:') { reject(new Error('TLS certificate details are available only for HTTPS URLs.')); return; }
            if (url.username || url.password) { reject(new Error('Credentials must not be embedded in the URL.')); return; }
            const port = Number(url.port) || 443, options = { host: url.hostname, port: port, rejectUnauthorized: false };
            if (!obj.net.isIP(url.hostname)) options.servername = url.hostname;
            let settled = false;
            const socket = obj.tls.connect(options);
            function finish(error, result) {
                if (settled) return;
                settled = true;
                socket.destroy();
                if (error) reject(error); else resolve(result);
            }
            socket.setTimeout(10000, function () { const error = new Error('TLS certificate inspection timed out.'); error.code = 'ETIMEDOUT'; finish(error); });
            socket.once('error', function (error) { finish(error); });
            socket.once('secureConnect', function () {
                const certificate = socket.getPeerCertificate(true), cipher = socket.getCipher() || {};
                if (!certificate || !Object.keys(certificate).length) { finish(new Error('The server did not provide a TLS certificate.')); return; }
                finish(null, {
                    host: url.hostname,
                    port: port,
                    authorised: socket.authorized === true,
                    verificationResult: socket.authorized ? 'Certificate verified successfully.' : String(socket.authorizationError && (socket.authorizationError.message || socket.authorizationError.code || socket.authorizationError) || 'Certificate could not be verified.'),
                    subject: certificate.subject || {},
                    issuer: certificate.issuer || {},
                    subjectAlternativeNames: certificate.subjectaltname || '',
                    validFrom: certificate.valid_from || '',
                    validTo: certificate.valid_to || '',
                    serialNumber: certificate.serialNumber || '',
                    fingerprintSHA256: certificate.fingerprint256 || '',
                    protocol: socket.getProtocol() || '',
                    cipher: cipher.standardName || cipher.name || ''
                });
            });
        });
    }

    function selectDatabaseOutput(rows, output) {
        const mode = output.mode || 'set', rowIndex = Math.max(0, Number(output.rowIndex) || 0), column = output.column;
        if (mode === 'set') return rows;
        if (mode === 'row') return rows[rowIndex] == null ? null : rows[rowIndex];
        if (mode === 'column') return rows.map(function (row) { return row && Object.prototype.hasOwnProperty.call(row, column) ? row[column] : null; });
        if (mode === 'cell') return rows[rowIndex] && Object.prototype.hasOwnProperty.call(rows[rowIndex], column) ? rows[rowIndex][column] : null;
        return rows;
    }

    async function executeDatabaseQuery(source, context, values, connectionOnly) {
        const connection = source.connection || {}, timeout = 10000;
        if (source.databaseType === 'mysql' || source.databaseType === 'mariadb') {
            const client = await runtime.mysql.createConnection({ host: connection.host, port: connection.port, user: connection.username, password: connection.password, database: connection.database, connectTimeout: timeout, ssl: connection.ssl ? {} : undefined });
            try { if (connectionOnly) { await client.query('SELECT 1 AS connection_test'); return []; } const query = renderTemplate(source.queryTemplate, context, values || {}); if (query == null) throw new Error('Database query variables could not be resolved.'); const result = await client.query({ sql: query, timeout: timeout }); return Array.isArray(result[0]) ? result[0] : []; } finally { await client.end(); }
        }
        if (source.databaseType === 'postgresql') {
            const client = new runtime.pg.Client({ host: connection.host, port: connection.port, user: connection.username, password: connection.password, database: connection.database, ssl: connection.ssl ? { rejectUnauthorized: false } : false, connectionTimeoutMillis: timeout, query_timeout: timeout });
            await client.connect(); try { if (connectionOnly) { await client.query('SELECT 1 AS connection_test'); return []; } const query = renderTemplate(source.queryTemplate, context, values || {}); if (query == null) throw new Error('Database query variables could not be resolved.'); const result = await client.query(query); return result.rows || []; } finally { await client.end(); }
        }
        if (source.databaseType === 'sqlite') {
            if (!sqlJsPromise) sqlJsPromise = runtime.initSqlJs();
            const SQL = await sqlJsPromise, bytes = await obj.fs.promises.readFile(connection.filename), database = new SQL.Database(bytes);
            try { if (connectionOnly) { database.exec('SELECT 1 AS connection_test'); return []; } const query = renderTemplate(source.queryTemplate, context, values || {}); if (query == null) throw new Error('Database query variables could not be resolved.'); const result = database.exec(query); if (!result.length) return []; return result[0].values.map(function (valuesRow) { const row = {}; result[0].columns.forEach(function (column, index) { row[column] = valuesRow[index]; }); return row; }); } finally { database.close(); }
        }
        throw new Error('Unsupported database type.');
    }

    async function fetchDataSources(config, context, values) {
        const output = {};
        const applicableSources = (config.dataSources || []).filter(function (source) { return source.enabled !== false; });
        for (const source of dataSourceExecutionOrder(applicableSources)) {
            const sourceContext = Object.assign({}, context, { request: {}, api: Object.assign({}, context.api || {}, output) });
            if (source.sourceType === 'staticList') {
                output[source.key] = {}; output[source.key][source.output.key] = clone(source.entries || []); continue;
            }
            if (source.sourceType === 'databaseQuery') {
                const queryCacheKey = source.id + '|' + context.nodeId + '|' + renderTemplate(source.queryTemplate, sourceContext, values || {});
                const queryCached = await apiCache.get(queryCacheKey);
                if (queryCached !== undefined) { output[source.key] = queryCached; continue; }
                let rows = await executeDatabaseQuery(source, sourceContext, values || {}, false);
                if (source.filterExpression) rows = runtime.jmespath.search(rows, source.filterExpression);
                if (!Array.isArray(rows)) rows = rows == null ? [] : [rows];
                rows = rows.slice(0, source.limit || 500);
                const databaseResult = {}; databaseResult[source.output.key] = selectDatabaseOutput(rows, source.output);
                output[source.key] = databaseResult;
                await apiCache.set(queryCacheKey, databaseResult, 300000);
                continue;
            }
            for (const variable of (source.requestVariables || [])) {
                const variableValue = renderTemplate(variable.valueTemplate, sourceContext, values || {});
                if (variableValue == null) throw new Error('Data source "' + source.name + '" could not resolve request variable "' + variable.key + '".');
                sourceContext.request[variable.key] = variableValue; sourceContext[variable.key] = variableValue;
            }
            const rendered = renderTemplate(source.urlTemplate, sourceContext, values || {});
            let url;
            try { url = new URL(rendered); } catch (error) { throw new Error('Data source "' + source.name + '" produced an invalid URL.'); }
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Data source "' + source.name + '" must use an HTTP or HTTPS URL.');
            if (url.username || url.password) throw new Error('Data source "' + source.name + '" cannot include credentials in its URL. Configure Authentication instead.');
            const body = source.method === 'POST' ? renderTemplate(source.bodyTemplate || '', sourceContext, values || {}) : '';
            const extractionSignature = JSON.stringify({ outputs: source.outputs || [], responseExpression: source.responseExpression || '' });
            const cacheKey = source.id + '|' + context.nodeId + '|' + url.toString() + '|' + body + '|' + extractionSignature;
            const cached = await apiCache.get(cacheKey);
            if (cached !== undefined) { output[source.key] = cached; continue; }
            const headers = { Accept: 'application/json' };
            Object.keys(source.headers || {}).forEach(function (name) { if (/^[A-Za-z0-9-]{1,100}$/.test(name)) { const value = renderTemplate(String(source.headers[name]), sourceContext, values || {}); if (value != null && !/[\r\n]/.test(value)) headers[name] = value; } });
            const referencedSecret = source.authSecretId ? (config.authenticationSecrets || []).find(function (secret) { return secret.id === source.authSecretId; }) : null;
            if (source.authSecretId && !referencedSecret) throw new Error('Data source "' + source.name + '" references an unavailable Authentication Secret.');
            const auth = referencedSecret ? { type: referencedSecret.type, token: referencedSecret.token, username: referencedSecret.username, password: referencedSecret.password, headerName: referencedSecret.headerName } : (source.auth || {});
            if (auth.type === 'bearerStored') { if (!auth.token) throw new Error('Data source "' + source.name + '" is missing its stored bearer token.'); headers.Authorization = 'Bearer ' + auth.token; }
            if (auth.type === 'headerStored') { if (!auth.headerName || !auth.token) throw new Error('Data source "' + source.name + '" is missing its stored header credential.'); headers[auth.headerName] = auth.token; }
            if (auth.type === 'basicStored') { if (!auth.username || !auth.password) throw new Error('Data source "' + source.name + '" is missing its stored basic credentials.'); headers.Authorization = 'Basic ' + Buffer.from(auth.username + ':' + auth.password).toString('base64'); }
            if (auth.type === 'bearerEnv') { if (!process.env[auth.tokenEnv]) throw new Error('Data source "' + source.name + '" is missing its token environment variable.'); headers.Authorization = 'Bearer ' + process.env[auth.tokenEnv]; }
            if (auth.type === 'headerEnv') { if (!auth.headerName || !process.env[auth.tokenEnv]) throw new Error('Data source "' + source.name + '" is missing its header credential.'); headers[auth.headerName] = process.env[auth.tokenEnv]; }
            if (auth.type === 'basicEnv') { if (!process.env[auth.usernameEnv] || !process.env[auth.passwordEnv]) throw new Error('Data source "' + source.name + '" is missing its basic-auth environment variables.'); headers.Authorization = 'Basic ' + Buffer.from(process.env[auth.usernameEnv] + ':' + process.env[auth.passwordEnv]).toString('base64'); }
            const controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, source.timeoutMs);
            let response, dispatcher;
            try {
                const requestOptions = { method: source.method, headers: headers, body: source.method === 'POST' ? body : undefined, redirect: 'manual', signal: controller.signal };
                if (source.tlsVerify === false && url.protocol === 'https:') { dispatcher = new runtime.undici.Agent({ connect: { rejectUnauthorized: false } }); requestOptions.dispatcher = dispatcher; }
                response = await runtime.undici.fetch(url, requestOptions);
            } catch (error) {
                throw new Error(fetchFailureMessage(source, url, error));
            } finally {
                clearTimeout(timer);
                if (dispatcher) await dispatcher.close().catch(function () {});
            }
            if (!response.ok) {
                if (response.status >= 300 && response.status < 400) throw new Error('Data source "' + source.name + '" returned HTTP ' + response.status + ' ' + (response.statusText || 'Redirect') + '. Redirects are not followed; enter the final API URL directly.');
                throw new Error('Data source "' + source.name + '" returned HTTP ' + response.status + (response.statusText ? ' ' + response.statusText : '') + '. Confirm the URL, method, authentication and API permissions.');
            }
            const length = Number(response.headers.get('content-length') || 0); if (length > source.maxBytes) throw new Error('Data source "' + source.name + '" exceeded its response limit.');
            const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > source.maxBytes) throw new Error('Data source "' + source.name + '" exceeded its response limit.');
            let result; try { result = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch (error) { throw new Error('Data source "' + source.name + '" returned a successful response that was not valid JSON. Content-Type: ' + (response.headers.get('content-type') || 'not supplied') + '.'); }
            if ((source.outputs || []).length) {
                const extracted = {};
                for (const definition of source.outputs) extracted[definition.key] = evaluateDataSourceOutput(result, definition);
                result = extracted;
            } else if (source.responseExpression) result = runtime.jmespath.search(result, source.responseExpression);
            output[source.key] = result;
            if (source.cacheTtlSeconds > 0) await apiCache.set(cacheKey, result, source.cacheTtlSeconds * 1000);
        }
        context.api = output;
        return output;
    }

    function dynamicOptionsFor(definitions, api) {
        const result = {};
        definitions.forEach(function (definition) {
            const spec = definition.optionSource;
            if (!spec || !spec.sourceKey) return;
            let sourceValues = api[spec.sourceKey];
            if (sourceValues && !Array.isArray(sourceValues) && typeof sourceValues === 'object') { const arrayKeys = Object.keys(sourceValues).filter(function (key) { return Array.isArray(sourceValues[key]); }); if (arrayKeys.length === 1) sourceValues = sourceValues[arrayKeys[0]]; }
            if (!Array.isArray(sourceValues)) return;
            result[definition.key] = sourceValues.slice(0, 500).map(function (item) {
                const value = spec.valueExpression ? runtime.jmespath.search(item, spec.valueExpression) : item;
                const label = spec.labelExpression ? runtime.jmespath.search(item, spec.labelExpression) : value;
                return { value: String(value), label: String(label) };
            });
        });
        return result;
    }

    function validLinkUri(value, protocol) {
        if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001F\u007F]/.test(value)) return null;
        const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(value);
        if (!schemeMatch) return null;
        const scheme = schemeMatch[1].toLowerCase();
        if (protocol === 'web' && scheme !== 'http' && scheme !== 'https') return null;
        if (protocol !== 'web' && protocol !== 'custom' && scheme !== String(protocol).toLowerCase()) return null;
        try { new URL(value); } catch (ex) { return null; }
        return value;
    }

    function replaceTemplate(template, context, values, protocol) {
        const result = renderTemplate(template, context, values);
        return result == null ? null : validLinkUri(result, protocol || 'web');
    }

    function resolvePropertyValues(definitions, storedValues, context) {
        const effective = {};
        const sources = {};
        const stored = storedValues && typeof storedValues === 'object' ? storedValues : {};
        for (let pass = 0; pass <= definitions.length; pass++) {
            let changed = false;
            definitions.forEach(function (definition) {
                if (Object.prototype.hasOwnProperty.call(effective, definition.key)) return;
                let candidate = MISSING;
                let source = '';
                if (definition.valueTemplate) {
                    candidate = renderTemplate(definition.valueTemplate, context, effective); source = 'computed';
                    if ((candidate === MISSING || candidate === null || candidate === '') && definition.defaultTemplate) { candidate = renderTemplate(definition.defaultTemplate, context, effective); source = 'default'; }
                } else if (propertyHasValue(stored[definition.key])) { candidate = stored[definition.key]; source = 'stored'; }
                else if (definition.defaultTemplate) { candidate = renderTemplate(definition.defaultTemplate, context, effective); source = 'default'; }
                if (candidate === MISSING || candidate === null || candidate === '') return;
                try { effective[definition.key] = validateValue(definition, candidate); sources[definition.key] = source; changed = true; } catch (ex) { /* Invalid or unresolved values remain unset. */ }
            });
            if (!changed) break;
        }
        return { values: effective, sources: sources };
    }

    function publicConfig(config) {
        return {
            schemaVersion: 3,
            revision: config.revision || 0,
            updated: config.updated || null,
            updatedBy: config.updatedBy || null,
            properties: clone(config.properties || []),
            links: clone(config.links || []), displayGroups: clone(config.displayGroups || []), items: clone(config.items || []),
            formulaFunctions: clone(runtime.functionCatalog || []),
            authenticationSecrets: clone(config.authenticationSecrets || []),
            dataSources: clone(config.dataSources || [])
        };
    }

    function publicConfigForUser(config, user) {
        const output = publicConfig(config);
        if (!hasPluginPermission(user, 'manage_data_sources')) { output.dataSources = []; output.authenticationSecrets = []; }
        return output;
    }

    function loadConfig(domainId, callback) {
        obj.db.Get(configId(domainId), function (error, docs) {
            if (error) { callback(error); return; }
            const config = Array.isArray(docs) && docs.length ? docs[0] : defaultConfig(domainId);
            if (!Array.isArray(config.properties)) config.properties = [];
            if (!Array.isArray(config.links)) config.links = [];
            if (!Array.isArray(config.items)) config.items = migrateLegacyLinks(config);
            if (!Array.isArray(config.displayGroups)) config.displayGroups = [];
            if (!Array.isArray(config.authenticationSecrets)) config.authenticationSecrets = [];
            if (!Array.isArray(config.dataSources)) config.dataSources = [];
            // Local groups are presentation containers. Older builds exposed them as
            // applicability fields, which could make an item assigned to a group hide
            // itself. Strip those legacy conditions in memory; the next admin save
            // persists the cleaned rules through sanitizeRule().
            config.properties.forEach(function (definition) { definition.rule = visibilityRule(definition.rule) || defaultRule(); });
            config.displayGroups.forEach(function (group) { group.rule = visibilityRule(group.rule) || defaultRule(); });
            config.items.forEach(function (item) { item.rule = visibilityRule(item.rule) || defaultRule(); });
            config.dataSources.forEach(function (source) { delete source.rule; });
            config.schemaVersion = 3;
            callback(null, config);
        });
    }

    function loadValues(nodeId, domainId, callback) {
        obj.db.Get(valuesId(nodeId), function (error, docs) {
            if (error) { callback(error); return; }
            const document = Array.isArray(docs) && docs.length ? docs[0] : {
                _id: valuesId(nodeId), type: VALUES_TYPE, domain: domainId, nodeid: nodeId, values: {}
            };
            if (!document.values || typeof document.values !== 'object' || Array.isArray(document.values)) document.values = {};
            callback(null, document);
        });
    }

    function dispatchToUser(session, pluginaction, payload) {
        const event = Object.assign({ nolog: true, action: 'plugin', plugin: PLUGIN, pluginaction: pluginaction }, payload || {});
        obj.meshServer.DispatchEvent([session.user._id], obj, event);
    }

    function sendResult(session, success, message, nodeId) {
        dispatchToUser(session, 'devicePropertiesLinksOperationResult', { success: success, message: message, nodeId: nodeId || null });
    }

    function sendAdminResult(session, success, message, requestId, config) {
        dispatchToUser(session, 'devicePropertiesLinksAdminResult', { success: success, message: message, requestId: requestId || null, config: config ? publicConfigForUser(config, session.user) : null });
    }

    function withNodeAccess(session, meshUserParent, nodeId, callback) {
        if (!session || !session.user || !session.domain || !meshUserParent || typeof meshUserParent.GetNodeWithRights !== 'function') {
            callback(new Error('The device access context is unavailable.')); return;
        }
        if (typeof nodeId !== 'string' || !nodeId.startsWith('node/' + session.domain.id + '/')) {
            callback(new Error('The device identifier is invalid.')); return;
        }
        meshUserParent.GetNodeWithRights(session.domain, session.user, nodeId, function (node, rights, visible) {
            if (!node || visible === false || !rights) { callback(new Error('Access to this device is denied.')); return; }
            callback(null, node, rights, meshUserParent.meshes ? meshUserParent.meshes[node.meshid] : null);
        });
    }

    function sendDeviceData(session, meshUserParent, nodeId) {
        withNodeAccess(session, meshUserParent, nodeId, function (accessError, node, rights, mesh) {
            if (accessError) { sendResult(session, false, accessError.message, nodeId); return; }
            loadConfig(session.domain.id, function (configError, config) {
                if (configError) { sendResult(session, false, 'Unable to load the property definitions.', nodeId); return; }
                loadValues(nodeId, session.domain.id, function (valuesError, document) {
                    if (valuesError) { sendResult(session, false, 'Unable to load the device property values.', nodeId); return; }
                    (async function () {
                    const context = contextFor(node, mesh, session);
                    const definitions = config.properties.filter(function (definition) {
                        return definition.enabled !== false && evaluateRule(definition.rule, context);
                    }).sort(function (a, b) { return (a.order - b.order) || a.label.localeCompare(b.label); });
                    let resolved = resolvePropertyValues(definitions, document.values, context);
                    try { await fetchDataSources(config, context, resolved.values); resolved = resolvePropertyValues(definitions, document.values, context); }
                    catch (apiError) { console.warn('Links & Properties data source:', apiError.message); }
                    const dynamicOptions = dynamicOptionsFor(definitions, context.api);
                    const publicDefinitions = definitions.map(function (definition) {
                        const copy = clone(definition);
                        copy.label = renderTemplate(definition.label, context, resolved.values) || definition.key;
                        copy.description = renderTemplate(definition.description || '', context, resolved.values) || definition.description || '';
                        copy.computed = Boolean(definition.valueTemplate);
                        return copy;
                    });
                    const groupsById = {}; (config.displayGroups || []).forEach(function (group) { groupsById[group.id] = group; });
                    const items = (config.items || migrateLegacyLinks(config)).filter(function (item) {
                        const effectiveRule = effectiveItemRule(item, groupsById);
                        if (item.enabled === false || !evaluateRule(effectiveRule, context)) return false;
                        if (item.kind === 'command' && item.command) {
                            if ((item.command.shell === 'cmd' || item.command.shell === 'ps') && context.os !== 'windows') return false;
                            if (item.command.shell === 'sh' && context.os === 'windows') return false;
                        }
                        return true;
                    }).map(function (item) {
                        const output = { id: item.id, kind: item.kind, row: item.row || 1, position: item.position || 1, displayGroupId: item.displayGroupId || '', color: item.color || (groupsById[item.displayGroupId] && groupsById[item.displayGroupId].color) || '', showGeneral: item.showGeneral !== false, showTerminal: item.showTerminal === true };
                        output.name = renderTemplate(item.displayNameTemplate, context, resolved.values);
                        output.description = renderTemplate(item.displayDescriptionTemplate || '', context, resolved.values) || '';
                        output.hint = renderTemplate(item.hintTemplate || '', context, resolved.values) || '';
                        if (item.kind === 'link' && item.link) {
                            output.url = replaceTemplate(item.link.urlTemplate, context, resolved.values, item.link.protocol);
                            if (output.url == null && item.link.defaultUrlTemplate) output.url = replaceTemplate(item.link.defaultUrlTemplate, context, resolved.values, item.link.protocol);
                            output.target = item.link.target || 'new';
                        } else if (item.kind === 'command' && item.command) {
                            output.shell = item.command.shell; output.mode = item.command.mode; output.runAs = item.command.runAs || 0; output.confirm = item.command.confirm === true;
                            output.command = renderTemplate(item.command.commandTemplate, context, resolved.values);
                            output.confirmation = renderTemplate(item.command.confirmTemplate || '', context, resolved.values) || '';
                        }
                        return output;
                    }).filter(function (item) { return propertyHasValue(item.name) && (item.kind === 'link' ? item.url != null : propertyHasValue(item.command)); }).sort(function (a, b) { return (a.row - b.row) || (a.position - b.position) || a.name.localeCompare(b.name); });
                    const links = items.filter(function (item) { return item.kind === 'link'; });
                    const canEdit = isFullAdmin(session.user) || hasPluginPermission(session.user, 'edit_device_values') || ((rights & 1) !== 0) || ((rights & 4) !== 0);
                    dispatchToUser(session, 'devicePropertiesLinksDeviceData', {
                        nodeId: nodeId,
                        definitions: publicDefinitions,
                        values: resolved.values,
                        valueSources: resolved.sources,
                        links: links, items: items, displayGroups: clone(config.displayGroups || []),
                        canEdit: canEdit
                        ,formSchema: formSchema(publicDefinitions, dynamicOptions)
                    });
                    })().catch(function (error) { sendResult(session, false, error.message, nodeId); });
                });
            });
        });
    }

    function inventory(domainId, callback) {
        obj.db.GetAllType('mesh', function (meshError, meshes) {
            if (meshError) { callback(meshError); return; }
            obj.db.GetAllType('node', function (nodeError, nodes) {
                if (nodeError) { callback(nodeError); return; }
                const groups = (meshes || []).filter(function (mesh) { return mesh.domain === domainId; }).map(function (mesh) {
                    return { id: mesh._id, name: mesh.name || mesh._id };
                }).sort(function (a, b) { return a.name.localeCompare(b.name); });
                const tagSet = new Set();
                const publicNodes = (nodes || []).filter(function (node) { return node.domain === domainId; }).map(function (node) {
                    const tags = Array.isArray(node.tags) ? node.tags.slice() : [];
                    tags.forEach(function (tag) { tagSet.add(tag); });
                    return {
                        id: node._id,
                        name: node.name || node._id,
                        meshid: node.meshid || '',
                        tags: tags,
                        agentId: node.agent && Number(node.agent.id) || 0,
                        hostname: node.host || '',
                        connected: Boolean(obj.meshServer.webserver && obj.meshServer.webserver.wsagents && obj.meshServer.webserver.wsagents[node._id])
                    };
                }).sort(function (a, b) { return a.name.localeCompare(b.name); });
                obj.db.GetAllType('user', function (userError, users) {
                    const publicUsers = userError ? [] : (users || []).filter(function (user) { return user.domain === domainId; }).map(function (user) { return { id: user._id, name: user.name || user._id }; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
                    obj.db.GetAllType('ugrp', function (groupError, userGroups) {
                        const publicUserGroups = groupError ? [] : (userGroups || []).filter(function (group) { return group.domain === domainId; }).map(function (group) { return { id: group._id, name: group.name || group._id }; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
                        callback(null, { groups: groups, nodes: publicNodes, tags: Array.from(tagSet).sort(), users: publicUsers, userGroups: publicUserGroups });
                    });
                });
            });
        });
    }

    function sendAdminData(session) {
        loadConfig(session.domain.id, function (configError, config) {
            if (configError) { sendAdminResult(session, false, 'Unable to load the plugin configuration.'); return; }
            inventory(session.domain.id, function (inventoryError, available) {
                if (inventoryError) { sendAdminResult(session, false, 'Unable to load devices and groups.'); return; }
                dispatchToUser(session, 'devicePropertiesLinksAdminData', { config: publicConfigForUser(config, session.user), inventory: available, permissions: adminPermissions(session.user), presets: loadPresetCatalog() });
            });
        });
    }

    function purgePropertyValues(domainId, keys, callback) {
        if (!Array.isArray(keys) || keys.length === 0) { callback(null, 0); return; }
        obj.db.GetAllType(VALUES_TYPE, function (error, documents) {
            if (error) { callback(error); return; }
            const matching = (documents || []).filter(function (doc) { return doc.domain === domainId && doc.values && typeof doc.values === 'object'; });
            let pending = matching.length;
            let changed = 0;
            let firstError = null;
            if (!pending) { callback(null, 0); return; }
            matching.forEach(function (doc) {
                let dirty = false;
                keys.forEach(function (key) { if (Object.prototype.hasOwnProperty.call(doc.values, key)) { delete doc.values[key]; dirty = true; } });
                if (!dirty) { if (--pending === 0) callback(firstError, changed); return; }
                changed++;
                doc.updated = nowIso();
                const done = function (writeError) { if (writeError && !firstError) firstError = writeError; if (--pending === 0) callback(firstError, changed); };
                if (Object.keys(doc.values).length === 0) obj.db.Remove(doc._id, done); else obj.db.Set(doc, done);
            });
        });
    }

    function audit(session, message, nodeId) {
        const event = { etype: 'user', userid: session.user._id, username: session.user.name, action: 'devicepropertieslinks', domain: session.domain.id, msg: message };
        if (nodeId) event.nodeid = nodeId;
        obj.meshServer.DispatchEvent(['*', session.user._id], obj, event);
    }

    obj.server_startup = function () {
        ensurePresetCatalogFile();
        console.log('Links & Properties v3.8.3 loaded.');
    };

    obj.serveraction = function (command, session, meshUserParent) {
        if (!command || !session || !session.user || !session.domain) return;
        if (command.pluginaction === 'getDevice') { sendDeviceData(session, meshUserParent, command.nodeId); return; }

        if (command.pluginaction === 'saveDeviceValues') {
            withNodeAccess(session, meshUserParent, command.nodeId, function (accessError, node, rights, mesh) {
                if (accessError) { sendResult(session, false, accessError.message, command.nodeId); return; }
                const canEdit = isFullAdmin(session.user) || hasPluginPermission(session.user, 'edit_device_values') || ((rights & 1) !== 0) || ((rights & 4) !== 0);
                if (!canEdit) { sendResult(session, false, 'Permission to edit device properties is required.', command.nodeId); return; }
                loadConfig(session.domain.id, function (configError, config) {
                    if (configError) { sendResult(session, false, 'Unable to load property definitions.', command.nodeId); return; }
                    loadValues(command.nodeId, session.domain.id, function (valuesError, document) {
                        if (valuesError) { sendResult(session, false, 'Unable to load existing property values.', command.nodeId); return; }
                        try {
                            const context = contextFor(node, mesh, session);
                            const applicable = config.properties.filter(function (definition) { return definition.enabled !== false && evaluateRule(definition.rule, context); });
                            const incoming = command.values && typeof command.values === 'object' && !Array.isArray(command.values) ? command.values : {};
                            (async function () {
                            const before = resolvePropertyValues(applicable, document.values, context);
                            await fetchDataSources(config, context, before.values);
                            const dynamicOptions = dynamicOptionsFor(applicable, context.api);
                            applicable.forEach(function (definition) {
                                if (definition.valueTemplate) return;
                                if (!Object.prototype.hasOwnProperty.call(incoming, definition.key)) return;
                                const value = validateValue(definition, incoming[definition.key]);
                                if (definition.optionSource && propertyHasValue(value)) {
                                    const allowed = (dynamicOptions[definition.key] || []).map(function (option) { return option.value; });
                                    const submitted = Array.isArray(value) ? value : [value];
                                    if (submitted.some(function (entry) { return allowed.indexOf(String(entry)) < 0; })) throw new Error(definition.label + ' has an invalid dynamic selection.');
                                }
                                if (value === null) delete document.values[definition.key]; else document.values[definition.key] = value;
                            });
                            const resolved = resolvePropertyValues(applicable, document.values, context);
                            document.type = VALUES_TYPE;
                            document.domain = session.domain.id;
                            document.nodeid = command.nodeId;
                            document.updated = nowIso();
                            document.updatedBy = session.user._id;
                            obj.db.Set(document, function (writeError) {
                                if (writeError) { sendResult(session, false, 'Unable to save the device properties.', command.nodeId); return; }
                                audit(session, 'Updated custom properties for device ' + (node.name || command.nodeId) + '.', command.nodeId);
                                sendResult(session, true, 'Device properties saved.', command.nodeId);
                                sendDeviceData(session, meshUserParent, command.nodeId);
                            });
                            })().catch(function (error) { sendResult(session, false, error.message, command.nodeId); });
                        } catch (ex) { sendResult(session, false, ex.message, command.nodeId); }
                    });
                });
            });
            return;
        }

        if (command.pluginaction === 'getAdminConfig') {
            const permissions = adminPermissions(session.user);
            if (!permissions.manageDefinitions && !permissions.manageDataSources) { sendAdminResult(session, false, 'Permission to manage definitions or Data Sources is required.', command.requestId); return; }
            sendAdminData(session); return;
        }

        if (command.pluginaction === 'previewFormula') {
            if (!hasPluginPermission(session.user, 'manage_definitions') && !hasPluginPermission(session.user, 'manage_data_sources')) { sendAdminResult(session, false, 'Permission to preview formulas is required.'); return; }
            const requestId = cleanString(command.requestId, 100, false);
            const template = cleanString(command.template, 8192, true);
            if (!requestId || template == null) { sendAdminResult(session, false, 'The formula preview request is invalid.'); return; }
            withNodeAccess(session, meshUserParent, command.nodeId, function (accessError, node, rights, mesh) {
                if (accessError) { dispatchToUser(session, 'devicePropertiesLinksFormulaPreview', { requestId: requestId, success: false, message: accessError.message }); return; }
                loadConfig(session.domain.id, function (configError, config) {
                    if (configError) { dispatchToUser(session, 'devicePropertiesLinksFormulaPreview', { requestId: requestId, success: false, message: 'Unable to load property definitions.' }); return; }
                    loadValues(command.nodeId, session.domain.id, function (valuesError, document) {
                        if (valuesError) { dispatchToUser(session, 'devicePropertiesLinksFormulaPreview', { requestId: requestId, success: false, message: 'Unable to load device property values.' }); return; }
                        try {
                            validateTemplateSyntax(template, 'Formula');
                            const context = contextFor(node, mesh, session);
                            const applicable = config.properties.filter(function (definition) { return definition.enabled !== false && evaluateRule(definition.rule, context); });
                            let resolved = resolvePropertyValues(applicable, document.values, context);
                            (async function () {
                            await fetchDataSources(config, context, resolved.values);
                            resolved = resolvePropertyValues(applicable, document.values, context);
                            context.request = {};
                            const requestVariables = Array.isArray(command.requestVariables) ? command.requestVariables : [], usedRequestKeys = new Set();
                            if (requestVariables.length > 50) throw new Error('No more than 50 request variables can be previewed.');
                            for (const variable of requestVariables) {
                                const key = cleanString(variable && variable.key, 64, false), valueTemplate = cleanString(variable && variable.valueTemplate, 2048, false);
                                if (!key || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) throw new Error('Request-variable placeholders must begin with a letter or underscore and contain only letters, digits and underscores.');
                                if (usedRequestKeys.has(key.toLowerCase())) throw new Error('Request-variable placeholders must be unique.');
                                if (!valueTemplate) throw new Error('Request variable "' + key + '" requires a value or formula.');
                                const requestValue = renderTemplate(valueTemplate, context, resolved.values);
                                if (requestValue == null) throw new Error('Request variable "' + key + '" could not be resolved for this preview device.');
                                usedRequestKeys.add(key.toLowerCase()); context.request[key] = requestValue; context[key] = requestValue;
                            }
                            const result = renderTemplate(template, context, resolved.values);
                            dispatchToUser(session, 'devicePropertiesLinksFormulaPreview', {
                                requestId: requestId,
                                success: result != null,
                                result: result == null ? '' : result,
                                message: result == null ? 'One or more referenced values are not available on this device.' : ''
                            });
                            })().catch(function (error) { dispatchToUser(session, 'devicePropertiesLinksFormulaPreview', { requestId: requestId, success: false, message: error.message }); });
                        } catch (ex) { dispatchToUser(session, 'devicePropertiesLinksFormulaPreview', { requestId: requestId, success: false, message: ex.message }); }
                    });
                });
            });
            return;
        }

        if (command.pluginaction === 'inspectDataSourceCertificate') {
            if (!hasPluginPermission(session.user, 'manage_data_sources')) { sendAdminResult(session, false, 'Permission to inspect Data Source certificates is required.'); return; }
            const requestId = cleanString(command.requestId, 100, false), rawUrl = cleanString(command.url, 2048, false);
            if (!requestId || !rawUrl) { dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: false, previewMode: 'certificate', message: 'Enter an HTTPS URL before viewing its certificate.' }); return; }
            inspectTlsCertificate(rawUrl).then(function (result) {
                dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: true, previewMode: 'certificate', message: result.authorised ? 'Certificate retrieved and verified.' : 'Certificate retrieved, but verification failed.', result: result });
            }).catch(function (error) {
                let url; try { url = new URL(rawUrl); } catch (ignored) {}
                const message = url ? fetchFailureMessage({ name: 'Certificate inspection' }, url, error) : error.message;
                dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: false, previewMode: 'certificate', message: message });
            });
            return;
        }

        if (command.pluginaction === 'previewDataSource') {
            if (!hasPluginPermission(session.user, 'manage_data_sources')) { sendAdminResult(session, false, 'Permission to test Data Sources is required.'); return; }
            const requestId = cleanString(command.requestId, 100, false), previewMode = command.previewMode === 'connection' ? 'connection' : 'data';
            if (!requestId || !command.source || typeof command.source !== 'object') { sendAdminResult(session, false, 'The Data Source preview request is invalid.'); return; }
            loadConfig(session.domain.id, function (configError, current) {
                if (configError) { dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: false, message: 'Unable to load existing Data Sources.' }); return; }
                function runPreview(node, mesh, storedValues) {
                    (async function () {
                        const candidateInput = publicConfig(current), sourceInput = clone(command.source); sourceInput.enabled = true; delete sourceInput.rule;
                        candidateInput.dataSources = (candidateInput.dataSources || []).filter(function (source) { return source.id !== sourceInput.id; }); candidateInput.dataSources.push(sourceInput);
                        const candidate = sanitizeConfig(candidateInput, session.domain.id, session.user._id), source = candidate.dataSources.find(function (entry) { return entry.id === sourceInput.id; });
                        candidate.dataSources = dataSourceDependencyClosure(candidate.dataSources, source.key);
                        const context = node ? contextFor(node, mesh, session) : contextWithoutDevice(session);
                        const definitions = node ? candidate.properties.filter(function (definition) { return definition.enabled !== false && evaluateRule(definition.rule, context); }) : [];
                        const resolved = resolvePropertyValues(definitions, storedValues || {}, context);
                        if (previewMode === 'connection' && source.sourceType === 'databaseQuery') { await executeDatabaseQuery(source, context, resolved.values, true); dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: true, previewMode: previewMode, message: 'Connection succeeded.', result: [] }); return; }
                        if (source.sourceType === 'apiQuery') { source.outputs = []; source.responseExpression = ''; }
                        await fetchDataSources(candidate, context, resolved.values);
                        let result = context.api[source.key]; const encoded = JSON.stringify(result);
                        if (encoded && encoded.length > 131072) result = { previewTruncated: true, message: 'The result exceeded 128 KB. Refine the query or limits before previewing.', sample: encoded.slice(0, 131072) };
                        dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: true, previewMode: previewMode, message: 'Test succeeded.', result: result });
                    })().catch(function (error) { dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: false, previewMode: previewMode, message: error.message }); });
                }
                if (!command.nodeId) { runPreview(null, null, {}); return; }
                withNodeAccess(session, meshUserParent, command.nodeId, function (accessError, node, rights, mesh) {
                    if (accessError) { dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: false, message: accessError.message }); return; }
                    loadValues(command.nodeId, session.domain.id, function (valuesError, document) {
                        if (valuesError) { dispatchToUser(session, 'devicePropertiesLinksDataSourcePreview', { requestId: requestId, success: false, message: 'Unable to load device property values.' }); return; }
                        runPreview(node, mesh, document.values);
                    });
                });
            });
            return;
        }

        if (command.pluginaction === 'saveAdminConfig') {
            const permissions = adminPermissions(session.user);
            if (!permissions.manageDefinitions && !permissions.manageDataSources) { sendAdminResult(session, false, 'Permission to manage definitions or Data Sources is required.'); return; }
            loadConfig(session.domain.id, function (loadError, current) {
                if (loadError) { sendAdminResult(session, false, 'Unable to load the current configuration.', command.requestId); return; }
                if (Number(command.expectedRevision) !== Number(current.revision || 0)) { sendAdminResult(session, false, 'The configuration changed in another session. Refresh and try again.', command.requestId); return; }
                try {
                    const next = sanitizeConfig(command.config, session.domain.id, session.user._id);
                    if (!permissions.manageDefinitions) {
                        next.properties = clone(current.properties || []);
                        next.links = clone(current.links || []);
                        next.displayGroups = clone(current.displayGroups || []);
                        next.items = clone(current.items || []);
                    }
                    if (!permissions.manageDataSources) { next.dataSources = clone(current.dataSources || []); next.authenticationSecrets = clone(current.authenticationSecrets || []); }
                    if (permissions.manageDataSources) {
                        const nextSourceIds = new Set((next.dataSources || []).map(function (source) { return source.id; }));
                        (current.dataSources || []).filter(function (source) { return !nextSourceIds.has(source.id); }).forEach(function (source) {
                            const deletionError = dataSourceDeletionError(source, dataSourceReferenceUsage(next, source));
                            if (deletionError) throw new Error(deletionError);
                        });
                    }
                    next.revision = Number(current.revision || 0) + 1;
                    obj.db.Set(next, function (writeError) {
                        if (writeError) { sendAdminResult(session, false, 'Unable to save the configuration.', command.requestId); return; }
                        const purgeKeys = permissions.manageDefinitions && Array.isArray(command.purgeKeys) ? command.purgeKeys.filter(function (key) { return typeof key === 'string'; }) : [];
                        purgePropertyValues(session.domain.id, purgeKeys, function (purgeError, changed) {
                            if (purgeError) { sendAdminResult(session, false, 'Definitions saved, but stored values could not be purged.', command.requestId); return; }
                            const updatedAreas = []; if (permissions.manageDefinitions) updatedAreas.push('device property and link definitions'); if (permissions.manageDataSources) updatedAreas.push('Data Sources');
                            audit(session, 'Updated Links & Properties ' + updatedAreas.join(' and ') + '.' + (changed ? (' Purged values from ' + changed + ' device record(s).') : ''));
                            sendAdminResult(session, true, 'Configuration saved successfully.', command.requestId, next);
                            sendAdminData(session);
                        });
                    });
                } catch (ex) { sendAdminResult(session, false, ex.message, command.requestId); }
            });
            return;
        }

        sendResult(session, false, 'Unsupported Links & Properties operation.', command.nodeId);
    };

    obj.handleAdminReq = function (req, res, user) {
        const permissions = adminPermissions(user);
        if (!permissions.manageDefinitions && !permissions.manageDataSources) { res.sendStatus(403); return; }
        if (req.query.include === '1' && typeof req.query.path === 'string') {
            const allowed = { 'admin.css': 'text/css', 'admin-extra.css': 'text/css', 'semantic.min.css': 'text/css', 'jquery.min.js': 'text/javascript', 'semantic.min.js': 'text/javascript', 'admin.js': 'text/javascript', 'iana-uri-schemes.js': 'text/javascript', 'vendor-browser.js': 'text/javascript' };
            if (!allowed[req.query.path]) { res.sendStatus(404); return; }
            res.type(allowed[req.query.path]);
            res.sendFile(obj.path.join(__dirname, 'includes', req.query.path));
            return;
        }
        res.render(obj.path.join(__dirname, 'views', 'admin'), { pluginVersion: '3.8.3' });
    };

    obj.handleAdminPostReq = function (req, res, user) {
        const permissions = adminPermissions(user);
        if (!permissions.manageDefinitions && !permissions.manageDataSources) { res.sendStatus(403); return; }
        res.status(405).send('Use the authenticated MeshCentral plugin channel.');
    };

    // The functions below are serialized by MeshCentral and execute in the browser.
    obj.onWebUIStartupEnd = function () {
        var st = pluginHandler.devicepropertieslinks.dplState();
        if (!st.hooked && typeof meshserver === 'object' && meshserver && typeof meshserver.onMessage === 'function') { var original = meshserver.onMessage; meshserver.onMessage = function (server, message) { try { pluginHandler.devicepropertieslinks.dplIntercept(message); } catch (e) {} return original.apply(this, arguments); }; st.hooked = true; }
        if (!document.getElementById('devicePropertiesLinksVendor')) {
            var script = document.createElement('script');
            script.id = 'devicePropertiesLinksVendor';
            script.src = '/plugin-assets/devicepropertieslinks/vendor-browser.js?v=3.8.3';
            document.head.appendChild(script);
        }
        if (!document.getElementById('devicePropertiesLinksSemanticStyles')) {
            var semanticStyle = document.createElement('link');
            semanticStyle.id = 'devicePropertiesLinksSemanticStyles';
            semanticStyle.rel = 'stylesheet';
            semanticStyle.href = '/plugin-assets/devicepropertieslinks/semantic.min.css?v=3.8.3';
            document.head.appendChild(semanticStyle);
        }
        if (document.getElementById('devicePropertiesLinksStyles')) return;
        var style = document.createElement('style');
        style.id = 'devicePropertiesLinksStyles';
        style.textContent = '#devicePropertiesLinksSection{margin-top:1.15em;border:1px solid #9ca8b5;background:#f8f9fb}.dpl-section-title{font-weight:700;padding:6px 10px;color:#071a4a;background:linear-gradient(90deg,#d8e7f8,#b8cff1,#d8e7f8);border-bottom:1px solid #9dbbe8}.dpl-items-body{padding:5px 7px 8px}.dpl-local-group{--dpl-group-color:#2458b8;margin:7px 0 0;border:1px solid #aeb8c5;border-left:5px solid var(--dpl-group-color);background:#fff}.dpl-local-group-title{display:flex;gap:8px;align-items:baseline;padding:5px 8px;font-weight:700;background:#eef2f7;border-bottom:1px solid #c5cdd8}.dpl-local-group-description{font-size:11px;font-weight:400;color:#58657a}.dpl-item-row{display:flex;gap:7px;align-items:stretch;flex-wrap:wrap;padding:5px 8px}.dpl-key{--dpl-color:#2458b8;position:relative;overflow:hidden;display:inline-flex;flex-direction:column;gap:2px;min-width:170px;max-width:310px;padding:5px 10px 6px;border:1px solid #8f9a9f;border-bottom:4px solid var(--dpl-color);border-radius:5px;background:#fff;cursor:pointer;text-align:left;color:#111}.dpl-key:hover{background:#f2f7ff}.dpl-key-name{font-size:12px;line-height:15px;font-weight:700;display:flex;gap:6px;align-items:center}.dpl-key-desc{font-size:11px;line-height:14px;color:#58657a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dpl-kind{font-size:9px;padding:1px 4px;border-radius:3px;background:#173c89;color:#fff}.dpl-properties-page{display:none;padding:10px 14px 30px}.dpl-properties-heading{font-size:22px;margin:4px 0 10px}.dpl-properties{padding:10px 14px;max-width:1100px;border:1px solid #b8c4d4;background:#fff}.dpl-field{display:grid;grid-template-columns:minmax(150px,230px) 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #d5deeb}.dpl-label{font-weight:700}.dpl-help{font-size:12px;color:#58657a;margin-top:3px}.dpl-control-row{display:flex;gap:7px;align-items:center}.dpl-control-row input,.dpl-control-row select,.dpl-control-row textarea{box-sizing:border-box;width:100%;max-width:650px}.dpl-control-row textarea{min-height:90px;resize:vertical}.dpl-readonly-value{display:block;min-width:0;padding:3px 5px;border:0;border-radius:3px;line-height:normal;overflow-wrap:anywhere}.dpl-actions{display:flex;gap:7px;margin-top:14px}.dpl-status{margin:10px 0;padding:8px;border-radius:4px;display:none}.dpl-status.ok{display:block;background:#e7f6ea;color:#155724}.dpl-status.error{display:block;background:#fdeaea;color:#8a1c1c}.dpl-output{white-space:pre-wrap;max-height:420px;overflow:auto;background:#10151d;color:#e7eefb;padding:10px}.ui.segments#devicePropertiesLinksSection{margin:1.15em 0 0;border:1px solid #9ca8b5;border-radius:0;background:#f8f9fb;box-shadow:none}.ui.header.dpl-section-title{margin:0;border:0;border-bottom:1px solid #9dbbe8;border-radius:0;padding:6px 10px;color:#071a4a;background:linear-gradient(90deg,#d8e7f8,#b8cff1,#d8e7f8);font:inherit;font-weight:700}.ui.segment.dpl-items-body{margin:0;border:0;border-radius:0;padding:5px 7px 8px;background:transparent;box-shadow:none}.ui.basic.segment.dpl-item-row{margin:0;border:0;padding:5px 8px;background:transparent;box-shadow:none}.ui.button.dpl-key{margin:0;min-width:170px;max-width:310px;padding:5px 10px 6px;border:1px solid #8f9a9f;border-bottom:4px solid var(--dpl-color);border-radius:5px;background:#fff;color:#111;font:inherit;font-weight:400;line-height:normal;box-shadow:none}.ui.button.dpl-key:hover{background:#f2f7ff;color:#111}.ui.mini.label.dpl-kind{margin:0;padding:1px 4px;border:0;border-radius:3px;background:#173c89;color:#fff;font-size:9px;line-height:normal}.ui.segments.dpl-local-group{margin:7px 0 0;border:1px solid #aeb8c5;border-left:5px solid var(--dpl-group-color);border-radius:0;background:#fff;box-shadow:none}.ui.secondary.segment.dpl-local-group-title{margin:0;border:0;border-bottom:1px solid #c5cdd8;border-radius:0;padding:5px 8px;background:#eef2f7;box-shadow:none}.ui.header.dpl-local-group-title .ui.header,.dpl-local-group-title>.ui.header{display:inline;margin:0;color:inherit;font:inherit;font-weight:700}.ui.basic.label.dpl-local-group-description{margin:0;padding:0;border:0;background:transparent;color:#58657a;font:inherit;font-size:11px;font-weight:400;box-shadow:none}.dpl-properties-page>.ui.header.dpl-properties-heading{margin:4px 0 10px;color:inherit;font:inherit;font-size:22px;font-weight:700}.dpl-properties-page>.ui.segment{margin:0;padding:0;border:0;background:transparent;box-shadow:none}.ui.form.segment.dpl-properties{margin:0;max-width:1100px;padding:10px 14px;border:1px solid #b8c4d4;border-radius:0;background:#fff;box-shadow:none}.ui.form.segment.dpl-information{box-sizing:border-box;width:min(720px,100%);max-width:720px;padding:0;border:0;background:transparent}.ui.form .field.dpl-field{margin:0;display:grid;grid-template-columns:minmax(150px,230px) 1fr;gap:12px;padding:10px 0;border-bottom:1px solid #d5deeb}.ui.form.dpl-information .field.dpl-field{grid-template-columns:230px minmax(180px,1fr);gap:12px;align-items:start;padding:5px 0;border-bottom:0}.ui.label.dpl-label{display:block;margin:0;padding:3px 5px;border:0;border-radius:3px;background:transparent;font:inherit;font-weight:700;line-height:normal;box-shadow:none}.ui.tiny.basic.label.dpl-help{display:block;margin:3px 0 0;padding:0;border:0;background:transparent;color:#58657a;font:inherit;font-size:12px;font-weight:400;box-shadow:none}.ui.form .field.dpl-control-row{margin:0;display:flex;gap:7px;align-items:center}.ui.form .field.dpl-control-row input,.ui.form .field.dpl-control-row select,.ui.form .field.dpl-control-row textarea{margin:0;box-sizing:border-box;width:100%;max-width:650px;padding:8px;border:1px solid #9cadd1;border-radius:4px;background:#fff;color:#111;font:inherit}.ui.form.dpl-information .field.dpl-control-row{align-items:start}.ui.message.dpl-status{min-height:0;margin:10px 0;padding:8px;border:0;border-radius:4px;box-shadow:none}.ui.primary.button{margin:0;padding:5px 10px;border:1px solid #143985;border-radius:5px;background:linear-gradient(#3769d8,#1f49aa);color:#fff;font:inherit;font-weight:700;box-shadow:none}.ui.inverted.segment.dpl-output{margin:0;padding:10px;border:0;border-radius:0;background:#10151d;color:#e7eefb;box-shadow:none}.night .dpl-key,.night .dpl-local-group,.night .dpl-properties{background:#111;color:#ddd}.night .dpl-information{background:transparent}.night .dpl-local-group-title{background:#222}.night .dpl-key-desc,.night .dpl-help,.night .dpl-local-group-description{color:#bbb}.night .dpl-section-title{color:#fff;background:linear-gradient(90deg,#152a52,#274b88,#152a52)}.night .dpl-field{border-color:#444}@media(max-width:700px){.dpl-field,.ui.form.dpl-information .field.dpl-field{grid-template-columns:1fr;gap:5px}.ui.button.dpl-key{min-width:140px;max-width:100%}}';
        document.head.appendChild(style);
        try { pluginHandler.devicepropertieslinks.dplMyDevicesInit(); } catch (e) {}
    };

    obj.onDeviceRefreshEnd = function (nodeId) {
        if (typeof meshserver === 'undefined' || !meshserver || meshserver.State !== 2) return;
        meshserver.send({ action: 'plugin', plugin: 'devicepropertieslinks', pluginaction: 'getDevice', nodeId: nodeId });
        setTimeout(function () { pluginHandler.devicepropertieslinks.dplRestoreQuickCommands(); }, 250);
    };

    obj.dplState = function () { var p=pluginHandler.devicepropertieslinks; if(!p._state)p._state={devices:{},pending:{},log:[],hooked:false,goHooked:false,originalGo:null,customPage:null,bulkWaiting:null,bulkIds:[],contextNodeId:null}; return p._state; };
    obj.dplHideProperties = function () { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),wasVisible=Boolean(st.customPage);['Information','Properties'].forEach(function(name){var panel=document.getElementById('dpl'+name+'Panel'),tab=document.getElementById('MainDev'+name);if(panel)panel.style.display='none';if(tab){tab.classList.remove('style3sel');tab.classList.add('style3x');}});st.customPage=null;if(wasVisible){var page=document.getElementById('p10'),general=document.getElementById('MainDev');if(page)page.style.display='';if(general){general.classList.remove('style3x');general.classList.add('style3sel');}} };
    obj.dplInstallPropertiesPage = function () { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),legacyHeader=document.getElementById('p19ph-devicePropertiesLinksPage'),legacyPage=document.querySelector('#p19pages>#devicePropertiesLinksPage');if(legacyHeader)legacyHeader.remove();if(legacyPage)legacyPage.remove();if(!st.goHooked&&typeof window.go==='function'){st.originalGo=window.go;window.go=function(){var args=arguments,target=args[0];P.dplHideProperties();var result=st.originalGo.apply(this,args);if(target===10&&window.currentNode&&st.devices[currentNode._id])setTimeout(function(){if(window.currentNode&&st.devices[currentNode._id])P.devicePropertiesLinksDeviceData(st.devices[currentNode._id]);},0);return result;};st.goHooked=true;}var general=document.getElementById('MainDev'),after=general;['Information','Properties'].forEach(function(name){var id='MainDev'+name,tab=document.getElementById(id);if(!tab&&general&&general.parentNode){tab=document.createElement('td');tab.id=id;tab.tabIndex=0;tab.className='topbar_td style3x';tab.textContent=name;tab.style.display='none';tab.onmouseup=function(event){return name==='Information'?P.dplShowInformation(event):P.dplShowProperties(event);};tab.onkeypress=function(event){if(event.key==='Enter')return name==='Information'?P.dplShowInformation(event):P.dplShowProperties(event);};general.parentNode.insertBefore(tab,after.nextSibling);}if(tab)after=tab;var panel=document.getElementById('dpl'+name+'Panel');if(!panel){var host=document.getElementById('column_l');if(host){panel=document.createElement('div');panel.id='dpl'+name+'Panel';panel.className='dpl-properties-page';panel.style.display='none';var heading=document.createElement('h1');heading.id='dpl'+name+'Heading';heading.className='ui header dpl-properties-heading';heading.textContent=name;var content=document.createElement('div');content.id='device'+name+'Page';content.className='ui segment';panel.append(heading,content);host.appendChild(panel);}}});return document.getElementById('dplPropertiesPanel'); };
    obj.dplShowCustomPage = function (name,event) { var P=pluginHandler.devicepropertieslinks,st=P.dplState();P.dplInstallPropertiesPage();var panel=document.getElementById('dpl'+name+'Panel');if(!panel||((typeof xxdialogMode!=='undefined')&&xxdialogMode))return false;if(st.originalGo&&((typeof xxcurrentView==='undefined')||xxcurrentView!==10))st.originalGo(10,event);var page=document.getElementById('p10'),general=document.getElementById('MainDev');if(page)page.style.display='none';if(general){general.classList.remove('style3sel');general.classList.add('style3x');}['Information','Properties'].forEach(function(other){var otherPanel=document.getElementById('dpl'+other+'Panel'),tab=document.getElementById('MainDev'+other);if(otherPanel)otherPanel.style.display=other===name?'block':'none';if(tab){tab.classList.toggle('style3sel',other===name);tab.classList.toggle('style3x',other!==name);}});st.customPage=name;return false; };
    obj.dplShowInformation = function (event) { return pluginHandler.devicepropertieslinks.dplShowCustomPage('Information',event); };
    obj.dplShowProperties = function (event) { return pluginHandler.devicepropertieslinks.dplShowCustomPage('Properties',event); };
    obj.dplEsc = function (v) { return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };
    obj.dplDialog = function (title,buttons,ok,html,wide) { var modern=typeof showModal==='function'; if(modern&&document.getElementById('id_dialogOptions')==null){var d=document.getElementById('dialog2');if(d)d.innerHTML='<div id=id_dialogOptions></div>';} setDialogMode(2,title,buttons,ok,html); if(modern){var c=document.getElementById('xxAddAgentModalConf');if(c&&wide)c.classList.add('qcWide');showModal('xxAddAgentModal','idx_dlgOkButton',ok);} return false; };
    obj.dplDialogClose = function () { if(typeof xxModal!=='undefined'&&xxModal){try{xxModal.hide();}catch(e){} if(typeof xxdialogMode!=='undefined')xxdialogMode=0;}else if(typeof dialogclose==='function')dialogclose(0); };
    obj.dplRun = function (nodeId,itemId) { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),data=st.devices[nodeId],item=null; if(data)(data.items||[]).forEach(function(x){if(x.id===itemId)item=x;}); if(!item)return false; if(item.kind==='link'){if(item.target==='same')location.href=item.url;else window.open(item.url,'_blank','noopener,noreferrer');return false;} if(item.confirm){var html='<div class="ui header">'+P.dplEsc(item.name)+'</div><pre class="ui inverted segment dpl-output">'+P.dplEsc(item.command)+'</pre><div class="ui message">'+P.dplEsc(item.confirmation||item.description||'Run this command?')+'</div>'; return P.dplDialog('Run quick command?',3,function(){P.dplExec(nodeId,item);},html,true);} return item.mode==='terminal'?P.dplTypeTerminal(nodeId,item):P.dplExec(nodeId,item); };
    obj.dplExec = function (nodeId,item,bulk) { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),types={cmd:1,ps:2,sh:3,agent:4},rid='dpl-'+Math.random().toString(36).slice(2,12),node=typeof getNodeFromId==='function'?getNodeFromId(nodeId):null;if(node&&((node.conn&1)===0)){if(!bulk)P.dplDialog('Quick command',1,null,'The agent is not connected, so this command cannot run.');return false;}var e={rid:rid,item:item,nodeId:nodeId,nodeName:node&&node.name||nodeId,state:'running',output:'',start:Date.now(),bulk:!!bulk,collect:true};st.pending[rid]=e;st.log.unshift(e);if(bulk){st.bulkRunList=st.bulkRunList||[];st.bulkRunList.push(e);}if(item.shell==='agent')e.timer=setTimeout(function(){P.dplFinish(rid,null);},4000);else e.timer=setTimeout(function(){P.dplFinish(rid,'No reply from the agent after 5 minutes. The command may still be running or waiting for input.');},300000);meshserver.send({action:'runcommands',nodeids:[nodeId],type:types[item.shell]||1,cmds:item.command,runAsUser:item.runAs|0,reply:true,responseid:rid});if(!bulk)P.dplShowOutput(rid);return false; };
    obj.dplIntercept = function (message) { var P=pluginHandler.devicepropertieslinks,st=P.dplState();if(message&&message.event&&(message.event.action==='changenode'||message.event.action==='nodemeshchange')){var nodeId=message.event.nodeid||(message.event.node&&message.event.node._id);if(window.currentNode&&nodeId===currentNode._id)setTimeout(function(){if(window.currentNode&&currentNode._id===nodeId&&typeof meshserver!=='undefined'&&meshserver&&meshserver.State===2)meshserver.send({action:'plugin',plugin:'devicepropertieslinks',pluginaction:'getDevice',nodeId:nodeId});},100);}if(!message||typeof message!=='object')return;if(message.action==='msg'&&message.type==='console'&&typeof message.value==='string'){Object.keys(st.pending).forEach(function(rid){var pending=st.pending[rid];if(pending.collect&&pending.nodeId===message.nodeid){pending.output+=message.value+'\n';var live=document.getElementById('dplOutput');if(live&&live.dataset.rid===rid){live.textContent=pending.output;live.scrollTop=live.scrollHeight;}}});return;}if(!message.responseid||!st.pending[message.responseid])return;var e=st.pending[message.responseid];if(message.action==='msg'&&message.type==='runcommands'){e.output=typeof message.result==='string'?message.result:JSON.stringify(message.result,null,2);P.dplFinish(message.responseid,null);}else if(message.action==='runcommands'&&message.result!=='OK'){P.dplFinish(message.responseid,String(message.result||'Command failed'));} };
    obj.dplFinish = function (rid,error) { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),e=st.pending[rid];if(!e)return;delete st.pending[rid];if(e.timer)clearTimeout(e.timer);e.state=error?'error':'done';e.error=error;e.ms=Date.now()-e.start;var pre=document.getElementById('dplOutput');if(pre&&pre.dataset.rid===rid)pre.textContent=error?error+(e.output?'\n'+e.output:''):(e.output||'(no output)');if(e.bulk)P.dplBulkPicker(st.bulkIds||[]); };
    obj.dplShowOutput = function (rid) { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),e=st.pending[rid]||st.log.find(function(x){return x.rid===rid;});if(!e)return false;var html='<div class="ui header">'+P.dplEsc(e.item.name)+' <span class="sub header">on '+P.dplEsc(e.nodeName)+'</span></div><pre id="dplOutput" data-rid="'+P.dplEsc(rid)+'" class="ui inverted segment dpl-output">'+P.dplEsc(e.output||'Running…')+'</pre>';return P.dplDialog('Quick command output',1,null,html,true); };
    obj.dplTypeTerminal = function (nodeId,item) { if(!window.currentNode||currentNode._id!==nodeId){return pluginHandler.devicepropertieslinks.dplExec(nodeId,item,false);}if(typeof go==='function')go(12);var send=function(){var t=window.terminal;if(t&&typeof t.TermSendKeys==='function')t.TermSendKeys(item.command.replace(/\r?\n/g,'\r')+'\r');else if(t&&typeof t.sendText==='function')t.sendText(item.command.replace(/\r?\n/g,'\r')+'\r');};if(typeof terminal==='undefined'||!terminal){try{connectTerminal(null,1,item.shell==='ps'?{protocol:6}:{});}catch(e){}}setTimeout(send,1200);return false; };
    obj.dplRenderItems = function () { var P=pluginHandler.devicepropertieslinks,st=P.dplState(); if(!window.currentNode)return;var data=st.devices[currentNode._id];if(!data)return;var commands=(data.items||[]).filter(function(x){return x.kind==='command'&&x.showTerminal;});var host=document.querySelector('#termTable table');var old=document.getElementById('dplTerminalStrip');if(old)old.remove();if(host&&commands.length){var tr=document.createElement('tr');tr.id='dplTerminalStrip';var td=document.createElement('td');td.colSpan=20;var label=document.createElement('b');label.textContent='Quick commands: ';td.appendChild(label);commands.forEach(function(item){var b=document.createElement('button');b.type='button';b.className='ui mini button';b.textContent=item.name;b.title=item.description;b.onclick=function(){return P.dplRun(currentNode._id,item.id);};td.appendChild(b);});tr.appendChild(td);host.appendChild(tr);} };
    obj.dplRestoreQuickCommands = function () { var Q=pluginHandler.quickcommands;if(!Q)return;try{if(typeof Q.qcState==='function'&&typeof Q.qcRequestConfig==='function'){var st=Q.qcState();if(st.config==null)Q.qcRequestConfig();}if(typeof Q.qcRenderGeneral==='function')Q.qcRenderGeneral();}catch(e){} };
    obj.dplMyDevicesInit = function () { var P=pluginHandler.devicepropertieslinks,st=P.dplState();if(st.myDevicesInit)return;st.myDevicesInit=true;setTimeout(function(){var ga=document.getElementById('GroupActionButton');if(ga&&!document.getElementById('dplBulkButton')){var b=document.createElement('button');b.id='dplBulkButton';b.type='button';b.className=ga.className+' ui mini button';b.textContent='⚡ Links & Properties';b.disabled=ga.disabled;b.onclick=P.dplBulkOpen;ga.parentNode.insertBefore(b,ga.nextSibling);new MutationObserver(function(){b.disabled=ga.disabled;}).observe(ga,{attributes:true});}var cm=document.getElementById('contextMenu');if(cm&&!document.getElementById('dplContextItem')){var item=document.createElement('div');item.id='dplContextItem';item.className='cmtext';item.style.display='none';item.textContent='⚡ Links & Properties ▸';item.onclick=function(){P.dplContextUpdate(true);};cm.appendChild(item);if(typeof handleContextMenu==='function'){var original=handleContextMenu;window.handleContextMenu=function(){var r=original.apply(this,arguments);setTimeout(function(){P.dplContextUpdate(false);},0);return r;};}}},500); };
    obj.dplBulkOpen = function () { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),ids=typeof getCheckedDevices==='function'?getCheckedDevices():[];if(!ids.length)return false;st.bulkIds=ids;st.bulkWaiting={};ids.forEach(function(id){st.bulkWaiting[id]=true;meshserver.send({action:'plugin',plugin:'devicepropertieslinks',pluginaction:'getDevice',nodeId:id});});return false; };
    obj.dplBulkPicker = function (ids) { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),catalog={};ids.forEach(function(id){var d=st.devices[id];(d&&d.items||[]).filter(function(x){return x.kind==='command'&&x.mode!=='terminal';}).forEach(function(x){if(!catalog[x.id])catalog[x.id]={item:x,nodes:[]};catalog[x.id].nodes.push({id:id,item:x});});});var html='<div class="dpl-item-row">';Object.keys(catalog).forEach(function(id){var x=catalog[id];html+='<button class="ui button dpl-key" onclick="return pluginHandler.devicepropertieslinks.dplBulkRun(\''+P.dplEsc(id)+'\')"><span class="dpl-key-name"><span class="dpl-kind">'+P.dplEsc(x.item.shell.toUpperCase())+'</span>'+P.dplEsc(x.item.name)+'</span><span class="dpl-key-desc">'+x.nodes.length+' of '+ids.length+' device(s)</span></button>';});html+='</div>';if(!Object.keys(catalog).length)html+='<p>No matching runnable commands.</p>';if(st.bulkRunList&&st.bulkRunList.length){html+='<h3>Latest results</h3>';st.bulkRunList.forEach(function(e){html+='<div style="display:flex;gap:8px;padding:5px;border-bottom:1px solid #ccc"><b>'+P.dplEsc(e.nodeName)+'</b><span style="flex:1">'+P.dplEsc(e.state==='running'?'Running…':(e.error||'Complete'))+'</span><button class="ui mini button" onclick="return pluginHandler.devicepropertieslinks.dplShowOutput(\''+P.dplEsc(e.rid)+'\')">View output</button></div>';});}st.bulkCatalog=catalog;return P.dplDialog('Quick commands for '+ids.length+' devices',1,null,html,true); };
    obj.dplBulkRun = function (id) { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),entry=st.bulkCatalog&&st.bulkCatalog[id];if(!entry)return false;P.dplDialogClose();if(entry.item.confirm&&!window.confirm(entry.item.confirmation||('Run '+entry.item.name+' on '+entry.nodes.length+' devices?')))return false;st.bulkRunList=[];entry.nodes.forEach(function(n){P.dplExec(n.id,n.item,true);});setTimeout(function(){P.dplBulkPicker(st.bulkIds||[]);},400);return false; };
    obj.dplContextUpdate = function (open) { var P=pluginHandler.devicepropertieslinks,st=P.dplState(),item=document.getElementById('dplContextItem');if(!item)return false;var id=(typeof currentNodeId==='string'?currentNodeId:(typeof contextMenuNode!=='undefined'&&contextMenuNode?contextMenuNode._id:null));if(!id&&typeof getCheckedDevices==='function'){var a=getCheckedDevices();id=a.length===1?a[0]:null;}st.contextNodeId=id;item.style.display=id?'':'none';if(open&&id){st.bulkIds=[id];st.bulkWaiting={};st.bulkWaiting[id]=true;meshserver.send({action:'plugin',plugin:'devicepropertieslinks',pluginaction:'getDevice',nodeId:id});}return false; };
    obj.dplContextHide = function () { var item=document.getElementById('dplContextItem');if(item)item.style.display='none'; };

    obj.devicePropertiesLinksDeviceData = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        var dplState = pluginHandler.devicepropertieslinks.dplState(); dplState.devices[message.nodeId] = message;
        if (dplState.bulkWaiting) { delete dplState.bulkWaiting[message.nodeId]; if (Object.keys(dplState.bulkWaiting).length === 0) pluginHandler.devicepropertieslinks.dplBulkPicker(dplState.bulkIds || []); }
        if (!window.currentNode || message.nodeId !== window.currentNode._id) return;

        var oldSection = document.getElementById('devicePropertiesLinksSection');
        if (oldSection) oldSection.remove();
        var items = Array.isArray(message.items) ? message.items.filter(function (item) { return item.showGeneral !== false; }) : [];
        if (items.length) {
            var anchor = document.getElementById('p10html2') || document.getElementById(window.currentNode.mtype === 3 ? 'p10html5' : 'p10html3');
            if (anchor && anchor.parentNode) {
                var section = document.createElement('section');
                section.id = 'devicePropertiesLinksSection';
                section.className = 'ui segments';
                var heading = document.createElement('div');
                heading.className = 'ui top attached header dpl-section-title';
                heading.textContent = 'Links';
                section.appendChild(heading);
                var body=document.createElement('div');body.className='ui attached segment dpl-items-body';section.appendChild(body);
                function renderItemRows(container,list){var rows={};list.forEach(function(item){var key=String(item.row||1);if(!rows[key])rows[key]=[];rows[key].push(item);});Object.keys(rows).sort(function(a,b){return Number(a)-Number(b);}).forEach(function(rowNumber){var row=document.createElement('div');row.className='ui basic segment dpl-item-row';rows[rowNumber].sort(function(a,b){return(a.position-b.position)||String(a.name).localeCompare(String(b.name));}).forEach(function(item){var button=document.createElement('button');button.type='button';button.className='ui button dpl-key';if(item.color)button.style.setProperty('--dpl-color',item.color);button.title=item.hint||item.description||'';button.onclick=function(){return pluginHandler.devicepropertieslinks.dplRun(message.nodeId,item.id);};var name=document.createElement('span');name.className='dpl-key-name';var badge=document.createElement('span');badge.className='ui mini label dpl-kind';badge.textContent=item.kind==='command'?(item.shell==='ps'?'PS':String(item.shell||'CMD').toUpperCase()):'LINK';name.appendChild(badge);name.appendChild(document.createTextNode(item.name));var desc=document.createElement('span');desc.className='dpl-key-desc';desc.textContent=item.description||(item.kind==='command'?String(item.command).split(/\r?\n/)[0]:item.url);button.append(name,desc);row.appendChild(button);});container.appendChild(row);});}
                var groups=Array.isArray(message.displayGroups)?message.displayGroups.slice().sort(function(a,b){return(a.order-b.order)||String(a.name).localeCompare(String(b.name));}):[],groupIds={};groups.forEach(function(group){groupIds[group.id]=true;});var individual=items.filter(function(item){return!item.displayGroupId||!groupIds[item.displayGroupId];});if(individual.length)renderItemRows(body,individual);groups.forEach(function(group){var grouped=items.filter(function(item){return item.displayGroupId===group.id;});if(!grouped.length)return;var panel=document.createElement('section');panel.className='ui segments dpl-local-group';panel.style.setProperty('--dpl-group-color',group.color||'#2458b8');var groupHeading=document.createElement('div');groupHeading.className='ui secondary segment dpl-local-group-title';var groupName=document.createElement('span');groupName.className='ui header';groupName.textContent=group.name;if(group.description){var groupDescription=document.createElement('span');groupDescription.className='ui basic label dpl-local-group-description';groupDescription.textContent=group.description;groupHeading.append(groupName,groupDescription);}else groupHeading.appendChild(groupName);panel.appendChild(groupHeading);renderItemRows(panel,grouped);body.appendChild(panel);});
                var quickCommandsPanel = document.getElementById('qcGeneral');
                if (quickCommandsPanel && quickCommandsPanel.parentNode === anchor.parentNode) {
                    anchor.parentNode.insertBefore(section, quickCommandsPanel);
                } else {
                    anchor.parentNode.insertBefore(section, anchor);
                }
            }
        }
        pluginHandler.devicepropertieslinks.dplRenderItems();
        setTimeout(function () { pluginHandler.devicepropertieslinks.dplRestoreQuickCommands(); }, 0);

        var definitions = Array.isArray(message.definitions) ? message.definitions : [];
        var informationDefinitions=definitions.filter(function(definition){return definition.propertyMode==='readonly'||definition.computed===true;});
        var inputDefinitions=definitions.filter(function(definition){return informationDefinitions.indexOf(definition)<0;});
        var propertiesPanel=pluginHandler.devicepropertieslinks.dplInstallPropertiesPage();
        var propertiesTab=document.getElementById('MainDevProperties');
        var informationTab=document.getElementById('MainDevInformation');
        var oldPage = document.getElementById('devicePropertiesPage'), oldInformationPage=document.getElementById('deviceInformationPage');
        if(propertiesTab)propertiesTab.style.display=inputDefinitions.length?'':'none';if(informationTab)informationTab.style.display=informationDefinitions.length?'':'none';var propertiesHeading=document.getElementById('dplPropertiesHeading');if(propertiesHeading)propertiesHeading.textContent='Properties - '+(window.currentNode.name||window.currentNode._id||'Device');var informationHeading=document.getElementById('dplInformationHeading');if(informationHeading)informationHeading.textContent='Information - '+(window.currentNode.name||window.currentNode._id||'Device');

        var page = document.getElementById('devicePropertiesPage'), informationPage=document.getElementById('deviceInformationPage');
        if (!page) return;
        page.replaceChildren();if(informationPage)informationPage.replaceChildren();
        var form = document.createElement('div');
        form.className = 'ui form segment dpl-properties';
        var status = document.createElement('div');
        status.id = 'devicePropertiesLinksDeviceStatus';
        status.className = 'ui message dpl-status';
        form.appendChild(status);
        var values = message.values && typeof message.values === 'object' ? message.values : {};
        var valueSources = message.valueSources && typeof message.valueSources === 'object' ? message.valueSources : {};
        function applyInputMask(value, mask) {
            value = String(value == null ? '' : value);
            if (!mask) return value;
            if (mask.transform === 'upper') value = value.toUpperCase();
            if (mask.transform === 'lower') value = value.toLowerCase();
            if (!mask.pattern) return value;
            var source = value.replace(/[^A-Za-z0-9]/g, '');
            var output = '', index = 0;
            for (var maskIndex = 0; maskIndex < mask.pattern.length && index < source.length; maskIndex++) {
                var token = mask.pattern[maskIndex];
                if (token === '0' || token === 'A' || token === '*') {
                    while (index < source.length) {
                        var character = source[index++];
                        if ((token === '0' && /[0-9]/.test(character)) || (token === 'A' && /[A-Za-z]/.test(character)) || (token === '*' && /[A-Za-z0-9]/.test(character))) { output += character; break; }
                    }
                } else output += token;
            }
            return output;
        }

        var libraries = window.TechWizardPropertyLibraries;
        var hasAdvancedSchema=false;
        if (hasAdvancedSchema && libraries && libraries.Jedison && message.formSchema) {
            if (window.__devicePropertiesLinksJedison && typeof window.__devicePropertiesLinksJedison.destroy === 'function') window.__devicePropertiesLinksJedison.destroy();
            var editor = new libraries.Jedison.Create({ container: form, theme: new libraries.Jedison.Theme(), schema: message.formSchema, data: values, showErrors: 'change', assertFormat: true });
            window.__devicePropertiesLinksJedison = editor;
            if (!message.canEdit && typeof editor.disable === 'function') editor.disable();
            window.setTimeout(function () {
                definitions.forEach(function (definition) {
                    if (!definition.inputMask || !definition.inputMask.pattern) return;
                    try {
                        var instance = editor.getInstance('#/' + definition.key), input = instance && instance.ui && instance.ui.control && instance.ui.control.input;
                        if (input) libraries.IMask(input, { mask: definition.inputMask.pattern, lazy: !definition.inputMask.placeholder });
                    } catch (error) { }
                });
            }, 0);
            if (message.canEdit) {
                var schemaActions = document.createElement('div'); schemaActions.className = 'dpl-actions';
                var schemaSave = document.createElement('button'); schemaSave.type = 'button'; schemaSave.className='ui primary button'; schemaSave.textContent = 'Save properties';
                schemaSave.onclick = function () {
                    if (typeof editor.getErrors === 'function' && editor.getErrors().length) { if (typeof editor.showValidationErrors === 'function') editor.showValidationErrors(); return; }
                    schemaSave.disabled = true;
                    var outgoing = editor.getValue(); definitions.forEach(function (definition) { if (definition.computed || (valueSources[definition.key] === 'default' && JSON.stringify(outgoing[definition.key]) === JSON.stringify(values[definition.key]))) delete outgoing[definition.key]; });
                    meshserver.send({ action: 'plugin', plugin: 'devicepropertieslinks', pluginaction: 'saveDeviceValues', nodeId: message.nodeId, values: outgoing });
                };
                schemaActions.appendChild(schemaSave); form.appendChild(schemaActions);
            }
            page.appendChild(form); window.__devicePropertiesLinksCurrentData = message; return;
        }

        definitions.forEach(function (definition) {
            var field = document.createElement('div');
            field.className = 'field dpl-field';
            var labelBox = document.createElement('div');
            var label = document.createElement('div');
            label.className = 'ui label dpl-label';
            label.textContent = definition.label;
            label.style.color=definition.labelColor||'#071a4a';label.style.backgroundColor=definition.labelBackgroundColor||'transparent';label.style.fontWeight=definition.labelBold===false?'400':'700';label.style.fontStyle=definition.labelItalic===true?'italic':'normal';label.style.textDecoration=definition.labelUnderline===true?'underline':'none';label.style.padding='3px 5px';label.style.borderRadius='3px';
            labelBox.appendChild(label);
            if (definition.propertyMode !== 'readonly' && definition.computed !== true && valueSources[definition.key] === 'default') {
                var source = document.createElement('div');
                source.className = 'ui tiny basic label dpl-help';
                source.textContent = 'Default value';
                labelBox.appendChild(source);
            }
            if (definition.description) {
                var help = document.createElement('div');
                help.className = 'ui tiny basic label dpl-help';
                help.textContent = definition.description;
                labelBox.appendChild(help);
            }
            var controlRow = document.createElement('div');
            controlRow.className = 'field dpl-control-row';
            var control, readOnly=definition.propertyMode==='readonly'||definition.computed===true;
            if (readOnly) { control=document.createElement('div');control.className='dpl-readonly-value'; }
            else if (definition.type === 'multiline' || definition.type === 'tags') control = document.createElement('textarea');
            else if (definition.type === 'select' || definition.type === 'multiselect' || definition.type === 'boolean') { control = document.createElement('select'); control.className='ui fluid dropdown'; }
            else control = document.createElement('input');
            control.dataset.propertyKey = definition.key;
            control.dataset.propertyType = definition.type;
            control.dataset.valueSource = valueSources[definition.key] || '';
            control.disabled = readOnly || !message.canEdit;
            if(readOnly){control.style.color=definition.valueColor||'#071a4a';control.style.backgroundColor=definition.valueBackgroundColor||'transparent';control.style.fontWeight=definition.valueBold===true?'700':'400';control.style.fontStyle=definition.valueItalic===true?'italic':'normal';control.style.textDecoration=definition.valueUnderline===true?'underline':'none';}
            var value = values[definition.key];
            if (readOnly) {
                control.textContent=value==null?'':(typeof value==='object'?JSON.stringify(value):String(value));
            } else if (definition.type === 'boolean') {
                [['', 'Not set'], ['true', 'Yes'], ['false', 'No']].forEach(function (pair) { var option = document.createElement('option'); option.value = pair[0]; option.textContent = pair[1]; control.appendChild(option); });
                control.value = value === true ? 'true' : (value === false ? 'false' : '');
            } else if (definition.type === 'select') {
                var empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Not set'; control.appendChild(empty);
                (definition.options || []).forEach(function (item) { var option = document.createElement('option'); option.value = item.value; option.textContent = item.label; control.appendChild(option); });
                control.value = value == null ? '' : String(value);
            } else if (definition.type === 'multiselect') {
                control.multiple = true;
                control.size = Math.min(Math.max((definition.options || []).length, 2), 8);
                (definition.options || []).forEach(function (item) { var option = document.createElement('option'); option.value = item.value; option.textContent = item.label; option.selected = Array.isArray(value) && value.indexOf(item.value) >= 0; control.appendChild(option); });
            } else if (definition.type === 'tags') {
                control.value = Array.isArray(value) ? value.join(', ') : '';
            } else {
                if (definition.type === 'url') control.type = 'url';
                if (definition.type === 'number' || definition.type === 'integer' || definition.type === 'range') { control.type = definition.type === 'range' ? 'range' : 'number'; if (definition.type === 'integer') control.step = '1'; if (definition.minimum != null) control.min = definition.minimum; if (definition.maximum != null) control.max = definition.maximum; if (definition.step != null) control.step = definition.step; }
                if (definition.type === 'date') control.type = 'date';
                if (definition.type === 'time') control.type = 'time';
                if (definition.type === 'datetime') control.type = 'datetime-local';
                if (definition.type === 'month') control.type = 'month';
                if (definition.type === 'week') control.type = 'week';
                if (definition.type === 'email') control.type = 'email';
                if (definition.type === 'password') control.type = 'password';
                if (definition.type === 'tel') control.type = 'tel';
                if (definition.type === 'color') control.type = 'color';
                if (definition.type === 'text') control.type = 'text';
                control.value = value == null ? '' : (definition.type === 'datetime' ? String(value).replace(/Z$/, '').slice(0, 16) : String(value));
            }
            control.dataset.originalValue = readOnly ? '' : (definition.type === 'multiselect' ? JSON.stringify(Array.from(control.selectedOptions).map(function(option){return option.value;})) : control.value);
            if (!readOnly && definition.inputMask) {
                if (definition.inputMask.placeholder) control.placeholder = definition.inputMask.placeholder;
                if (definition.inputMask.pattern || definition.inputMask.transform !== 'none') {
                    control.oninput = function () { var end = control.selectionStart; control.value = applyInputMask(control.value, definition.inputMask); try { control.setSelectionRange(end, end); } catch (ex) { } };
                }
            }
            controlRow.appendChild(control);
            if (definition.type === 'url' && value) {
                var open = document.createElement('button');
                open.type = 'button'; open.className='ui button'; open.textContent = 'Open';
                open.onclick = function () { window.open(control.value, '_blank', 'noopener,noreferrer'); };
                controlRow.appendChild(open);
            }
            if (definition.type === 'number' && definition.unit) {
                var unit = document.createElement('span'); unit.textContent = definition.unit; controlRow.appendChild(unit);
            }
            field.appendChild(labelBox); field.appendChild(controlRow); form.appendChild(field);
        });
        if (message.canEdit) {
            var actions = document.createElement('div'); actions.className = 'dpl-actions';
            var save = document.createElement('button'); save.type = 'button'; save.className='ui primary button'; save.textContent = 'Save properties';
            save.onclick = function () {
                var outgoing = {};
                form.querySelectorAll('[data-property-key]').forEach(function (control) {
                    if (control.disabled) return;
                    var type=control.dataset.propertyType,current=control.value,comparison=current;
                    if(type==='multiselect'){current=Array.from(control.selectedOptions).map(function(option){return option.value;});comparison=JSON.stringify(current);}
                    if(type==='tags')current=current.split(',').map(function(value){return value.trim();}).filter(function(value,index,list){return value&&list.indexOf(value)===index;});
                    if(type==='datetime'&&current)current=new Date(current).toISOString();
                    if (control.dataset.valueSource === 'default' && comparison === control.dataset.originalValue) return;
                    if (type === 'boolean') outgoing[control.dataset.propertyKey] = current === '' ? null : current === 'true';
                    else outgoing[control.dataset.propertyKey] = current;
                });
                save.disabled = true;
                meshserver.send({ action: 'plugin', plugin: 'devicepropertieslinks', pluginaction: 'saveDeviceValues', nodeId: message.nodeId, values: outgoing });
            };
            actions.appendChild(save); form.appendChild(actions);
        }
        page.appendChild(form);
        if(informationPage&&informationDefinitions.length){var informationForm=document.createElement('div');informationForm.className='ui form segment dpl-properties dpl-information';informationDefinitions.forEach(function(definition){var control=form.querySelector('[data-property-key="'+definition.key.replace(/"/g,'\\"')+'"]');var field=control&&control.closest('.dpl-field');if(field)informationForm.appendChild(field);});informationPage.appendChild(informationForm);}
        if(!inputDefinitions.length)form.remove();
        window.__devicePropertiesLinksCurrentData = message;
    };

    obj.devicePropertiesLinksOperationResult = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        if (message.nodeId && window.currentNode && message.nodeId !== window.currentNode._id) return;
        var status = document.getElementById('devicePropertiesLinksDeviceStatus');
        if (status) { status.className = 'ui message dpl-status ' + (message.success ? 'positive ok' : 'negative error'); status.textContent = String(message.message || ''); }
        var save = document.querySelector('#devicePropertiesPage .dpl-actions button');
        if (save) save.disabled = false;
    };

    obj.devicePropertiesLinksAdminData = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        var iframe = document.getElementById('p43iframe');
        if (iframe && iframe.contentWindow && iframe.contentWindow.DevicePropertiesLinksAdmin) iframe.contentWindow.DevicePropertiesLinksAdmin.receiveData(message.config, message.inventory, message.permissions, message.presets);
    };

    obj.devicePropertiesLinksAdminResult = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        var iframe = document.getElementById('p43iframe');
        if (iframe && iframe.contentWindow && iframe.contentWindow.DevicePropertiesLinksAdmin) iframe.contentWindow.DevicePropertiesLinksAdmin.receiveResult(Boolean(message.success), String(message.message || ''), message.requestId || null, message.config || null);
    };

    obj.devicePropertiesLinksFormulaPreview = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        var iframe = document.getElementById('p43iframe');
        if (iframe && iframe.contentWindow && iframe.contentWindow.DevicePropertiesLinksAdmin) iframe.contentWindow.DevicePropertiesLinksAdmin.receiveFormulaPreview(message);
    };

    obj.devicePropertiesLinksDataSourcePreview = function (message) {
        message = (message && message.event) ? message.event : (message || {});
        var iframe = document.getElementById('p43iframe');
        if (iframe && iframe.contentWindow && iframe.contentWindow.DevicePropertiesLinksAdmin) iframe.contentWindow.DevicePropertiesLinksAdmin.receiveDataSourcePreview(message);
    };

    obj._test = {
        sanitizeRule: sanitizeRule,
        evaluateRule: evaluateRule,
        effectiveItemRule: effectiveItemRule,
        validateValue: validateValue,
        replaceTemplate: replaceTemplate,
        renderTemplate: renderTemplate,
        evaluateExpression: evaluateExpression,
        resolvePropertyValues: resolvePropertyValues,
        validLinkUri: validLinkUri,
        sanitizeConfig: sanitizeConfig,
        sanitizePresetCatalog: sanitizePresetCatalog,
        formSchema: formSchema,
        contextFor: contextFor,
        contextWithoutDevice: contextWithoutDevice,
        dataSourceDependencies: dataSourceDependencies,
        composeDataSourceOutputExpression: composeDataSourceOutputExpression,
        wildcardFilterParts: wildcardFilterParts,
        wildcardMatches: wildcardMatches,
        evaluateDataSourceOutput: evaluateDataSourceOutput,
        dataSourceReferenceUsage: dataSourceReferenceUsage,
        dataSourceDeletionError: dataSourceDeletionError,
        dataSourceExecutionOrder: dataSourceExecutionOrder,
        dataSourceDependencyClosure: dataSourceDependencyClosure,
        fetchFailureMessage: fetchFailureMessage,
        inspectTlsCertificate: inspectTlsCertificate,
        selectDatabaseOutput: selectDatabaseOutput
    };
    return obj;
};
