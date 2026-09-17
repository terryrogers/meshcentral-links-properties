"use strict";

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const factory = require('../devicepropertieslinks.js').devicepropertieslinks;

const db = {};
const root = { db: db, args: {}, DispatchEvent: function () {} };
let registeredPermissions = null;
const pluginHandler = {
    parent: root,
    registerPermissions: function (pluginName, permissions) { registeredPermissions = permissions; },
    checkPluginPermission: function () { return false; }
};
const plugin = factory(pluginHandler);
const test = plugin._test;
assert.ok(registeredPermissions.manage_data_sources, 'Data Source management must have a dedicated plugin permission');
assert.strictEqual(registeredPermissions.manage_data_sources.default, 'denied');

function condition(field, op, value) { return { kind: 'condition', field: field, op: op, value: value }; }
function group(op, children) { return { kind: 'group', op: op, children: children }; }

const context = {
    nodeId: 'node/example.test/udr7', groupId: 'mesh/example.test/lab', tags: ['Gateway', 'Unify'],
    deviceName: 'UDR7', hostname: '192.0.2.254', ip: '192.0.2.254', groupName: 'Example Site 49',
    system: { serverName: 'Example Site', dnsName: 'meshcentral.example.test', serverUrl: 'https://meshcentral.example.test/', domain: 'example.test' },
    userId: 'user/example.test/tester', userGroups: ['ugrp/example.test/admins'], pluginGroups: [],
    now: '2026-08-28T10:11:12.000Z'
};

const deviceFreeContext = test.contextWithoutDevice({
    user: { _id: 'user/example.test/tester', name: 'tester', email: 'tester@example.test' },
    domain: { id: 'example.test', title: 'Example Site', dns: 'meshcentral.example.test' }
});
assert.strictEqual(deviceFreeContext.nodeId, '', 'device-free preview must not invent a device');
assert.strictEqual(deviceFreeContext.groupId, '', 'device-free preview must not invent a group');
assert.strictEqual(deviceFreeContext.userName, 'tester', 'device-free preview must retain user variables');
assert.strictEqual(deviceFreeContext.system.serverName, 'Example Site', 'device-free preview must retain system variables');
assert.strictEqual(test.renderTemplate('https://{system.dnsName}/api', deviceFreeContext, {}), 'https://meshcentral.example.test/api');

const requestedRule = group('and', [
    condition('group', 'is', 'mesh/example.test/lab'),
    condition('tag', 'is', 'Gateway'),
    condition('device', 'isNot', 'node/example.test/excluded')
]);
assert.strictEqual(test.evaluateRule(requestedRule, context), true, 'group AND tag AND NOT device should match');
assert.strictEqual(test.evaluateRule(group('and', [condition('device', 'isNot', context.nodeId)]), context), false, 'explicit device exclusion should apply');
assert.strictEqual(test.evaluateRule(group('or', [condition('tag', 'is', 'Missing'), condition('tag', 'is', 'Unify')]), context), true, 'ANY group should match one child');
assert.strictEqual(test.evaluateRule(group('not', [condition('tag', 'is', 'Missing'), condition('device', 'is', 'node/example.test/other')]), context), true, 'NONE group should match when no child matches');
assert.strictEqual(test.evaluateRule(group('not', [condition('tag', 'is', 'Gateway')]), context), false, 'NONE group should fail when a child matches');
assert.strictEqual(test.evaluateRule(group('and', []), context), true, 'empty ALL group should be global');
assert.strictEqual(test.evaluateRule(group('and', [condition('user', 'is', context.userId), condition('userGroup', 'is', context.userGroups[0])]), context), true, 'user and user-group rules should match the signed-in user');

assert.deepStrictEqual(test.sanitizeRule(requestedRule, 0, { count: 0 }), requestedRule, 'valid rule should survive sanitisation');
assert.throws(function () { test.sanitizeRule(condition('bad', 'is', 'x'), 0, { count: 0 }); }, /unsupported field/);

const definitions = {
    url: { label: 'Management URL', type: 'url' },
    text: { label: 'Name', type: 'text' },
    number: { label: 'Rack Units', type: 'number', minimum: 1, maximum: 10 },
    multiline: { label: 'Notes', type: 'multiline' },
    boolean: { label: 'Managed', type: 'boolean' },
    date: { label: 'Installed', type: 'date' },
    select: { label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] }
};
assert.strictEqual(test.validateValue(definitions.url, 'https://192.0.2.254/'), 'https://192.0.2.254/');
assert.throws(function () { test.validateValue(definitions.url, 'javascript:alert(1)'); }, /HTTP or HTTPS/);
assert.strictEqual(test.validateValue(definitions.text, ' Router '), 'Router');
assert.strictEqual(test.validateValue(definitions.number, '4'), 4);
assert.throws(function () { test.validateValue(definitions.number, 11); }, /no more than/);
assert.strictEqual(test.validateValue(definitions.multiline, 'Line 1\nLine 2'), 'Line 1\nLine 2');
assert.strictEqual(test.validateValue(definitions.boolean, false), false);
assert.strictEqual(test.validateValue(definitions.date, '2026-08-28'), '2026-08-28');
assert.throws(function () { test.validateValue(definitions.date, '2026-02-30'); }, /valid date/);
assert.strictEqual(test.validateValue(definitions.select, 'active'), 'active');
assert.throws(function () { test.validateValue(definitions.select, 'retired'); }, /invalid selection/);

assert.strictEqual(test.replaceTemplate('{property.managementUrl}', context, { managementUrl: 'https://192.0.2.254/' }), 'https://192.0.2.254/');
assert.strictEqual(test.replaceTemplate('https://{device.ip}/', context, {}), 'https://192.0.2.254/');
assert.strictEqual(test.replaceTemplate('{property.missing}', context, {}), null, 'missing values must suppress a link');
assert.strictEqual(test.replaceTemplate('javascript:alert(1)', context, {}, 'custom'), 'javascript:alert(1)', 'custom mode permits unknown or browser-handled schemes');
assert.strictEqual(test.replaceTemplate('ssh://{device.hostname}', context, {}, 'custom'), 'ssh://192.0.2.254', 'custom schemes should resolve in custom mode');
assert.strictEqual(test.replaceTemplate('unknown-handler:{device.id}', context, {}, 'custom'), 'unknown-handler:node/example.test/udr7', 'unknown OS-handler schemes should be permitted');
assert.strictEqual(test.replaceTemplate('file:///example/handler.exe', context, {}, 'custom'), 'file:///example/handler.exe', 'file URI handlers should be permitted in custom mode');
assert.strictEqual(test.replaceTemplate('ssh://{device.hostname}', context, {}, 'web'), null, 'custom schemes should be blocked in web mode');
assert.strictEqual(test.replaceTemplate('data:text/html,test', context, {}, 'data'), 'data:text/html,test', 'an explicitly selected IANA scheme should resolve');
assert.strictEqual(test.renderTemplate('{proper("the TECH wizard")}', context, {}), 'The Tech Wizard');
assert.strictEqual(test.renderTemplate('{upper(device.name)}-{lower(group.name)}', context, {}), 'UDR7-example site 49');
assert.strictEqual(test.renderTemplate('{concat(system.serverUrl, lower(device.name))}', context, {}), 'https://meshcentral.example.test/udr7');
assert.strictEqual(test.renderTemplate('{left(now(), 10)}', context, {}), new Date().toISOString().slice(0, 10));
assert.strictEqual(test.renderTemplate('{len(device.name)}', context, {}), '4');
assert.strictEqual(test.renderTemplate('{substring("abcdef", 2, 3)}', context, {}), 'cde');
assert.strictEqual(test.renderTemplate('{right("abcdef", 2)}', context, {}), 'ef');
assert.throws(function () { test.renderTemplate('{right(group.name)}', context, {}); }, /Function "right" expects 2 arguments but received 1/);
assert.throws(function () { test.renderTemplate('{left(group.name, 2, 3)}', context, {}); }, /Function "left" expects 2 arguments but received 3/);
assert.strictEqual(test.renderTemplate('{right(lower(group.name), 2)}', context, {}), '49', 'nested functions must retain correct argument counting');
assert.strictEqual(test.renderTemplate('{property.port + 1}', context, { port: 21 }), '22');
assert.strictEqual(test.renderTemplate('{multiply(3, 4)}', context, {}), '12');
assert.strictEqual(test.renderTemplate('{coalesce(property.missing, system.serverName)}', context, {}), 'Example Site');
assert.throws(function () { test.renderTemplate('{unknown(device.name)}', context, {}); }, /Unknown formula function/);

const resolved = test.resolvePropertyValues([
    { key: 'server', label: 'Server', type: 'text', valueTemplate: '{upper(device.name)}' },
    { key: 'port', label: 'Port', type: 'number', defaultTemplate: '{20 + 2}' },
    { key: 'today', label: 'Today', type: 'date', defaultTemplate: '{left(now(), 10)}' },
    { key: 'derived', label: 'Derived', type: 'text', defaultTemplate: '{concat(property.server, ":", property.port)}' }
], {}, context);
assert.deepStrictEqual(resolved.values, { server: 'UDR7', port: 22, today: new Date().toISOString().slice(0, 10), derived: 'UDR7:22' });
assert.strictEqual(resolved.sources.server, 'computed');
assert.strictEqual(resolved.sources.port, 'default');

const validatedDefinition = { label: 'Asset code', type: 'text', validation: { minimumLength: 6, maximumLength: 9, pattern: '^EX-[0-9]+$', flags: 'i', message: 'Use TTW followed by digits.' } };
assert.strictEqual(test.validateValue(validatedDefinition, 'ex-123'), 'ex-123');
assert.throws(function () { test.validateValue(validatedDefinition, 'wrong'); }, /Use TTW followed by digits/);

const allTypes = Object.keys(definitions).map(function (type, index) {
    const item = { id: 'property-' + index, key: type + 'Value', label: definitions[type].label, type: type, description: '', enabled: true, order: index, rule: group('and', []) };
    if (type === 'number') Object.assign(item, { minimum: 1, maximum: 10, step: 1, unit: 'U' });
    if (type === 'select') item.options = definitions.select.options;
    return item;
});
allTypes[0].defaultTemplate = '{concat("https://", device.ip)}';
const sanitised = test.sanitizeConfig({ revision: 0, properties: allTypes, links: [{ id: 'link-1', name: '{proper("management portal")}', urlTemplate: 'putty:{device.hostname}', defaultUrlTemplate: 'ssh://{device.hostname}', protocol: 'custom', enabled: true, order: 0, rule: requestedRule }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(sanitised.properties.length, 7);
assert.strictEqual(sanitised.schemaVersion, 3);
assert.strictEqual(sanitised.items.length, 1);
assert.strictEqual(sanitised.items[0].kind, 'link');
assert.strictEqual(sanitised.items[0].link.protocol, 'custom');
assert.strictEqual(sanitised.properties[0].defaultTemplate, '{concat("https://", device.ip)}');
const formerlyRequired = test.sanitizeConfig({ properties: [{ id: 'formerly-required', key: 'optional_value', label: 'Optional value', type: 'text', required: true, enabled: true, rule: group('and', []) }], links: [] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(Object.prototype.hasOwnProperty.call(formerlyRequired.properties[0], 'required'), false, 'Required must be removed from persisted property definitions');
assert.strictEqual(Object.prototype.hasOwnProperty.call(test.formSchema(formerlyRequired.properties), 'required'), false, 'device property schemas must not require values');
const commandConfig = test.sanitizeConfig({ properties: [], displayGroups: [{ id: 'tools', name: 'Tools', color: '#2458b8' }], items: [{ id: 'ping', kind: 'command', displayGroupId: 'tools', row: 2, position: 3, displayNameTemplate: 'Ping {device.name}', displayDescriptionTemplate: 'Test {device.hostname}', command: { shell: 'cmd', mode: 'run', commandTemplate: 'ping {device.hostname}', runAs: 0, confirm: false }, showGeneral: true, showTerminal: true, enabled: true, rule: group('and', []) }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(commandConfig.items[0].command.commandTemplate, 'ping {device.hostname}');
assert.strictEqual(commandConfig.items[0].row, 2);
const colouredLinkConfig = test.sanitizeConfig({ properties: [], displayGroups: [{ id: 'management', name: 'Management', color: '#123456' }], items: [{ id: 'link-iana', kind: 'link', displayGroupId: 'management', displayNameTemplate: 'SSH', displayDescriptionTemplate: 'Open SSH', hintTemplate: 'Connect to {device.name}', color: '#abcdef', link: { urlTemplate: 'ssh://{device.hostname}', protocol: 'ssh', target: 'new' }, enabled: true, rule: group('and', []) }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(colouredLinkConfig.items[0].link.protocol, 'ssh');
assert.strictEqual(colouredLinkConfig.items[0].color, '#abcdef');
assert.strictEqual(colouredLinkConfig.items[0].hintTemplate, 'Connect to {device.name}');
assert.strictEqual(colouredLinkConfig.items[0].ruleMode, 'override', 'pre-2.2 items without a rule mode must preserve their item rule');
assert.strictEqual(test.replaceTemplate('ssh://{device.hostname}', context, {}, 'ssh'), 'ssh://192.0.2.254');
assert.strictEqual(test.replaceTemplate('https://{device.hostname}', context, {}, 'ssh'), null, 'an explicit URI scheme must match the resolved URL');
const groupRule = group('and', [condition('group', 'is', context.groupId), condition('userGroup', 'is', context.userGroups[0])]);
const itemRule = group('and', [condition('device', 'is', 'node/example.test/other')]);
const ruleGroups = { management: { id: 'management', rule: groupRule } };
assert.deepStrictEqual(test.effectiveItemRule({ displayGroupId: 'management', ruleMode: 'inherit', rule: itemRule }, ruleGroups), groupRule, 'inherited items must use the local-group rule');
assert.deepStrictEqual(test.effectiveItemRule({ displayGroupId: 'management', ruleMode: 'override', rule: itemRule }, ruleGroups), itemRule, 'an item override must fully replace its item rule');
const legacyLocalGroupRule = group('and', [condition('pluginGroup', 'is', 'management')]);
assert.deepStrictEqual(test.sanitizeRule(legacyLocalGroupRule, 0, { count: 0 }), group('and', []), 'legacy local-group visibility conditions must be removed');
assert.deepStrictEqual(test.effectiveItemRule({ displayGroupId: 'management', ruleMode: 'override', rule: legacyLocalGroupRule }, ruleGroups), group('and', []), 'a legacy self-referencing local-group condition must not hide its item');
assert.throws(function () { test.sanitizeConfig({ properties: [allTypes[0], Object.assign({}, allTypes[1], { key: allTypes[0].key })], links: [] }, 'example.test', 'user/example.test/tester'); }, /keys must be unique/);
assert.throws(function () { test.sanitizeConfig({ properties: [Object.assign({}, allTypes[0], { label: '{bad(' })], links: [] }, 'example.test', 'user/example.test/tester'); }, /cannot contain formulas/);
assert.throws(function () { test.sanitizeConfig({ properties: [allTypes[0], Object.assign({}, allTypes[1], { label: allTypes[0].label })], links: [] }, 'example.test', 'user/example.test/tester'); }, /display names must be unique/i);
const readOnlyConfig = test.sanitizeConfig({ properties: [{ id: 'property-os', key: 'operating_system', label: 'Operating System', propertyMode: 'readonly', type: 'text', valueTemplate: '{device.name}', labelColor: '#123456', labelBackgroundColor: '#abcdef', labelBold: true, labelItalic: true, labelUnderline: true, valueColor: '#654321', valueBackgroundColor: '#fedcba', valueBold: true, valueItalic: true, valueUnderline: true, order: 12000, enabled: true, rule: group('and', []) }], links: [] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(readOnlyConfig.properties[0].propertyMode, 'readonly');
assert.strictEqual(readOnlyConfig.properties[0].defaultTemplate, '');
assert.strictEqual(readOnlyConfig.properties[0].labelColor, '#123456');
assert.strictEqual(readOnlyConfig.properties[0].valueColor, '#654321');
assert.strictEqual(readOnlyConfig.properties[0].valueBackgroundColor, '#fedcba');
assert.strictEqual(readOnlyConfig.properties[0].valueBold, true);
assert.strictEqual(readOnlyConfig.properties[0].order, 9999);
assert.throws(function () { test.sanitizeConfig({ properties: [{ id: 'property-empty', key: 'empty', label: 'Empty', propertyMode: 'readonly', type: 'text', valueTemplate: '', enabled: true, rule: group('and', []) }], links: [] }, 'example.test', 'user/example.test/tester'); }, /requires a computed value/);

const validationConfig = test.sanitizeConfig({ properties: [{ id: 'property-validation', key: 'assetCode', label: 'Asset code', type: 'text', validation: { preset: 'custom', minimumLength: 3, maximumLength: 20, pattern: '^EX-', flags: 'i', message: 'Invalid asset code.' }, inputMask: { pattern: 'AAA-0000', placeholder: 'EX-0000', transform: 'upper' }, enabled: true, rule: group('and', []) }], links: [] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(validationConfig.properties[0].validationEnabled, true, 'legacy configured validation must migrate as enabled');
assert.strictEqual(validationConfig.properties[0].inputMaskEnabled, true, 'legacy configured input masks must migrate as enabled');
assert.strictEqual(validationConfig.properties[0].validation.pattern, '^EX-');
assert.strictEqual(validationConfig.properties[0].inputMask.pattern, 'AAA-0000');
assert.strictEqual(validationConfig.properties[0].inputMask.transform, 'upper');
assert.strictEqual(validationConfig.properties[0].inputMask.preset, 'custom');
const disabledFeaturesConfig = test.sanitizeConfig({ properties: [{ id: 'property-disabled-features', key: 'plainValue', label: 'Plain value', type: 'text', validationEnabled: false, validation: { pattern: '[' }, inputMaskEnabled: false, inputMask: { pattern: 'AAA-0000' }, enabled: true, rule: group('and', []) }], links: [] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(disabledFeaturesConfig.properties[0].validationEnabled, false);
assert.strictEqual(disabledFeaturesConfig.properties[0].inputMaskEnabled, false);
assert.strictEqual(Object.prototype.hasOwnProperty.call(disabledFeaturesConfig.properties[0], 'validation'), false, 'disabled validation must not be retained or applied');
assert.strictEqual(Object.prototype.hasOwnProperty.call(disabledFeaturesConfig.properties[0], 'inputMask'), false, 'disabled input masks must not be retained or applied');
assert.throws(function () { test.sanitizeConfig({ properties: [{ id: 'bad-regex', key: 'badRegex', label: 'Bad regex', type: 'text', validation: { pattern: '[', flags: '' }, enabled: true, rule: group('and', []) }], links: [] }, 'example.test', 'user/example.test/tester'); }, /validation expression/);

assert.strictEqual(test.validateValue({ label: 'Count', type: 'integer' }, '7'), 7);
assert.throws(function () { test.validateValue({ label: 'Count', type: 'integer' }, '7.5'); }, /whole number/);
assert.deepStrictEqual(test.validateValue({ label: 'Roles', type: 'multiselect', options: [{ value: 'admin', label: 'Admin' }] }, ['admin']), ['admin']);
assert.throws(function () { test.validateValue({ label: 'Roles', type: 'multiselect', options: [{ value: 'admin', label: 'Admin' }] }, ['other']); }, /invalid selection/);
const apiConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'source-1', key: 'assets', name: 'Assets', method: 'GET', urlTemplate: 'https://api.example.test/assets/{device.id}', responseExpression: 'items', cacheTtlSeconds: 60, auth: { type: 'bearerEnv', tokenEnv: 'ASSET_API_TOKEN' }, rule: group('and', []) }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(apiConfig.schemaVersion, 3);
assert.strictEqual(apiConfig.dataSources[0].auth.tokenEnv, 'ASSET_API_TOKEN');
assert.strictEqual(apiConfig.dataSources[0].tlsVerify, true);
assert.strictEqual(Object.prototype.hasOwnProperty.call(apiConfig.dataSources[0], 'rule'), false, 'Data Sources must not retain Visibility rules');
const multiOutputConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'unifi-statistics', name: 'UniFi Device Statistics', method: 'GET', urlTemplate: 'https://192.0.2.10/proxy/network/integration/v1/sites/{siteId}/devices/{deviceId}/statistics/latest', tlsVerify: false, requestVariables: [{ key: 'siteId', valueTemplate: '{property.unifi_site_id}' }, { key: 'deviceId', valueTemplate: '{property.unifi_device_id}' }], outputs: [{ name: 'IP Address', key: 'ip_address', expression: 'ipAddress' }, { name: 'Firmware Version', key: 'firmware_version', expression: 'firmwareVersion' }, { name: 'Uplink Device ID', key: 'uplink_device_id', expression: 'uplink.deviceId' }], auth: { type: 'headerStored', headerName: 'X-API-Key', token: 'EXAMPLE_ONLY_NOT_A_SECRET' }, enabled: true, rule: group('and', []) }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(multiOutputConfig.dataSources[0].requestVariables[0].key, 'siteId');
assert.strictEqual(multiOutputConfig.dataSources[0].outputs[1].key, 'firmware_version');
assert.strictEqual(multiOutputConfig.dataSources[0].auth.type, 'headerStored');
assert.strictEqual(multiOutputConfig.dataSources[0].tlsVerify, false);
assert.strictEqual(multiOutputConfig.dataSources[0].auth.token, 'EXAMPLE_ONLY_NOT_A_SECRET');
assert.strictEqual(multiOutputConfig.dataSources[0].description, '', 'API descriptions must be persisted safely');
assert.strictEqual(test.composeDataSourceOutputExpression('data[]', "model == 'UDM Pro Max'", ''), "data[?model == 'UDM Pro Max'] | [0]");
assert.strictEqual(test.composeDataSourceOutputExpression('data[]', "model == 'UDM Pro Max'", 'id'), "data[?model == 'UDM Pro Max'] | [0].id");
const guidedOutputConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'guided-output', name: 'Guided Output', method: 'GET', urlTemplate: 'https://example.test/devices', outputs: [{ name: 'Gateway ID', key: 'gateway_id', inputExpression: 'data[]', filterExpression: "model == 'UDM Pro Max'", outputExpression: 'id' }] }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(guidedOutputConfig.dataSources[0].outputs[0].expression, "data[?model == 'UDM Pro Max'] | [0].id");
const globalFilterConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'global-filter', name: 'Global Filter', method: 'GET', urlTemplate: 'https://example.test/devices', outputFilterExpression: "model == '*UDM*'", outputs: [{ name: 'Gateway ID', key: 'gateway_id', inputExpression: 'data[]', outputExpression: 'id' }, { name: 'Gateway Name', key: 'gateway_name', inputExpression: 'data[]', filterExpression: "model == 'ignored'", outputExpression: 'name' }] }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(globalFilterConfig.dataSources[0].outputFilterExpression, "model == '*UDM*'");
assert.strictEqual(globalFilterConfig.dataSources[0].outputs[0].filterExpression, "model == '*UDM*'");
assert.strictEqual(globalFilterConfig.dataSources[0].outputs[1].filterExpression, "model == '*UDM*'");
const wildcardResponse = { data: [{ id: 'gateway', model: 'UDM Pro Max' }, { id: 'switch', model: 'USW Pro' }] };
assert.strictEqual(test.wildcardMatches('UDM Pro Max', '*UDM*'), true);
assert.strictEqual(test.wildcardMatches('udm pro max', '*U?M*'), true);
assert.strictEqual(test.wildcardMatches('USW Pro', '*U?M*'), false);
assert.deepStrictEqual(test.evaluateDataSourceOutput(wildcardResponse, { inputExpression: 'data[]', filterExpression: "model == '*UDM*'", outputExpression: '@' }), wildcardResponse.data[0]);
assert.strictEqual(test.evaluateDataSourceOutput(wildcardResponse, { inputExpression: 'data[]', filterExpression: "model == '*U?M*'", outputExpression: 'id' }), 'gateway');
assert.strictEqual(test.evaluateDataSourceOutput(wildcardResponse, { inputExpression: 'data[]', filterExpression: "(model == '*UDM*' || model == '*UXG*') && id == 'gateway'", outputExpression: 'id' }), 'gateway');
assert.strictEqual(test.evaluateDataSourceOutput(wildcardResponse, { inputExpression: 'data[]', filterExpression: "model == '*USW*' || (model == '*UDM*' && id == 'missing')", outputExpression: 'id' }), 'switch');
assert.strictEqual(test.evaluateDataSourceOutput(wildcardResponse, { inputExpression: 'data[]', filterExpression: "model != '*USW*' && (id == 'gateway')", outputExpression: 'id' }), 'gateway');
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ name: 'Invalid Compound Filter', method: 'GET', urlTemplate: 'https://example.test/devices', outputFilterExpression: "model == '*UDM*' &&", outputs: [{ name: 'ID', key: 'id', inputExpression: 'data[]', outputExpression: 'id' }] }] }, 'example.test', 'user/example.test/tester'); }, /invalid Input, Filter, or Output expression/);
const wildcardOutputConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'wildcard-output', name: 'Wildcard Output', method: 'GET', urlTemplate: 'https://example.test/devices', outputs: [{ name: 'Gateway ID', key: 'gateway_id', inputExpression: 'data[]', filterExpression: "model == '*U?M*'", outputExpression: 'id' }] }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(wildcardOutputConfig.dataSources[0].outputs[0].filterExpression, "model == '*U?M*'");

const staticListConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'static-statuses', name: 'Device Statuses', description: 'Friendly status choices', sourceType: 'staticList', entryMode: 'friendly', entries: [{ name: 'Online', value: 'online' }, { name: 'Offline', value: 'offline' }], output: { name: 'Status Options' }, enabled: false, rule: group('and', []) }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(staticListConfig.dataSources[0].key, 'device_statuses');
assert.strictEqual(staticListConfig.dataSources[0].output.key, 'status_options');
assert.strictEqual(staticListConfig.dataSources[0].description, 'Friendly status choices');
assert.strictEqual(staticListConfig.dataSources[0].enabled, false);

const databaseConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'database-assets', name: 'Asset Database', description: 'Read-only inventory lookup', sourceType: 'databaseQuery', databaseType: 'mariadb', connection: { host: 'mariadb', port: 3306, database: 'inventory', username: 'readonly', password: 'EXAMPLE_ONLY_NOT_A_SECRET', ssl: true }, queryTemplate: 'SELECT id, name FROM assets WHERE site = {property.site_id}', filterExpression: '[?id != null]', limit: 250, output: { name: 'Asset Rows', mode: 'cell', rowIndex: 1, column: 'name' }, enabled: true, rule: group('and', []) }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(databaseConfig.dataSources[0].databaseType, 'mariadb');
assert.strictEqual(databaseConfig.dataSources[0].connection.password, 'EXAMPLE_ONLY_NOT_A_SECRET');
assert.strictEqual(databaseConfig.dataSources[0].output.key, 'asset_rows');
assert.strictEqual(databaseConfig.dataSources[0].output.mode, 'cell');
assert.strictEqual(databaseConfig.dataSources[0].description, 'Read-only inventory lookup');
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ name: 'Unsafe Query', sourceType: 'databaseQuery', databaseType: 'mysql', connection: { host: 'db', database: 'inventory', username: 'readonly' }, queryTemplate: 'DELETE FROM assets', output: { name: 'Rows' } }] }, 'example.test', 'user/example.test/tester'); }, /read-only SELECT or WITH/);
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ name: 'Relative SQLite', sourceType: 'databaseQuery', databaseType: 'sqlite', connection: { filename: 'relative.sqlite' }, queryTemplate: 'SELECT 1', output: { name: 'Rows' } }] }, 'example.test', 'user/example.test/tester'); }, /absolute database filename/);
const databaseRows = [{ id: 1, name: 'Router' }, { id: 2, name: 'Switch' }];
assert.deepStrictEqual(test.selectDatabaseOutput(databaseRows, { mode: 'set' }), databaseRows);
assert.deepStrictEqual(test.selectDatabaseOutput(databaseRows, { mode: 'row', rowIndex: 1 }), databaseRows[1]);
assert.deepStrictEqual(test.selectDatabaseOutput(databaseRows, { mode: 'column', column: 'name' }), ['Router', 'Switch']);
assert.strictEqual(test.selectDatabaseOutput(databaseRows, { mode: 'cell', rowIndex: 0, column: 'name' }), 'Router');
assert.strictEqual(test.renderTemplate('https://example.test/{siteId}/{request.deviceId}', { request: { siteId: 'site-1', deviceId: 'device-1' }, system: {}, api: {} }, {}), 'https://example.test/site-1/device-1');
const dependencyOrder = test.dataSourceExecutionOrder([{ key: 'statistics', name: 'Statistics', urlTemplate: 'https://example.test/{api.site_lookup.site_id}', requestVariables: [{ key: 'deviceId', valueTemplate: '{api.device_lookup.device_id}' }] }, { key: 'device_lookup', name: 'Device lookup', urlTemplate: 'https://example.test/devices/{api.site_lookup.site_id}' }, { key: 'site_lookup', name: 'Site lookup', urlTemplate: 'https://example.test/sites' }]);
assert.deepStrictEqual(dependencyOrder.map(function (source) { return source.key; }), ['site_lookup', 'device_lookup', 'statistics']);
assert.deepStrictEqual(test.dataSourceDependencies(dependencyOrder[2]).sort(), ['device_lookup', 'site_lookup']);
assert.throws(function () { test.dataSourceExecutionOrder([{ key: 'one', name: 'One', urlTemplate: 'https://example.test/{api.two.value}' }, { key: 'two', name: 'Two', urlTemplate: 'https://example.test/{api.one.value}' }]); }, /circular reference/);
assert.throws(function () { test.dataSourceExecutionOrder([{ key: 'one', name: 'One', urlTemplate: 'https://example.test/{api.missing.value}' }]); }, /unavailable data source/);
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ name: 'Bad request variables', method: 'GET', urlTemplate: 'https://example.test/{device}', requestVariables: [{ key: 'device', valueTemplate: 'x' }] }] }, 'example.test', 'user/example.test/tester'); }, /reserved name/);
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ name: 'Missing stored key', method: 'GET', urlTemplate: 'https://example.test', auth: { type: 'headerStored', headerName: 'X-API-Key' } }] }, 'example.test', 'user/example.test/tester'); }, /requires a token or key/);
const automaticSourceKeyConfig = test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'automatic-source', name: 'Asset Inventory', method: 'GET', urlTemplate: 'https://example.test/assets' }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(automaticSourceKeyConfig.dataSources[0].key, 'asset_inventory');
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ id: 'one', key: 'one', name: 'Same Name', method: 'GET', urlTemplate: 'https://example.test/one' }, { id: 'two', key: 'two', name: 'same name', method: 'GET', urlTemplate: 'https://example.test/two' }] }, 'example.test', 'user/example.test/tester'); }, /names must be unique/);
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ key: 'bad', name: 'Bad', method: 'GET', urlTemplate: 'https://example.test', auth: { type: 'bearerEnv', tokenEnv: 'lowercase' } }] }, 'example.test', 'user/example.test/tester'); }, /Environment-variable/);
const secretConfig = test.sanitizeConfig({ properties: [], links: [], authenticationSecrets: [{ id: 'secret-unifi', name: 'UniFi API', description: 'Controller API key', type: 'headerStored', headerName: 'X-API-Key', token: 'EXAMPLE_ONLY_NOT_A_SECRET' }], dataSources: [{ id: 'source-secret', name: 'UniFi Devices', method: 'GET', urlTemplate: 'https://example.test/devices', authSecretId: 'secret-unifi', enabled: true }] }, 'example.test', 'user/example.test/tester');
assert.strictEqual(secretConfig.authenticationSecrets[0].name, 'UniFi API');
assert.strictEqual(secretConfig.dataSources[0].authSecretId, 'secret-unifi');
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], authenticationSecrets: [{ name: 'Same Secret', type: 'bearerStored', token: 'one' }, { name: 'same secret', type: 'bearerStored', token: 'two' }] }, 'example.test', 'user/example.test/tester'); }, /Authentication Secret names must be unique/);
assert.throws(function () { test.sanitizeConfig({ properties: [], links: [], dataSources: [{ name: 'Missing Secret', method: 'GET', urlTemplate: 'https://example.test', authSecretId: 'missing' }] }, 'example.test', 'user/example.test/tester'); }, /Authentication Secret is unavailable/);
const referencedSource = { id: 'sites-source', key: 'unifi_sites', name: 'UniFi Sites', outputs: [{ key: 'site_id', name: 'Site ID' }, { key: 'site_name', name: 'Site Name' }] };
const deletionUsages = test.dataSourceReferenceUsage({
  dataSources: [referencedSource, { id: 'devices-source', key: 'unifi_devices', name: 'UniFi Devices', requestVariables: [{ key: 'site_id', valueTemplate: '{api.unifi_sites.site_id}' }], urlTemplate: 'https://example.test/sites/{site_id}/devices' }],
  properties: [{ label: 'Site', defaultTemplate: '{api.unifi_sites.site_name}' }, { label: 'Site Options', optionSource: { sourceKey: 'unifi_sites' } }],
  items: [{ displayNameTemplate: 'Open site', link: { urlTemplate: 'https://example.test/{api.unifi_sites.site_id}' } }],
  displayGroups: []
}, referencedSource);
assert.ok(deletionUsages.some(function (usage) { return usage.outputName === 'Site ID' && /Request Variable "site_id"/.test(usage.location); }));
assert.ok(deletionUsages.some(function (usage) { return usage.outputName === 'Site Name' && /Property "Site" Default Value/.test(usage.location); }));
assert.ok(deletionUsages.some(function (usage) { return usage.outputName === 'Data Source result' && /selectable-list options/.test(usage.location); }));
assert.match(test.dataSourceDeletionError(referencedSource, deletionUsages), /cannot be deleted because its outputs are still in use/);
assert.match(test.dataSourceDeletionError(referencedSource, deletionUsages), /Site ID.*UniFi Devices/s);
const tlsFailure = new TypeError('fetch failed'); tlsFailure.cause = Object.assign(new Error('unable to verify the first certificate'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' });
assert.match(test.fetchFailureMessage({ name: 'UniFi' }, new URL('https://192.0.2.10/private?token=EXAMPLE_ONLY_NOT_A_SECRET'), tlsFailure), /TLS certificate verification failed/);
assert.doesNotMatch(test.fetchFailureMessage({ name: 'UniFi' }, new URL('https://192.0.2.10/private?token=EXAMPLE_ONLY_NOT_A_SECRET'), tlsFailure), /token=EXAMPLE_ONLY_NOT_A_SECRET/);
const refusedFailure = new TypeError('fetch failed'); refusedFailure.cause = Object.assign(new Error('connect ECONNREFUSED 192.0.2.30:443'), { code: 'ECONNREFUSED', address: '192.0.2.30', port: 443, syscall: 'connect' });
assert.match(test.fetchFailureMessage({ name: 'NAS' }, new URL('https://192.0.2.30/'), refusedFailure), /destination rejected the connection/i);
const closure = test.dataSourceDependencyClosure([{ key: 'site', name: 'Site', urlTemplate: 'https://example.test/site' }, { key: 'device', name: 'Device', urlTemplate: 'https://example.test/{api.site.id}' }, { key: 'unrelated', name: 'Unrelated', urlTemplate: 'https://example.test/other' }], 'device');
assert.deepStrictEqual(closure.map(function (source) { return source.key; }), ['site', 'device']);

const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin.handlebars'), 'utf8');
const adminJs = fs.readFileSync(path.join(__dirname, '..', 'includes', 'admin.js'), 'utf8');
const semanticCss = fs.readFileSync(path.join(__dirname, '..', 'includes', 'semantic.min.css'), 'utf8');
const adminCss = fs.readFileSync(path.join(__dirname, '..', 'includes', 'admin.css'), 'utf8');
const adminExtraCss = fs.readFileSync(path.join(__dirname, '..', 'includes', 'admin-extra.css'), 'utf8');
const htmlIds = Array.from(adminHtml.matchAll(/\bid="([^"]+)"/g)).map(function (match) { return match[1]; });
assert.deepStrictEqual(htmlIds.filter(function (id, index) { return htmlIds.indexOf(id) !== index; }), [], 'admin HTML ids must be unique');
assert.match(adminHtml, /id="formulaDialog"/);
assert.match(adminHtml, /id="dataSourceDialog"/);
assert.match(adminHtml, /id="authenticationSecretsPanel"/);
assert.match(adminHtml, /id="authenticationSecretDialog"/);
assert.match(adminHtml, /id="dataSourceAuthSecret"/);
assert.match(adminHtml, /id="createAuthenticationSecretFromDataSourceButton"/);
assert.doesNotMatch(adminHtml, /Existing inline credential \(legacy\)/);
assert.match(adminHtml, /Static List/);
assert.match(adminHtml, /Database Query/);
assert.match(adminHtml, /API Query/);
assert.match(adminHtml, /id="databaseConnectionStatus"/);
assert.match(adminHtml, /id="previewDatabaseQueryButton"/);
assert.match(adminHtml, /id="refreshDataSourcePreviewButton"/);
assert.match(adminHtml, /id="apiDataSourceDevice"><option value="">None<\/option>/);
assert.match(adminHtml, /class="wizard-step active" id="dataSourceIdentityStep"/);
assert.match(adminHtml, /id="dataSourceNameStatus"/);
assert.match(adminHtml, /id="staticEntryMode"/);
assert.match(adminHtml, /id="addDataSourceHeaderButton"/);
assert.match(adminHtml, /id="staticOutputStep" hidden><h3>5\. Variable<\/h3>/);
assert.doesNotMatch(adminHtml, /id="dataSourceVisibilityHeading"|id="dataSourceRules"|id="dataSourcePreview"/);
assert.match(adminHtml, /id="dataSourceTlsVerify"/);
assert.match(adminHtml, /id="viewTlsCertificateButton"/);
assert.match(adminHtml, />View Certificate<\/button>/);
assert.match(adminHtml, /placeholder="https:\/\/\.\.\."/);
assert.match(adminHtml, /placeholder="Enter Header Name\.\.\."/);
assert.match(adminHtml, /placeholder="Enter Header Value\.\.\."/);
assert.match(adminHtml, />Save Data Source<\/button>/);
assert.match(adminHtml, />Save Property<\/button>/);
assert.match(adminHtml, />Save Link<\/button>/);
assert.match(adminHtml, /id="tlsCertificateDialog"/);
assert.match(adminHtml, /path=vendor-browser\.js/);
assert.match(adminHtml, /Stored Bearer Token/);
assert.match(adminHtml, /Stored API Key \/ Header Value/);
assert.match(adminHtml, /Stored Username &amp; Password/);
assert.doesNotMatch(adminHtml, /from environment|Environment Variable/);
assert.match(adminHtml, /<h3>10\. Filters<\/h3>/);
assert.match(adminHtml, /<h3>11\. Output Variables<\/h3>/);
assert.match(adminHtml, /id="dataSourceOutputFilter"/);
assert.match(adminHtml, /id="dataSourceOutputFilterDropdown" class="ui fluid search selection dropdown"/);
assert.match(adminHtml, /path=semantic\.min\.css/, 'the Semantic UI stylesheet must load on the administration page');
assert.match(adminHtml, /path=semantic\.min\.js/, 'the Semantic UI behaviour library must load on the administration page');
assert.match(adminHtml, /path=admin-extra\.css&amp;v=\{\{pluginVersion\}\}/, 'admin assets must use the plugin version as a cache key');
assert.match(semanticCss, /\/plugin-assets\/devicepropertieslinks\/themes\/default\/assets\/fonts\/icons\.woff2/, 'Semantic UI fonts must resolve through the plugin public asset path');
assert.doesNotMatch(adminHtml, /dataSourceOutputFilterSuggestionButton/);
assert.match(adminHtml, /AND \(<code>&amp;&amp;<\/code>\), OR \(<code>\|\|<\/code>\)/);
assert.doesNotMatch(adminHtml, /id="dataSourcePreviewDetails" class="collapsible-preview" open/);
assert.doesNotMatch(adminHtml, /Allowed Hosts/);
assert.doesNotMatch(adminJs, /dataSourceHosts|allowedHosts/);
assert.match(adminJs, /function scheduleDataSourceValidation/);
assert.match(adminJs, /previewDataSource/);
assert.match(adminJs, /inspectDataSourceCertificate/);
assert.match(adminJs, /function availableJmesPaths/);
assert.match(adminJs, /function jmesPathLiteral/);
assert.match(adminJs, /function availableFilterSuggestions/);
assert.match(adminJs, /function evaluateFilterPredicate/);
assert.match(adminJs, /function availableInputSuggestions/);
assert.match(adminJs, /dataSourceSuggestionRevision/);
assert.match(adminJs, /function createSemanticCombo/);
assert.match(adminJs, /function configureSemanticSearch/);
assert.match(adminJs, /function semanticizeAdminControls/);
assert.match(adminJs, /function initializeSemanticSelect/, 'all administration selects must be initialised as Semantic UI dropdowns');
assert.doesNotMatch(adminJs, /select\.classList\.add\([^\n]*"search"/, 'fixed-choice selects must not create Safari-autofillable search inputs');
assert.match(adminJs, /select\.classList\.add\("ui", "fluid", "selection", "dropdown"/, 'fixed-choice selects must remain Semantic UI selection dropdowns');
assert.match(adminJs, /function semanticDropdownIsEditing/, 'Semantic dropdown synchronisation must detect active editing');
assert.match(adminJs, /if \(semanticDropdownIsEditing\(currentWrapper\)\) return;/, 'active Semantic dropdown searches must not be overwritten');
assert.match(adminJs, /function enableSelectedValueEditing/, 'selected searchable values must remain directly editable');
assert.match(adminJs, /select\.dataset\.semanticDropdown && wrapper/, 'an initialised select must refresh through its generated Semantic wrapper');
assert.doesNotMatch(adminJs, /enableSelectedValueEditing\(wrapper, function \(\) \{\s*var selected = select\.options/, 'ordinary selection dropdowns must not inject their selected label into the search input');
assert.doesNotMatch(adminHtml, /<body class="ui form">/, 'Semantic UI must not replace the established page-level layout');
assert.doesNotMatch(adminHtml, /<main class="ui container">/, 'Semantic UI must not override the established administration width');
assert.match(adminExtraCss, /Semantic UI compatibility layer/, 'Semantic components must include a scoped legacy-style compatibility layer');
assert.match(adminExtraCss, /\.ui\.fluid\.card\.definition-card\s*\{[^}]*display:\s*grid/s, 'Semantic cards must retain the established definition grid');
assert.match(adminExtraCss, /\.ui\.button\s*\{[^}]*linear-gradient/s, 'Semantic buttons must retain the The Tech Wizard button appearance');
assert.match(adminExtraCss, /\.ui\.fluid\.selection\.dropdown\.dpl-semantic-control/, 'fixed-choice Semantic dropdowns must retain the shared The Tech Wizard control styling');
assert.match(adminCss, /--heading-screen-size:\s*22px/, 'screen and dialog headings must use the shared typography scale');
assert.match(adminCss, /--heading-section-size:\s*18px/, 'panel headings must use the shared typography scale');
assert.match(adminExtraCss, /border-top:\s*8px solid var\(--blue\)/, 'Semantic dropdowns must use the enlarged shared arrow');
assert.match(adminExtraCss, /\.ui\.search\.selection\.dropdown:focus-within\s*>\s*\.text[^{]*\{[^}]*visibility:\s*hidden/s, 'focused searchable dropdowns must hide the selected label beneath the editable search value');
assert.match(adminExtraCss, /\.ui\.search\.selection\.dropdown:not\(:focus-within\):not\(\.active\)\s*>\s*input\.search[^{]*\{[^}]*color:\s*transparent/s, 'inactive searchable dropdowns must not display a retained search layer over the selected label');
assert.match(adminJs, /search\.addEventListener\("blur"[\s\S]*?search\.value\s*=\s*""/, 'editable Semantic dropdowns must clear their temporary search text on blur');
assert.match(adminJs, /dataSourceOutputInputDropdown/);
assert.match(adminJs, /dataSourceOutputValueDropdown/);
assert.match(adminJs, /function availableOutputSuggestions/);
assert.match(adminJs, /function composeOutputExpression/);
assert.match(adminJs, /function openAuthenticationSecret/);
assert.match(adminJs, /function deleteAuthenticationSecret/);
assert.match(adminJs, /function dataSourceReferenceUsage/);
assert.match(adminJs, /cannot be deleted because its outputs are still in use/);
assert.match(adminJs, /Output Variable Value Preview/);
assert.match(adminJs, /return "Dataset"/);
assert.match(adminJs, /return "Object"/);
assert.match(adminJs, /return "Single Value"/);
assert.match(adminJs, /stat \? "6" : "8"/);
assert.match(adminJs, /\(api \? "12" : stat \? "6" : "8"\) \+ "\. Availability"/);
assert.match(adminJs, /9\. Live Preview & Validation/);
assert.match(adminJs, /dataSourcePreviewDetails"\)\.open = false/);
assert.match(adminJs, /function apiUrlValid\(\)/);
assert.match(adminJs, /function apiConfigurationReady\(\)/);
assert.match(adminJs, /api && apiConfigurationReady\(\)/);
assert.doesNotMatch(adminJs, /Select a Device to run validation\./);
assert.match(adminJs, /function apiPreviewReady\(\) \{\s*return apiConfigurationReady\(\);/);
assert.match(adminJs, /!nodeId && source\.sourceType !== "apiQuery"/);
assert.match(adminJs, /refreshDataSourcePreviewButton"\)\.disabled = false/);
assert.match(adminJs, /delete snapshot\.outputs/);
assert.match(adminJs, /inputLabel\.textContent = "Input"/);
assert.doesNotMatch(adminJs, /filterLabel\.textContent = "Filter"/);
assert.match(adminJs, /output\.filterExpression = dataSourceOutputFilterExpression/);
assert.match(adminJs, /outputLabel\.textContent = "Output"/);
assert.match(adminJs, /Enter Placeholder\.\.\./);
assert.match(adminJs, /Enter Variable Name\.\.\./);
assert.match(adminJs, /Select or enter an Input\.\.\./);
assert.match(adminJs, /Entire matching object/);
assert.match(adminJs, /value\.every\(function \(item\)/);
assert.match(adminJs, /value\.length > 1/);
assert.match(adminJs, /value\.length === 1/);
assert.match(adminJs, /return "Dataset"/);
assert.match(adminJs, /return "Object"/);
assert.match(adminJs, /return "Single Value"/);
assert.match(adminJs, /typeLabel\.className = "api-output-type"/);
assert.match(adminJs, /apiSourceSteps"\)\.insertBefore\(testStep, byId\("apiFiltersStep"\)\)/);
assert.match(adminJs, /insertBefore\(testStep, byId\("staticOutputStep"\)\)/);
assert.match(adminJs, /type === "postgresql" \? "5432" : "3306"/);
assert.match(adminJs, /updateDatabaseConnectionFields\(true\)/);
assert.match(adminCss, /\.api-output-type-value/);
assert.match(adminCss, /\.collapsible-preview/);
assert.match(adminCss, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/, 'database-specific hidden fields must not be overridden by grid CSS');
assert.match(adminHtml, /id="schemeOperatingSystem"/);
assert.match(adminHtml, /data-formula-target="linkUrl"/);
assert.match(adminHtml, /id="formulaDialogTitle">Formula Compose<\/h2>/);
assert.match(adminHtml, />Insert Variable<\/button>/);
assert.match(adminHtml, />Insert Function<\/button>/);
assert.match(adminHtml, /Formula \/ Template/);
assert.match(adminHtml, /Preview Using Device\.\.\./);
assert.match(adminHtml, />Insert Into Field<\/button>/);
assert.match(adminJs, /appendFormulaVariableGroup\(variable, "User"/);
assert.match(adminJs, /appendFormulaVariableGroup\(variable, "System"/);
assert.match(adminJs, /appendFormulaVariableGroup\(variable, "Global"/);
assert.match(adminJs, /appendFormulaVariableGroup\(variable, "Data Source"/);
assert.match(adminJs, /"Data Source: " \+ source\.name \+ ": " \+ output\.name/);
assert.doesNotMatch(adminJs, /dataSourceVariablesForFormula\.push\(\[\s*"api\." \+ source\.key,\s*source\.name/);
assert.match(adminJs, /function setFormulaActionsEnabled\(enabled\)/);
assert.match(adminJs, /usable = message\.success === true && output\.trim\(\)\.length > 0/);
assert.match(adminJs, /if \(!formulaPreviewValid\) return/);
assert.match(adminHtml, /id="copyFormulaButton"[^>]*disabled/);
assert.match(adminHtml, /id="applyFormulaButton"[^>]*disabled/);
assert.match(adminJs, /"Formula Compose \(" \+ formulaContextForTarget/);
assert.match(adminHtml, /id="schemeRegistrationDialog"/);
assert.match(adminHtml, /id="cancelPropertyButton" type="button"/);
assert.match(adminHtml, /id="commandText"/);
assert.match(adminHtml, /id="linkRow"/);
assert.match(adminHtml, /id="linkTypeStep"/);
assert.match(adminHtml, /id="linkIdentityStep" hidden/);
assert.match(adminHtml, /id="linkDetailsSteps" hidden/);
assert.match(adminJs, /4\. URL Configuration/);
assert.match(adminHtml, /id="linkVisibilityStep"/);
assert.doesNotMatch(adminHtml, /data-formula-target="linkName"/);
assert.doesNotMatch(adminHtml, /id="linkEnabled" type="checkbox" checked/);
assert.match(adminHtml, /id="displayGroupDialog"/);
assert.match(adminHtml, /id="displayGroupColor"[^>]+type="color"/);
assert.match(adminHtml, /id="displayGroupRules"/);
assert.match(adminHtml, /id="itemRuleMode"/);
assert.match(adminHtml, /Inherit Link Group rule/);
assert.match(adminHtml, /id="linkColor"[^>]+type="color"/);
assert.match(adminHtml, /id="linkColorField" hidden>Colour/);
assert.match(adminJs, /function updateLinkColourVisibility/);
assert.match(adminJs, /linkVisibilityStep["']\)\.hidden/);
assert.match(adminHtml, /id="linkHint"/);
assert.match(adminHtml, /URI Scheme/);
assert.match(adminHtml, /id="linkProtocolDropdown" class="ui fluid search selection dropdown"/);
assert.match(adminHtml, /id="linkProtocol" type="hidden"/);
assert.match(adminHtml, /id="linkProtocolMenu" class="menu"/);
assert.match(adminHtml, /Search or select a URI scheme/);
assert.match(adminHtml, /semantic\.min\.js/);
assert.match(adminJs, /allowAdditions: true/);
assert.match(adminJs, /Official IANA-registered URI scheme/);
assert.match(adminJs, /function optionalPropertySectionsChanged/);
assert.match(adminJs, /function updatePropertyWizard/);
assert.match(adminHtml, /id="validationEnabled" type="checkbox"/);
assert.match(adminHtml, /id="inputMaskEnabled" type="checkbox"/);
assert.match(adminHtml, /id="inputMaskPreset"/);
assert.doesNotMatch(adminHtml, /id="propertyRequired"|> Required<\/label>/);
assert.doesNotMatch(adminHtml, />Applicability</);
assert.match(adminHtml, /autocapitalize="none"/);
assert.match(adminJs, /DevicePropertiesLinksIanaUriSchemes/);
assert.match(adminHtml, /Links &amp; Properties/);
assert.match(adminHtml, /id="propertyMode"/);
assert.match(adminHtml, /property-input-grid/);
assert.doesNotMatch(adminHtml, /id="propertyKey"/);
assert.doesNotMatch(adminHtml, /id="dataSourceKey"/);
assert.match(adminHtml, /id="propertyValueColor"/);
assert.match(adminHtml, /id="propertyValueBackground"/);
assert.doesNotMatch(adminHtml, /id="propertyLabelBold" type="checkbox" checked/);
assert.doesNotMatch(adminHtml, /id="propertyEnabled" type="checkbox" checked/);
assert.match(adminJs, /function dataSourceKeyFromName/);
assert.match(adminJs, /function dataSourceNameAvailable/);
assert.match(adminJs, /function requestPlaceholderFromName/);
assert.match(adminJs, /function requestVariablesValid/);
assert.match(adminJs, /"Request Variables"/);
assert.match(adminJs, /Unavailable Data Source — enable it first/);
assert.match(adminJs, /if \(!dataSourceFormulaContext\)/);
assert.match(adminJs, /source\.enabled !== false/);
assert.match(adminJs, /current\.length === 1[\s\S]*path \+ "\[0\]"[\s\S]*path \+ "\[\]"/);
assert.match(adminJs, /requestVariables:\s*byId\("dataSourceDialog"\)\.open/);
assert.match(adminJs, /function updateLinkWizard/);
assert.doesNotMatch(adminHtml, /id="dataSourceVisibilityStep"/);
assert.doesNotMatch(adminHtml, /id="dataSourceEnabled" type="checkbox" checked/);
assert.doesNotMatch(adminJs, /dataSourceVisibility|dataSourceRule/);
assert.match(adminJs, /dataSourcesPanel"\)\.hidden = !permissions\.manageDataSources/);
assert.match(adminJs, /search\.type\s*=\s*["']search["']/);
assert.doesNotMatch(adminJs, /autocomplete\s*=\s*["']new-password["']/);
assert.match(adminJs, /function suppressPasswordManager\(search, identity\)/);
assert.match(adminJs, /function installSemanticSelectChangeSync/, 'all Semantic selects must restore their selected label after a native change');
assert.match(adminJs, /dropdown\("refresh"\)\.dropdown\("set selected", current\.value\)/, 'Semantic selected labels must be resynchronised from the native select value');
assert.match(adminJs, /search\.autocomplete = "off"/);
assert.match(adminJs, /data-1p-ignore/);
assert.match(adminJs, /data-lpignore/);
assert.match(adminJs, /data-bwignore/);
assert.doesNotMatch(adminHtml, /Advanced JSON Schema/);
assert.match(adminJs, /action:\s*["']runcommands["']/);
assert.match(adminJs, /runAsUser:\s*2/);
const pluginJs = fs.readFileSync(path.join(__dirname, '..', 'devicepropertieslinks.js'), 'utf8');
const presetDefaults = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'defaults', 'property-presets.json'), 'utf8'));
assert.deepStrictEqual(Object.keys(presetDefaults.inputMaskPresets), Object.keys(presetDefaults.validationPresets), 'input-mask presets must match the validation preset catalogue');
assert.ok(presetDefaults.inputMaskPresets.mac.pattern, 'the MAC input-mask preset must define a mask');
assert.match(pluginJs, /data.*property-presets\.json/, 'the editable preset catalogue must be stored in persistent plugin data');
assert.match(pluginJs, /ensurePresetCatalogFile\(\)/, 'the persistent preset catalogue must be created automatically');
assert.match(pluginJs, /const extractionSignature = JSON\.stringify\(\{ outputs: source\.outputs \|\| \[\], responseExpression: source\.responseExpression \|\| '' \}\)/);
assert.match(pluginJs, /cacheKey = source\.id \+ '\|' \+ context\.nodeId .* extractionSignature/);
assert.match(pluginJs, /candidate\.dataSources = dataSourceDependencyClosure\(candidate\.dataSources, source\.key\)/);
assert.doesNotMatch(pluginJs, /previewDependency\.enabled = true/);
assert.match(pluginJs, /\['Information','Properties'\]/, 'Information and Properties must use dedicated device navigation tabs');
assert.match(pluginJs, /MainDevInformation/, 'Information must be installed before Properties');
assert.match(pluginJs, /propertiesTab\.style\.display=inputDefinitions\.length\?'':'none'/, 'Properties must only be visible when an input property matches');
assert.match(pluginJs, /informationTab\.style\.display=informationDefinitions\.length\?'':'none'/, 'Information must only be visible when a read-only property matches');
assert.match(pluginJs, /control=document\.createElement\('div'\);control\.className='dpl-readonly-value'/, 'read-only Information values must render as plain text rather than input controls');
assert.doesNotMatch(pluginJs, /Calculated value/, 'read-only Information must not show a redundant calculated-value helper');
assert.match(pluginJs, /ui\.form\.segment\.dpl-information\{[^}]*width:min\(720px,100%\)/, 'read-only Information must use a compact layout');
assert.match(pluginJs, /control\.style\.color=definition\.valueColor/, 'read-only Information must apply the configured value style');
assert.match(pluginJs, /dpl-local-group/, 'local groups must have a bordered presentation container');
assert.match(pluginJs, /devicePropertiesLinksSemanticStyles/, 'device panes must load the Semantic UI stylesheet');
assert.match(pluginJs, /className = 'ui form segment dpl-properties'/, 'device Properties must use a Semantic UI form and segment');
assert.match(pluginJs, /section\.className = 'ui segments'/, 'device Links panel must use Semantic UI segments');
assert.match(pluginJs, /ui top attached header dpl-section-title/, 'device Links heading must use a Semantic UI header');
assert.match(pluginJs, /ui mini label dpl-kind/, 'device link badges must use Semantic UI labels');
assert.match(pluginJs, /ui message dpl-status/, 'device status must use a Semantic UI message');
assert.match(pluginJs, /className='ui fluid dropdown'/, 'device select controls must use Semantic UI dropdown styling');
assert.match(pluginJs, /className='ui primary button'/, 'device save controls must use Semantic UI buttons');
assert.match(pluginJs, /className='ui button dpl-key'/, 'device link and command controls must use Semantic UI buttons');
assert.doesNotMatch(pluginJs, /registerPluginTab/, 'Properties must not be mounted inside the shared Plugins page');
assert.doesNotMatch(pluginJs, /st\.originalGo\(19,event\)/, 'Properties must not claim MeshCentral\'s Plugins page state');
assert.match(pluginJs, /st\.originalGo\(10,event\)/, 'Properties must use General as its underlying device page');
assert.match(pluginJs, /message\.event\.action==='nodemeshchange'/, 'device-group changes must explicitly refresh plugin device data');
assert.match(pluginJs, /otherPanel\.style\.display=other===name\?'block':'none'/, 'custom panels must override their hidden stylesheet default');
assert.match(pluginJs, /customPage:null/, 'custom page visibility must use explicit state');
assert.match(pluginJs, /target===10.*devicePropertiesLinksDeviceData/, 'General navigation must restore cached quick links after MeshCentral redraws the page');
assert.match(pluginJs, /document\.getElementById\('p10html2'\)/, 'Quick Command and Links must use the primary General-page insertion point');
assert.match(pluginJs, /insertBefore\(section, quickCommandsPanel\)/, 'Quick Command and Links must be prioritised ahead of the separate Quick Commands panel');
assert.match(pluginJs, /dplRestoreQuickCommands/, 'device refreshes must preserve the separate Quick Commands plugin panel');
assert.match(pluginJs, /Q\.qcRequestConfig\(\)/, 'Quick Commands configuration must be requested when its client state is empty');
assert.match(pluginJs, /Q\.qcRenderGeneral\(\)/, 'Quick Commands General panel must be re-rendered after Links are inserted');
assert.match(pluginJs, /message\.type==='console'/, 'Agent-console output must be collected from MeshCentral console messages');
assert.match(pluginJs, /item\.shell==='agent'.*4000/, 'Agent-console runs must complete after a bounded collection window');
assert.match(pluginJs, /manage_data_sources/, 'server must register and enforce Data Source management permission');
assert.match(pluginJs, /context\.request\[key\] = requestValue/, 'formula previews must resolve Request Variable placeholders');
assert.match(pluginJs, /if \(!permissions\.manageDataSources\) \{ next\.dataSources = clone\(current\.dataSources/, 'server must preserve Data Sources when permission is absent');
assert.match(pluginJs, /next\.authenticationSecrets = clone\(current\.authenticationSecrets/, 'server must preserve Authentication Secrets when permission is absent');
assert.match(pluginJs, /dataSourceDeletionError\(source, dataSourceReferenceUsage\(next, source\)\)/, 'server must reject deletion of a referenced Data Source');
assert.match(pluginJs, /if \(!permissions\.manageDefinitions\)/, 'server must preserve definitions when permission is absent');
assert.match(pluginJs, /if\(e\.timer\)clearTimeout\(e\.timer\)/, 'run timers must be cleared when commands complete');

[
  ['Property', 'addPropertyButton', 'savePropertyButton', 'propertyForm', 'saveProperty'],
  ['Link Group', 'addDisplayGroupButton', 'saveDisplayGroupButton', 'displayGroupForm', 'saveDisplayGroup'],
  ['Link', 'addLinkButton', 'saveLinkButton', 'linkForm', 'saveLink'],
  ['Data Source', 'addDataSourceButton', 'saveDataSourceButton', 'dataSourceForm', 'saveDataSource'],
  ['Authentication Secret', 'addAuthenticationSecretButton', 'saveAuthenticationSecretButton', 'authenticationSecretForm', 'saveAuthenticationSecret'],
].forEach(function (entry) {
  const label = entry[0], createId = entry[1], saveId = entry[2], formId = entry[3], handler = entry[4];
  assert.match(adminHtml, new RegExp('id="' + createId + '"[^>]*type="button"'), label + ' create button must remain an explicit non-submit action');
  assert.match(adminHtml, new RegExp('id="' + saveId + '"[^>]*type="submit"'), label + ' save button must submit its editor');
  assert.match(adminHtml, new RegExp('id="' + formId + '"[^>]*novalidate'), label + ' editor must route validation to its visible inline status');
  assert.match(adminJs, new RegExp('byId\\("' + formId + '"\\)\\.onsubmit = ' + handler), label + ' form must retain its save handler');
});
assert.match(adminJs, /function formulaInsertion\(control, value\)/, 'Formula Compose must choose template or expression insertion based on cursor context');
assert.match(adminJs, /return depth > 0 \? value : "\{" \+ value \+ "\}"/, 'variables inserted inside a formula must not gain nested braces');
assert.match(adminJs, /saveConfiguration\(next, \[\], "propertyDialog"\)/, 'Property editor must close only after a successful server save');
assert.match(adminJs, /showEditorError\(saveDialogId, message\)/, 'server save errors must return to the editor that initiated the save');

assert.strictEqual(test.renderTemplate('{replace("a-b", "-", ":")}', context, {}), 'a:b');
assert.strictEqual(test.renderTemplate('{formatDate("2026-08-28T12:34:56Z", "DD/MM/YYYY")}', context, {}), '28/08/2026');
assert.strictEqual(test.renderTemplate('https://{right(group.name, 2)}.example.test', context, {}), 'https://49.example.test');
assert.strictEqual(test.renderTemplate('https://{right({group.name}, 2)}.example.test', context, {}), null);
console.log('Links & Properties tests passed across property modes, migration, rules, formulas, commands, links, URI protocols, validation, and Static, API, and Database Data Sources.');
