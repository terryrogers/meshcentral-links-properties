(function () {
  "use strict";

  var config = {
    revision: 0,
    properties: [],
    links: [],
    displayGroups: [],
    items: [],
    dataSources: [],
    authenticationSecrets: [],
  };
  var inventory = {
    groups: [],
    nodes: [],
    tags: [],
    users: [],
    userGroups: [],
  };
  var busy = false;
  var propertyRule = emptyRule();
  var linkRule = emptyRule();
  var permissions = { manageDefinitions: false, manageDataSources: false };
  var dataSourceVariables = [];
  var dataSourceOutputs = [];
  var dataSourceOutputFilterExpression = "";
  var dataSourceSuggestionRevision = 0;
  var dataSourceFilterSuggestionsSignature = "";
  var dataSourceHeaders = [];
  var staticEntries = [];
  var dataSourcePreviewRequestId = null;
  var dataSourcePreviewTimer = null;
  var dataSourcePreviewSignature = "";
  var certificatePreviewRequestId = null;
  var apiPreviewAvailable = false;
  var apiPreviewResult = null;
  var databaseConnectionOk = false;
  var databasePreviewRows = [];
  var databaseOutputColumnPending = "";
  var dataSourceLegacyResponseExpression = "";
  var dataSourceHasLegacyAuthentication = false;
  var pendingAuthenticationSecretId = null;
  var displayGroupRule = emptyRule();
  var formulaTargetId = null;
  var formulaPreviewTimer = null;
  var formulaPreviewRequestId = null;
  var formulaPreviewValid = false;
  var saveRequestId = null;
  var validationPresets = { custom: { label: "Custom" } };
  var inputMaskPresets = { custom: { label: "Custom" } };

  function emptyRule() {
    return { kind: "group", op: "and", children: [] };
  }
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }
  function byId(id) {
    return document.getElementById(id);
  }
  function makeId(prefix) {
    return (
      prefix +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 9)
    );
  }
  function text(value) {
    return value == null ? "" : String(value);
  }
  function semanticDropdownIsEditing(control) {
    var wrapper = control && control.classList && control.classList.contains("dropdown")
      ? control
      : control && control.parentElement && control.parentElement.classList.contains("dropdown")
        ? control.parentElement
        : null;
    return !!(wrapper && (
      wrapper.classList.contains("active") ||
      wrapper.classList.contains("visible") ||
      (wrapper.matches && wrapper.matches(":focus-within"))
    ));
  }
  function enableSelectedValueEditing(wrapper, getValue) {
    if (!wrapper || wrapper.dataset.dplEditableSearch === "true") return;
    wrapper.dataset.dplEditableSearch = "true";
    var search = wrapper.querySelector("input.search");
    if (!search) return;
    suppressPasswordManager(search, wrapper.id || "editable-dropdown");
    function exposeValue(selectText) {
      var value = String(getValue() || "");
      if (!value || (search.value && search.value !== value)) return;
      window.setTimeout(function () {
        if (document.activeElement !== search || (search.value && search.value !== value)) return;
        search.value = value;
        if (selectText) search.setSelectionRange(0, value.length);
      }, 0);
    }
    search.addEventListener("focus", function () {
      exposeValue(true);
    });
    search.addEventListener("click", function () {
      if (!search.value) exposeValue(true);
    });
    search.addEventListener("blur", function () {
      window.setTimeout(function () {
        if (document.activeElement !== search) search.value = "";
      }, 0);
    });
  }
  function suppressPasswordManager(search, identity) {
    if (!search) return;
    search.type = "search";
    search.name = "dpl-search-" + String(identity || "dropdown").replace(/[^A-Za-z0-9_-]/g, "-");
    search.autocomplete = "off";
    search.autocapitalize = "none";
    search.spellcheck = false;
    search.inputMode = "search";
    search.setAttribute("data-1p-ignore", "true");
    search.setAttribute("data-lpignore", "true");
    search.setAttribute("data-bwignore", "true");
    search.setAttribute("data-form-type", "other");
    search.setAttribute("data-purpose", "search");
  }
  function installSemanticSelectChangeSync(select) {
    if (!select || select.dataset.dplChangeSync === "true") return;
    select.dataset.dplChangeSync = "true";
    select.addEventListener("change", function () {
      var current = select;
      window.setTimeout(function () {
        var wrapper = current.parentElement && current.parentElement.classList.contains("dropdown") ? current.parentElement : null;
        if (!wrapper || current._dplSemanticChangeSyncing) return;
        current._dplSemanticChangeSyncing = true;
        try { window.jQuery(wrapper).dropdown("refresh").dropdown("set selected", current.value); }
        finally { current._dplSemanticChangeSyncing = false; }
      }, 0);
    });
  }
  function initializeSemanticSelect(select, refresh) {
    if (!select || select.tagName !== "SELECT") return;
    if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.dropdown) return;
    var wrapper = select.parentElement && select.parentElement.classList.contains("dropdown") ? select.parentElement : null,
      dropdown;
    if (select.dataset.semanticDropdown && wrapper) {
      wrapper.classList.remove("search");
      wrapper.classList.add("ui", "fluid", "selection", "dropdown", "dpl-semantic-control");
      dropdown = window.jQuery(wrapper);
      installSemanticSelectChangeSync(select);
      if (refresh && !semanticDropdownIsEditing(wrapper)) dropdown.dropdown("refresh").dropdown("set selected", select.value);
      return;
    }
    select.classList.add("ui", "fluid", "selection", "dropdown", "dpl-semantic-control");
    dropdown = window.jQuery(select);
    if (!select.dataset.semanticDropdown) {
      select.dataset.semanticDropdown = "true";
      var valueDescriptor = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value");
      if (valueDescriptor && valueDescriptor.get && valueDescriptor.set) {
        Object.defineProperty(select, "value", {
          configurable: true,
          get: function () { return valueDescriptor.get.call(this); },
          set: function (value) {
            valueDescriptor.set.call(this, value);
            if (this._dplSemanticSyncing) return;
            var current = this;
            window.setTimeout(function () {
              var currentWrapper = current.parentElement && current.parentElement.classList.contains("dropdown") ? current.parentElement : null;
              if (current.dataset.semanticDropdown && currentWrapper) {
                if (semanticDropdownIsEditing(currentWrapper)) return;
                current._dplSemanticSyncing = true;
                try { window.jQuery(currentWrapper).dropdown("refresh").dropdown("set selected", value); }
                finally { current._dplSemanticSyncing = false; }
              }
            }, 0);
          }
        });
      }
      dropdown.dropdown({ forceSelection: false, clearable: false });
      installSemanticSelectChangeSync(select);
    }
  }
  function semanticizeAdminControls(root) {
    root = root || document;
    function matching(selector) {
      var nodes = [];
      if (root.nodeType === 1 && root.matches && root.matches(selector)) nodes.push(root);
      if (root.querySelectorAll) nodes = nodes.concat(Array.from(root.querySelectorAll(selector)));
      return nodes;
    }
    matching("button:not(.ui)").forEach(function (button) {
      button.classList.add("ui", "button");
      if (button.classList.contains("secondary")) button.classList.add("basic");
      if (button.classList.contains("danger")) button.classList.add("negative");
      if (button.classList.contains("small-button")) button.classList.add("mini");
      if (button.classList.contains("formula-button")) button.classList.add("mini", "circular");
      if (button.classList.contains("icon-close")) button.classList.add("icon", "basic");
    });
    matching("select").forEach(function (select) { initializeSemanticSelect(select, true); });
    matching("input:not([type=hidden]):not(.dpl-semantic-control), textarea:not(.dpl-semantic-control)").forEach(function (control) {
      control.classList.add("dpl-semantic-control");
    });
    matching("label:not(.dpl-semantic-field)").forEach(function (label) {
      var control = label.querySelector("input:not([type=checkbox]):not([type=radio]), select, textarea");
      if (control) label.classList.add("field", "dpl-semantic-field");
    });
    matching('input[type="checkbox"]:not([data-semanticized]), input[type="radio"]:not([data-semanticized])').forEach(function (control) {
      var parentLabel = control.parentElement;
      if (!parentLabel || parentLabel.tagName !== "LABEL" || (parentLabel.parentElement && parentLabel.parentElement.classList.contains("ui") && parentLabel.parentElement.classList.contains("checkbox"))) return;
      var wrapper = document.createElement("div"), label = document.createElement("label"), parent = parentLabel.parentNode;
      wrapper.className = "ui checkbox";
      control.dataset.semanticized = "true";
      Array.from(parentLabel.childNodes).forEach(function (node) { if (node !== control) label.appendChild(node); });
      parent.replaceChild(wrapper, parentLabel);
      wrapper.append(control, label);
      if (window.jQuery && window.jQuery.fn && window.jQuery.fn.checkbox) window.jQuery(wrapper).checkbox();
    });
    matching("h1:not(.ui), h2:not(.ui), h3:not(.ui)").forEach(function (heading) {
      heading.classList.add("ui", "header");
    });
    matching(".panel:not(.ui), .config-section:not(.ui), .wizard-step:not(.ui), .conditional-box:not(.ui), .data-preview:not(.ui), .rule-builder:not(.ui), .formula-reference:not(.ui), .rules-section:not(.ui), .test-strip:not(.ui), .collapsible-preview:not(.ui)").forEach(function (panel) {
      panel.classList.add("ui", "segment");
    });
    matching(".definition-card:not(.ui)").forEach(function (card) {
      card.classList.add("ui", "fluid", "card");
    });
    matching(".version:not(.ui), .tag:not(.ui), .badge:not(.ui)").forEach(function (label) {
      label.classList.add("ui", "label");
    });
    matching(".preview:not(.ui), #status:not(.ui), .validation-status:not(.ui), .empty:not(.ui), .empty-state:not(.ui), .notice:not(.ui), .credential-warning:not(.ui)").forEach(function (message) {
      message.classList.add("ui", "message");
      if (message.classList.contains("credential-warning")) message.classList.add("warning");
    });
    matching("table:not(.ui)").forEach(function (table) {
      table.classList.add("ui", "compact", "celled", "table");
    });
    matching("form.editor:not(.ui)").forEach(function (form) {
      form.classList.add("ui", "form");
    });
  }

  function parentSend(message) {
    if (!window.parent || !window.parent.meshserver) {
      showStatus(
        false,
        "The MeshCentral connection is unavailable. Refresh the page.",
      );
      return false;
    }
    window.parent.meshserver.send(message);
    return true;
  }
  function command(pluginaction, values) {
    return parentSend(
      Object.assign(
        {
          action: "plugin",
          plugin: "devicepropertieslinks",
          pluginaction: pluginaction,
        },
        values || {},
      ),
    );
  }
  function showStatus(success, message) {
    var status = byId("status");
    status.className = success ? "ui positive message success" : "ui negative message error";
    status.textContent = message;
  }
  function clearStatus() {
    var status = byId("status");
    status.className = "ui message";
    status.textContent = "";
  }
  function editorStatus(dialogId) {
    var ids = {
      propertyDialog: "propertySaveStatus",
      displayGroupDialog: "displayGroupSaveStatus",
      linkDialog: "linkSaveStatus",
      dataSourceDialog: "dataSourceSaveStatus",
      authenticationSecretDialog: "authenticationSecretSaveStatus",
    };
    return byId(ids[dialogId]);
  }
  function clearEditorStatus(dialogId) {
    var status = editorStatus(dialogId);
    if (!status) return;
    status.hidden = true;
    status.textContent = "";
    status.className = "preview";
  }
  function showEditorError(dialogId, message, fieldId) {
    var dialog = byId(dialogId), status = editorStatus(dialogId);
    if (dialog && !dialog.open && dialog.showModal) dialog.showModal();
    if (status) {
      status.hidden = false;
      status.textContent = message;
      status.className = "ui negative message preview error";
    }
    var field = fieldId && byId(fieldId);
    if (field) {
      field.setAttribute("aria-invalid", "true");
      field.focus();
    }
    return Boolean(status);
  }
  function validateTemplateBraces(value, fieldName, fieldId) {
    value = String(value || "");
    var depth = 0, nested = false, index;
    for (index = 0; index < value.length; index++) {
      if (value[index] === "{") {
        depth++;
        if (depth > 1) nested = true;
      } else if (value[index] === "}") {
        if (depth === 0) throw { message: fieldName + ": unmatched formula brace.", fieldId: fieldId };
        depth--;
      }
    }
    if (depth !== 0) throw { message: fieldName + ": unmatched formula brace.", fieldId: fieldId };
    if (nested)
      throw {
        message: fieldName + ": do not wrap variables inside a function in braces. For example, use {right(group.name, 2)}, not {right({group.name}, 2)}.",
        fieldId: fieldId,
      };
  }
  function setBusy(value) {
    busy = value;
    [
      "refreshButton",
      "exportButton",
      "importButton",
      "addPropertyButton",
      "addDisplayGroupButton",
      "addLinkButton",
      "addDataSourceButton",
      "addAuthenticationSecretButton",
    ].forEach(function (id) {
      byId(id).disabled = value;
    });
  }
  function requestData() {
    if (busy) return;
    setBusy(true);
    command("getAdminConfig");
  }

  function ruleSummary(rule) {
    if (
      !rule ||
      rule.kind !== "group" ||
      !rule.children ||
      rule.children.length === 0
    )
      return "Global";
    return (
      (rule.op === "and" ? "ALL" : rule.op === "or" ? "ANY" : "NONE") +
      " of " +
      countConditions(rule) +
      " condition" +
      (countConditions(rule) === 1 ? "" : "s")
    );
  }
  function countConditions(rule) {
    if (!rule) return 0;
    if (rule.kind === "condition") return 1;
    return (rule.children || []).reduce(function (sum, child) {
      return sum + countConditions(child);
    }, 0);
  }

  function makeBadge(label, disabled) {
    var badge = document.createElement("span");
    badge.className = "badge" + (disabled ? " disabled" : "");
    badge.textContent = label;
    return badge;
  }

  function renderLists() {
    var propertyList = byId("propertyList");
    propertyList.replaceChildren();
    byId("propertyEmpty").style.display = config.properties.length
      ? "none"
      : "block";
    config.properties
      .slice()
      .sort(function (a, b) {
        return a.order - b.order || a.label.localeCompare(b.label);
      })
      .forEach(function (definition) {
        var card = document.createElement("article");
        card.className = "definition-card";
        var content = document.createElement("div");
        var heading = document.createElement("h3");
        heading.textContent = definition.label;
        content.appendChild(heading);
        content.appendChild(makeBadge(definition.type));
        content.appendChild(makeBadge(definition.key));
        content.appendChild(makeBadge(ruleSummary(definition.rule)));
        if (definition.valueTemplate)
          content.appendChild(makeBadge("Calculated"));
        else if (definition.defaultTemplate)
          content.appendChild(makeBadge("Has default"));
        if (definition.enabled === false)
          content.appendChild(makeBadge("Disabled", true));
        if (definition.description) {
          var description = document.createElement("div");
          description.className = "definition-description";
          description.textContent = definition.description;
          content.appendChild(description);
        }
        var meta = document.createElement("div");
        meta.className = "definition-meta";
        meta.textContent = "Order " + definition.order;
        content.appendChild(meta);
        var actions = document.createElement("div");
        actions.className = "card-actions";
        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary";
        edit.textContent = "Edit";
        edit.onclick = function () {
          openProperty(definition);
        };
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger";
        remove.textContent = "Delete";
        remove.onclick = function () {
          deleteProperty(definition);
        };
        actions.append(edit, remove);
        card.append(content, actions);
        propertyList.appendChild(card);
      });

    config.displayGroups = config.displayGroups || [];
    var displayGroupList = byId("displayGroupList");
    displayGroupList.replaceChildren();
    byId("displayGroupEmpty").style.display = config.displayGroups.length
      ? "none"
      : "block";
    config.displayGroups
      .slice()
      .sort(function (a, b) {
        return a.order - b.order || a.name.localeCompare(b.name);
      })
      .forEach(function (definition) {
        var card = document.createElement("article");
        card.className = "definition-card";
        var content = document.createElement("div");
        var heading = document.createElement("h3");
        var swatch = document.createElement("span");
        swatch.className = "colour-swatch";
        swatch.style.backgroundColor = definition.color || "#2458b8";
        heading.append(swatch, document.createTextNode(definition.name));
        content.appendChild(heading);
        if (definition.description) {
          var groupDescription = document.createElement("div");
          groupDescription.className = "definition-description";
          groupDescription.textContent = definition.description;
          content.appendChild(groupDescription);
        }
        content.appendChild(makeBadge(ruleSummary(definition.rule)));
        var count = (config.items || []).filter(function (item) {
          return item.displayGroupId === definition.id;
        }).length;
        var meta = document.createElement("div");
        meta.className = "definition-meta";
        meta.textContent =
          "Order " +
          definition.order +
          " · " +
          count +
          " item" +
          (count === 1 ? "" : "s") +
          " · " +
          (definition.color || "#2458b8");
        content.appendChild(meta);
        var actions = document.createElement("div");
        actions.className = "card-actions";
        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary";
        edit.textContent = "Edit";
        edit.onclick = function () {
          openDisplayGroup(definition);
        };
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger";
        remove.textContent = "Delete";
        remove.onclick = function () {
          deleteDisplayGroup(definition);
        };
        actions.append(edit, remove);
        card.append(content, actions);
        displayGroupList.appendChild(card);
      });

    config.items = config.items || [];
    var linkList = byId("linkList");
    linkList.replaceChildren();
    byId("linkEmpty").style.display = config.items.length ? "none" : "block";
    config.items
      .slice()
      .sort(function (a, b) {
        return (
          a.row - b.row ||
          a.position - b.position ||
          a.displayNameTemplate.localeCompare(b.displayNameTemplate)
        );
      })
      .forEach(function (definition) {
        var card = document.createElement("article");
        card.className = "definition-card quick-key";
        var inheritedGroup = (config.displayGroups || []).find(
          function (entry) {
            return entry.id === definition.displayGroupId;
          },
        );
        card.style.borderBottomColor =
          definition.color ||
          (inheritedGroup && inheritedGroup.color) ||
          "#2458b8";
        var content = document.createElement("div");
        var heading = document.createElement("h3");
        heading.textContent = definition.displayNameTemplate;
        content.appendChild(heading);
        content.appendChild(
          makeBadge(
            definition.kind === "command"
              ? (
                  (definition.command && definition.command.shell) ||
                  "cmd"
                ).toUpperCase()
              : "LINK",
          ),
        );
        content.appendChild(
          makeBadge(
            definition.displayGroupId && definition.ruleMode === "inherit"
              ? "Inherits group rule"
              : "Item rule: " + ruleSummary(definition.rule),
          ),
        );
        if (definition.enabled === false)
          content.appendChild(makeBadge("Disabled", true));
        var template = document.createElement("div");
        template.className = "definition-description";
        template.textContent =
          definition.displayDescriptionTemplate ||
          (definition.kind === "command"
            ? definition.command.commandTemplate.split(/\r?\n/)[0]
            : definition.link.urlTemplate);
        content.appendChild(template);
        var group = (config.displayGroups || []).find(function (entry) {
          return entry.id === definition.displayGroupId;
        });
        var description = document.createElement("div");
        description.className = "definition-meta";
        description.textContent =
          (group ? group.name + " · " : "") +
          "Row " +
          definition.row +
          " · Position " +
          definition.position +
          (definition.hintTemplate ? " · Has hint" : "");
        content.appendChild(description);
        var actions = document.createElement("div");
        actions.className = "card-actions";
        var edit = document.createElement("button");
        edit.type = "button";
        edit.className = "secondary";
        edit.textContent = "Edit";
        edit.onclick = function () {
          openLink(definition);
        };
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger";
        remove.textContent = "Delete";
        remove.onclick = function () {
          deleteLink(definition);
        };
        actions.append(edit, remove);
        card.append(content, actions);
        linkList.appendChild(card);
      });
    var sourceList = byId("dataSourceList");
    sourceList.replaceChildren();
    config.dataSources = config.dataSources || [];
    byId("dataSourceEmpty").style.display = config.dataSources.length
      ? "none"
      : "block";
    config.dataSources.forEach(function (source) {
      var card = document.createElement("article");
      card.className = "definition-card";
      var content = document.createElement("div");
      var heading = document.createElement("h3");
      heading.textContent = source.name;
      content.appendChild(heading);
      content.appendChild(
        makeBadge(sourceTypeName(source.sourceType || "apiQuery")),
      );
      if (source.method) content.appendChild(makeBadge(source.method));
      content.appendChild(makeBadge("api." + source.key));
      if ((source.outputs || []).length)
        content.appendChild(makeBadge(source.outputs.length + " outputs"));
      if (source.output) content.appendChild(makeBadge("1 output"));
      if ((source.requestVariables || []).length)
        content.appendChild(
          makeBadge(source.requestVariables.length + " request variables"),
        );
      if (source.authSecretId) {
        var selectedAuthenticationSecret = (config.authenticationSecrets || []).find(function (secret) {
          return secret.id === source.authSecretId;
        });
        content.appendChild(makeBadge(
          selectedAuthenticationSecret
            ? "Credential: " + selectedAuthenticationSecret.name
            : "Credential unavailable",
          !selectedAuthenticationSecret,
        ));
      }
      if (source.enabled === false)
        content.appendChild(makeBadge("Disabled", true));
      var detail = document.createElement("div");
      detail.className = "definition-description";
      detail.textContent =
        source.description ||
        source.urlTemplate ||
        source.queryTemplate ||
        (source.entries || []).length + " static entries";
      content.appendChild(detail);
      var actions = document.createElement("div");
      actions.className = "card-actions";
      var edit = document.createElement("button");
      edit.type = "button";
      edit.className = "secondary";
      edit.textContent = "Edit";
      edit.onclick = function () {
        openDataSource(source);
      };
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = "Delete";
      remove.onclick = function () {
        deleteDataSource(source);
      };
      actions.append(edit, remove);
      card.append(content, actions);
      sourceList.appendChild(card);
    });
    config.authenticationSecrets = config.authenticationSecrets || [];
    var secretList = byId("authenticationSecretList");
    secretList.replaceChildren();
    byId("authenticationSecretEmpty").style.display =
      config.authenticationSecrets.length ? "none" : "block";
    config.authenticationSecrets
      .slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name); })
      .forEach(function (secret) {
        var card = document.createElement("article"),
          content = document.createElement("div"),
          heading = document.createElement("h3"),
          actions = document.createElement("div"),
          edit = document.createElement("button"),
          remove = document.createElement("button"),
          usage = (config.dataSources || []).filter(function (source) {
            return source.authSecretId === secret.id;
          }).length;
        card.className = "definition-card";
        heading.textContent = secret.name;
        content.appendChild(heading);
        content.appendChild(makeBadge(authenticationTypeName(secret.type)));
        content.appendChild(makeBadge(usage + " Data Source" + (usage === 1 ? "" : "s")));
        if (secret.description) {
          var description = document.createElement("div");
          description.className = "definition-description";
          description.textContent = secret.description;
          content.appendChild(description);
        }
        actions.className = "card-actions";
        edit.type = remove.type = "button";
        edit.className = "secondary";
        remove.className = "danger";
        edit.textContent = "Edit";
        remove.textContent = "Delete";
        edit.onclick = function () { openAuthenticationSecret(secret, false); };
        remove.onclick = function () { deleteAuthenticationSecret(secret); };
        actions.append(edit, remove);
        card.append(content, actions);
        secretList.appendChild(card);
      });
    byId("revisionText").textContent =
      "Revision " +
      config.revision +
      (config.updated ? " · Updated " + formatUpdatedTime(config.updated) : "");
  }

  function option(select, value, label) {
    var item = document.createElement("option");
    item.value = value;
    item.textContent = label;
    select.appendChild(item);
  }
  function authenticationTypeName(type) {
    if (type === "bearerStored") return "Bearer Token";
    if (type === "headerStored") return "API Key / Header Value";
    if (type === "basicStored") return "Username & Password";
    return "Authentication";
  }
  function formatUpdatedTime(value) {
    var parts = new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(new Date(value));
    var hour = parts.find(function (part) {
        return part.type === "hour";
      }),
      minute = parts.find(function (part) {
        return part.type === "minute";
      }),
      dayPeriod = parts.find(function (part) {
        return part.type === "dayPeriod";
      });
    return (
      (hour ? hour.value : "") +
      ":" +
      (minute ? minute.value : "") +
      (dayPeriod ? dayPeriod.value.toLowerCase() : "")
    );
  }
  var uriSchemeDescriptions = {
    http: "Hypertext Transfer Protocol",
    https: "HTTP over TLS",
    ssh: "Secure Shell",
    sftp: "SSH File Transfer Protocol",
    ftp: "File Transfer Protocol",
    ftps: "FTP over TLS",
    mailto: "Email address",
    tel: "Telephone number",
    sms: "Text message",
    file: "Local or network file",
    ldap: "Lightweight Directory Access Protocol",
    ldaps: "LDAP over TLS",
    rdp: "Remote Desktop Protocol",
    vnc: "Virtual Network Computing",
    ws: "WebSocket",
    wss: "Secure WebSocket",
    git: "Git repository",
    geo: "Geographic location",
  };
  function populateUriSchemes() {
    var menu = byId("linkProtocolMenu");
    menu.replaceChildren();
    (window.DevicePropertiesLinksIanaUriSchemes || ["http", "https"]).forEach(
      function (scheme) {
        scheme = scheme.toLowerCase();
        var item = document.createElement("div");
        item.className = "item";
        item.dataset.value = scheme;
        var description = document.createElement("span");
        description.className = "description";
        description.textContent =
          uriSchemeDescriptions[scheme] ||
          "Official IANA-registered URI scheme";
        var name = document.createElement("span");
        name.className = "text";
        name.textContent = scheme + ":";
        item.append(description, name);
        menu.appendChild(item);
      },
    );
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.dropdown) {
      window.jQuery("#linkProtocolDropdown").dropdown({
        allowAdditions: true,
        hideAdditions: false,
        forceSelection: false,
        fullTextSearch: true,
        clearable: false,
        message: { addResult: "Use custom scheme <b>{term}</b>" },
        onChange: function (value) {
          byId("linkProtocol").value = String(value || "").toLowerCase();
          uriSchemeChanged(true);
        },
      });
      var search = byId("linkProtocolDropdown").querySelector("input.search");
      if (search) {
        suppressPasswordManager(search, "uri-scheme-filter");
        search.setAttribute("aria-label", "Filter URI schemes");
      }
    }
  }
  function literalScheme(value) {
    var match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(String(value || "").trim());
    return match ? match[1].toLowerCase() : "";
  }
  function schemePrefix(scheme) {
    return scheme === "http" || scheme === "https"
      ? scheme + "://"
      : scheme + ":";
  }
  function selectedUriScheme() {
    return byId("linkProtocol").value.trim().toLowerCase().replace(/:$/, "");
  }
  function setUriScheme(value) {
    value = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9+.-]/g, "");
    byId("linkProtocol").value = value;
    if (window.jQuery && window.jQuery.fn && window.jQuery.fn.dropdown)
      window.jQuery("#linkProtocolDropdown").dropdown("set selected", value);
  }
  function applyUriSchemeToField(field, scheme, createWhenEmpty) {
    if (!scheme) return;
    var value = field.value.trim(),
      current = literalScheme(value),
      prefix = schemePrefix(scheme);
    if (!value) {
      if (createWhenEmpty) field.value = prefix;
      return;
    }
    if (current)
      field.value =
        prefix +
        value
          .slice(value.indexOf(":") + 1)
          .replace(
            /^\/\//,
            scheme === "http" || scheme === "https" ? "" : "//",
          );
    else field.value = prefix + value;
  }
  function uriSchemeChanged(updateUrls) {
    if (updateUrls) {
      var scheme = selectedUriScheme();
      applyUriSchemeToField(byId("linkUrl"), scheme, true);
      applyUriSchemeToField(byId("linkDefaultUrl"), scheme, false);
    }
  }
  function valuesForField(field) {
    if (field === "group")
      return inventory.groups.map(function (item) {
        return { value: item.id, label: item.name };
      });
    if (field === "device")
      return inventory.nodes.map(function (item) {
        return { value: item.id, label: item.name };
      });
    if (field === "tag")
      return inventory.tags.map(function (tag) {
        return { value: tag, label: tag };
      });
    if (field === "user")
      return (inventory.users || []).map(function (item) {
        return { value: item.id, label: item.name };
      });
    if (field === "userGroup")
      return (inventory.userGroups || []).map(function (item) {
        return { value: item.id, label: item.name };
      });
    if (field === "os")
      return [
        { value: "windows", label: "Windows" },
        { value: "linux", label: "Linux" },
        { value: "macos", label: "macOS" },
      ];
    if (field === "connected")
      return [
        { value: "true", label: "Connected" },
        { value: "false", label: "Disconnected" },
      ];
    return [];
  }

  function renderRuleEditor(container, root, onChanged) {
    container.replaceChildren();
    function renderNode(node, parent, isRoot) {
      if (node.kind === "condition") {
        var row = document.createElement("div");
        row.className = "rule-condition";
        var field = document.createElement("select");
        field.className = "rule-field";
        [
          ["group", "Device group"],
          ["tag", "Tag"],
          ["device", "Individual device"],
          ["user", "User"],
          ["userGroup", "User group"],
          ["os", "Operating system"],
          ["connected", "Connection state"],
        ].forEach(function (item) {
          option(field, item[0], item[1]);
        });
        field.value = node.field;
        var operator = document.createElement("select");
        operator.className = "rule-operator";
        option(operator, "is", "IS");
        option(operator, "isNot", "IS NOT");
        operator.value = node.op;
        var value = document.createElement("select");
        value.className = "rule-value";
        function fillValues() {
          var selected = node.value;
          value.replaceChildren();
          valuesForField(field.value).forEach(function (item) {
            option(value, item.value, item.label);
          });
          if (
            Array.from(value.options).some(function (item) {
              return item.value === selected;
            })
          )
            value.value = selected;
          else if (value.options.length) {
            value.value = value.options[0].value;
            node.value = value.value;
          }
        }
        fillValues();
        field.onchange = function () {
          node.field = field.value;
          node.value = "";
          fillValues();
          onChanged();
        };
        operator.onchange = function () {
          node.op = operator.value;
          onChanged();
        };
        value.onchange = function () {
          node.value = value.value;
          onChanged();
        };
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger small-button";
        remove.textContent = "Remove";
        remove.onclick = function () {
          parent.children.splice(parent.children.indexOf(node), 1);
          renderRuleEditor(container, root, onChanged);
          onChanged();
        };
        row.append(field, operator, value, remove);
        return row;
      }
      var box = document.createElement("div");
      box.className = "rule-group";
      var head = document.createElement("div");
      head.className = "rule-group-head";
      var mode = document.createElement("select");
      mode.className = "rule-mode";
      option(mode, "and", "Match ALL");
      option(mode, "or", "Match ANY");
      option(mode, "not", "Match NONE");
      mode.value = node.op;
      mode.onchange = function () {
        node.op = mode.value;
        onChanged();
      };
      var addCondition = document.createElement("button");
      addCondition.type = "button";
      addCondition.className = "secondary small-button";
      addCondition.textContent = "Add condition";
      addCondition.onclick = function () {
        var field = inventory.groups.length
          ? "group"
          : inventory.tags.length
            ? "tag"
            : "device";
        var options = valuesForField(field);
        node.children.push({
          kind: "condition",
          field: field,
          op: "is",
          value: options.length ? options[0].value : "",
        });
        renderRuleEditor(container, root, onChanged);
        onChanged();
      };
      var addGroup = document.createElement("button");
      addGroup.type = "button";
      addGroup.className = "secondary small-button";
      addGroup.textContent = "Add group";
      addGroup.onclick = function () {
        node.children.push(emptyRule());
        renderRuleEditor(container, root, onChanged);
        onChanged();
      };
      head.append(mode, addCondition, addGroup);
      if (!isRoot) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger small-button";
        remove.textContent = "Remove group";
        remove.onclick = function () {
          parent.children.splice(parent.children.indexOf(node), 1);
          renderRuleEditor(container, root, onChanged);
          onChanged();
        };
        head.appendChild(remove);
      }
      box.appendChild(head);
      (node.children || []).forEach(function (child) {
        box.appendChild(renderNode(child, node, false));
      });
      return box;
    }
    container.appendChild(renderNode(root, null, true));
  }

  function evaluateRule(rule, node) {
    if (!rule) return true;
    if (rule.kind === "condition") {
      var matched =
        rule.field === "group"
          ? node.meshid === rule.value
          : rule.field === "device"
            ? node.id === rule.value
            : rule.field === "tag"
              ? (node.tags || []).indexOf(rule.value) >= 0
              : true;
      return rule.op === "isNot" ? !matched : matched;
    }
    var children = rule.children || [];
    if (rule.op === "or")
      return (
        children.length > 0 &&
        children.some(function (child) {
          return evaluateRule(child, node);
        })
      );
    if (rule.op === "not")
      return !children.some(function (child) {
        return evaluateRule(child, node);
      });
    return children.every(function (child) {
      return evaluateRule(child, node);
    });
  }

  function updatePreview(rule, targetId) {
    function hasUserRule(entry) {
      return (
        entry &&
        (entry.kind === "condition"
          ? entry.field === "user" || entry.field === "userGroup"
          : (entry.children || []).some(hasUserRule))
      );
    }
    var target = byId(targetId);
    if (hasUserRule(rule)) {
      target.textContent =
        "Visibility depends on the signed-in user or user-group membership. Device conditions are evaluated together with those user conditions on the server.";
      return;
    }
    var matched = inventory.nodes.filter(function (node) {
      return evaluateRule(rule, node);
    });
    var names = matched.slice(0, 8).map(function (node) {
      return node.name;
    });
    target.textContent =
      "Matches " +
      matched.length +
      " device" +
      (matched.length === 1 ? "" : "s") +
      (names.length
        ? ": " + names.join(", ") + (matched.length > names.length ? "…" : "")
        : ".");
  }

  function propertyTypeChanged() {
    var selected = Boolean(byId("propertyType").value);
    byId("numberSettings").style.display =
      selected &&
      ["number", "integer", "range"].indexOf(byId("propertyType").value) >= 0
        ? "block"
        : "none";
    byId("selectSettings").style.display =
      selected &&
      ["select", "multiselect"].indexOf(byId("propertyType").value) >= 0
        ? "block"
        : "none";
    byId("propertyInputOptions").hidden = !selected;
    updatePropertyWizard();
  }
  function optionalPropertySectionsChanged() {
    byId("validationSettings").hidden = !byId("validationEnabled").checked;
    byId("inputMaskSettings").hidden = !byId("inputMaskEnabled").checked;
  }
  function propertyKeyFromLabel(label) {
    var key = String(label || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!/^[a-z]/.test(key)) key = "property_" + key;
    key = key.slice(0, 64);
    var base = key,
      counter = 2,
      currentId = byId("propertyId") && byId("propertyId").value;
    while (
      (config.properties || []).some(function (item) {
        return (
          item.id !== currentId &&
          String(item.key).toLowerCase() === key.toLowerCase()
        );
      })
    ) {
      var suffix = "_" + counter++;
      key = base.slice(0, 64 - suffix.length) + suffix;
    }
    return key;
  }
  function propertyNameAvailable() {
    var label = byId("propertyLabel").value.trim(),
      id = byId("propertyId").value;
    return (
      Boolean(label) &&
      !/[{}]/.test(label) &&
      !(config.properties || []).some(function (item) {
        return (
          item.id !== id &&
          String(item.label).toLowerCase() === label.toLowerCase()
        );
      })
    );
  }
  function updatePropertyWizard() {
    var mode = byId("propertyMode").value,
      hasMode = Boolean(mode),
      hasName = propertyNameAvailable(),
      inputTypeSelected =
        mode === "input" && Boolean(byId("propertyType").value);
    byId("propertyIdentityStep").hidden = !hasMode;
    byId("propertyDetailsSteps").hidden = !(hasMode && hasName);
    byId("propertyReadonlyStep").hidden = mode !== "readonly";
    byId("propertyInputStep").hidden = mode !== "input";
    byId("propertyReadonlyDisplayOptions").hidden = mode !== "readonly";
    byId("propertyReadonlyStateStep").hidden = mode !== "readonly";
    var enabled =
      mode === "readonly"
        ? byId("propertyEnabledReadonly").checked
        : inputTypeSelected && byId("propertyEnabled").checked;
    byId("propertyVisibilityStep").hidden = !(
      hasMode &&
      hasName &&
      enabled &&
      (mode === "readonly" || inputTypeSelected)
    );
    var label = byId("propertyLabel").value.trim(),
      status = byId("propertyNameStatus");
    status.textContent = !label
      ? "Enter a unique Display Name to continue."
      : /[{}]/.test(label)
        ? "Display Name cannot contain a formula."
        : hasName
          ? "Display Name is available."
          : "That Display Name already exists.";
    status.className = "ui tiny basic label hint" + (label && !hasName ? " red error-text" : "");
  }
  function validationPresetChanged(applyValues) {
    var presetName = byId("validationPreset").value || "custom";
    var preset = validationPresets[presetName] || {};
    if (!applyValues || presetName === "custom") return;
    byId("validationPattern").value = preset.pattern || "";
    byId("validationFlags").value = preset.flags || "";
    byId("validationMinimumLength").value =
      preset.minimumLength == null ? "" : preset.minimumLength;
    byId("validationMaximumLength").value =
      preset.maximumLength == null ? "" : preset.maximumLength;
    byId("validationMessage").value = preset.message || "";
  }
  function inputMaskPresetChanged(applyValues) {
    var presetName = byId("inputMaskPreset").value || "custom";
    var preset = inputMaskPresets[presetName] || {};
    if (!applyValues || presetName === "custom") return;
    byId("maskPattern").value = preset.pattern || "";
    byId("maskPlaceholder").value = preset.placeholder || "";
    byId("maskTransform").value = preset.transform || "none";
  }
  function populatePropertyPresets(catalog) {
    catalog = catalog || {};
    validationPresets = catalog.validationPresets || { custom: { label: "Custom" } };
    inputMaskPresets = catalog.inputMaskPresets || { custom: { label: "Custom" } };
    function populate(select, presets) {
      var selected = select.value || "custom";
      select.replaceChildren();
      Object.keys(presets).forEach(function (key) {
        option(select, key, presets[key].label || key);
      });
      select.value = Object.prototype.hasOwnProperty.call(presets, selected) ? selected : "custom";
      initializeSemanticSelect(select, true);
    }
    populate(byId("validationPreset"), validationPresets);
    populate(byId("inputMaskPreset"), inputMaskPresets);
  }
  function optionsToText(options) {
    return (options || [])
      .map(function (item) {
        return item.value + "|" + item.label;
      })
      .join("\n");
  }
  function parseOptions(value) {
    return value
      .split(/\r?\n/)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean)
      .map(function (line) {
        var separator = line.indexOf("|");
        if (separator < 1)
          throw new Error("Each list option must use value|Display label.");
        return {
          value: line.slice(0, separator).trim(),
          label: line.slice(separator + 1).trim(),
        };
      });
  }

  function openProperty(definition) {
    var item = definition
      ? clone(definition)
      : {
          id: makeId("property"),
          key: "",
          label: "",
          propertyMode: "",
          type: "",
          description: "",
          valueTemplate: "",
          defaultTemplate: "",
          enabled: false,
          order: 0,
          labelBold: false,
          valueBold: false,
          rule: emptyRule(),
          options: [],
        };
    var mode =
      item.propertyMode ||
      (item.valueTemplate ? "readonly" : definition ? "input" : "");
    byId("propertyDialogTitle").textContent = definition
      ? "Edit Property"
      : "Create Property";
    byId("propertyId").value = item.id;
    byId("propertyMode").value = mode;
    byId("propertyLabel").value = item.label;
    byId("propertyType").value = item.type;
    byId("propertyDescription").value = item.description || "";
    byId("propertyValueTemplate").value = item.valueTemplate || "";
    byId("propertyDefaultTemplate").value = item.defaultTemplate || "";
    byId("propertyEnabled").checked = definition
      ? item.enabled !== false
      : false;
    byId("propertyEnabledReadonly").checked = definition
      ? item.enabled !== false
      : false;
    byId("propertyOrder").value = Math.max(
      0,
      Math.min(9999, Number(item.order) || 0),
    );
    byId("propertyMinimum").value = item.minimum == null ? "" : item.minimum;
    byId("propertyLabelColor").value = /^#[0-9a-f]{6}$/i.test(
      item.labelColor || "",
    )
      ? item.labelColor
      : "#071a4a";
    byId("propertyLabelBackground").value = /^#[0-9a-f]{6}$/i.test(
      item.labelBackgroundColor || "",
    )
      ? item.labelBackgroundColor
      : "#ffffff";
    byId("propertyLabelBold").checked = item.labelBold === true;
    byId("propertyLabelItalic").checked = item.labelItalic === true;
    byId("propertyLabelUnderline").checked = item.labelUnderline === true;
    byId("propertyValueColor").value = /^#[0-9a-f]{6}$/i.test(
      item.valueColor || "",
    )
      ? item.valueColor
      : "#071a4a";
    byId("propertyValueBackground").value = /^#[0-9a-f]{6}$/i.test(
      item.valueBackgroundColor || "",
    )
      ? item.valueBackgroundColor
      : "#ffffff";
    byId("propertyValueBold").checked = item.valueBold === true;
    byId("propertyValueItalic").checked = item.valueItalic === true;
    byId("propertyValueUnderline").checked = item.valueUnderline === true;
    byId("propertyMaximum").value = item.maximum == null ? "" : item.maximum;
    byId("propertyStep").value = item.step == null ? "" : item.step;
    byId("propertyUnit").value = item.unit || "";
    byId("propertyOptions").value = optionsToText(item.options);
    propertyRule = clone(item.rule || emptyRule());
    var sourceSelect = byId("optionSourceKey");
    sourceSelect.replaceChildren();
    option(sourceSelect, "", "None");
    (config.dataSources || []).forEach(function (source) {
      option(sourceSelect, source.key, source.name);
    });
    byId("optionSourceKey").value =
      (item.optionSource && item.optionSource.sourceKey) || "";
    byId("optionValueExpression").value =
      (item.optionSource && item.optionSource.valueExpression) || "";
    byId("optionLabelExpression").value =
      (item.optionSource && item.optionSource.labelExpression) || "";
    var validation = item.validation || {};
    var mask = item.inputMask || {};
    byId("validationEnabled").checked =
      item.validationEnabled === true ||
      Boolean(
        validation.pattern ||
        validation.message ||
        validation.minimumLength != null ||
        validation.maximumLength != null ||
        (validation.preset && validation.preset !== "custom"),
      );
    byId("inputMaskEnabled").checked =
      item.inputMaskEnabled === true ||
      Boolean(
        mask.pattern ||
        mask.placeholder ||
        (mask.transform && mask.transform !== "none"),
      );
    byId("validationPreset").value = validation.preset || "custom";
    byId("inputMaskPreset").value = mask.preset || "custom";
    byId("validationPattern").value = validation.pattern || "";
    byId("validationFlags").value = validation.flags || "";
    byId("validationMinimumLength").value =
      validation.minimumLength == null ? "" : validation.minimumLength;
    byId("validationMaximumLength").value =
      validation.maximumLength == null ? "" : validation.maximumLength;
    byId("validationMessage").value = validation.message || "";
    byId("maskPattern").value = mask.pattern || "";
    byId("maskPlaceholder").value = mask.placeholder || "";
    byId("maskTransform").value = mask.transform || "none";
    renderRuleEditor(byId("propertyRules"), propertyRule, function () {
      updatePreview(propertyRule, "propertyPreview");
    });
    updatePreview(propertyRule, "propertyPreview");
    propertyTypeChanged();
    optionalPropertySectionsChanged();
    updatePropertyWizard();
    byId("propertySaveStatus").hidden = true;
    byId("propertyDialog").showModal();
  }

  function saveProperty(event) {
    event.preventDefault();
    try {
      var mode = byId("propertyMode").value,
        label = byId("propertyLabel").value.trim();
      var existing = config.properties.find(function (entry) {
        return entry.id === byId("propertyId").value;
      });
      var item = {
        id: byId("propertyId").value,
        label: label,
        key:
          existing && existing.key ? existing.key : propertyKeyFromLabel(label),
        propertyMode: mode,
        type:
          mode === "readonly"
            ? (existing && existing.type) || "text"
            : byId("propertyType").value,
        description: byId("propertyDescription").value.trim(),
        enabled: byId("propertyEnabled").checked,
        valueTemplate:
          mode === "readonly" ? byId("propertyValueTemplate").value.trim() : "",
        defaultTemplate:
          mode === "input" ? byId("propertyDefaultTemplate").value.trim() : "",
        validationEnabled:
          mode === "input" && byId("validationEnabled").checked,
        inputMaskEnabled: mode === "input" && byId("inputMaskEnabled").checked,
        labelColor: byId("propertyLabelColor").value,
        labelBackgroundColor: byId("propertyLabelBackground").value,
        labelBold: byId("propertyLabelBold").checked,
        labelItalic: byId("propertyLabelItalic").checked,
        labelUnderline: byId("propertyLabelUnderline").checked,
        valueColor: mode === "readonly" ? byId("propertyValueColor").value : "",
        valueBackgroundColor:
          mode === "readonly" ? byId("propertyValueBackground").value : "",
        valueBold: mode === "readonly" && byId("propertyValueBold").checked,
        valueItalic: mode === "readonly" && byId("propertyValueItalic").checked,
        valueUnderline:
          mode === "readonly" && byId("propertyValueUnderline").checked,
        order: Math.max(
          0,
          Math.min(9999, Math.trunc(Number(byId("propertyOrder").value || 0))),
        ),
        rule: clone(propertyRule),
      };
      if (mode === "readonly") {
        item.enabled = byId("propertyEnabledReadonly").checked;
      }
      if (item.validationEnabled)
        item.validation = {
          preset: byId("validationPreset").value,
          pattern: byId("validationPattern").value,
          flags: byId("validationFlags").value,
          minimumLength: byId("validationMinimumLength").value,
          maximumLength: byId("validationMaximumLength").value,
          message: byId("validationMessage").value,
        };
      if (item.inputMaskEnabled)
        item.inputMask = {
          preset: byId("inputMaskPreset").value,
          pattern: byId("maskPattern").value,
          placeholder: byId("maskPlaceholder").value,
          transform: byId("maskTransform").value,
        };
      if (byId("optionSourceKey").value)
        item.optionSource = {
          sourceKey: byId("optionSourceKey").value,
          valueExpression: byId("optionValueExpression").value.trim(),
          labelExpression: byId("optionLabelExpression").value.trim(),
        };
      if (
        !mode ||
        !propertyNameAvailable() ||
        !/^[a-z][a-z0-9_]{0,63}$/.test(item.key)
      )
        throw new Error(
          "Select a Property Type and enter a unique Display Name.",
        );
      if (mode === "readonly" && !item.valueTemplate)
        throw new Error("Enter a Computed Value for the Read-Only property.");
      if (mode === "input" && !item.type)
        throw new Error("Select an Input Type.");
      validateTemplateBraces(item.description, "Property description", "propertyDescription");
      validateTemplateBraces(item.valueTemplate, "Property computed value", "propertyValueTemplate");
      validateTemplateBraces(item.defaultTemplate, "Property default value", "propertyDefaultTemplate");
      if (item.validationEnabled) {
        if (item.validation.pattern) {
          try {
            new RegExp(item.validation.pattern, item.validation.flags || "");
          } catch (validationError) {
            throw new Error(
              "The validation regular expression is invalid: " +
                validationError.message,
            );
          }
        }
        var validationMin =
            item.validation.minimumLength === ""
              ? null
              : Number(item.validation.minimumLength),
          validationMax =
            item.validation.maximumLength === ""
              ? null
              : Number(item.validation.maximumLength);
        if (
          (validationMin != null &&
            (!Number.isInteger(validationMin) || validationMin < 0)) ||
          (validationMax != null &&
            (!Number.isInteger(validationMax) || validationMax < 1)) ||
          (validationMin != null &&
            validationMax != null &&
            validationMin > validationMax)
        )
          throw new Error("Check the validation minimum and maximum lengths.");
      }
      if (["number", "integer", "range"].indexOf(item.type) >= 0) {
        item.minimum = byId("propertyMinimum").value;
        item.maximum = byId("propertyMaximum").value;
        item.step = byId("propertyStep").value;
        item.unit = byId("propertyUnit").value.trim();
      }
      if (["select", "multiselect"].indexOf(item.type) >= 0)
        item.options = parseOptions(byId("propertyOptions").value);
      var duplicate = config.properties.find(function (entry) {
        return (
          entry.id !== item.id &&
          (entry.key.toLowerCase() === item.key.toLowerCase() ||
            entry.label.toLowerCase() === item.label.toLowerCase())
        );
      });
      if (duplicate)
        throw new Error("A property with that Display Name already exists.");
      var next = clone(config);
      var index = next.properties.findIndex(function (existing) {
        return existing.id === item.id;
      });
      if (index >= 0) next.properties[index] = item;
      else next.properties.push(item);
      byId("propertySaveStatus").hidden = false;
      byId("propertySaveStatus").textContent = "Saving…";
      saveConfiguration(next, [], "propertyDialog");
    } catch (error) {
      showEditorError("propertyDialog", error.message, error.fieldId);
    }
  }

  function deleteProperty(definition) {
    if (
      !window.confirm(
        'Delete the property definition "' + definition.label + '"?',
      )
    )
      return;
    var purge = window.confirm(
      "Also permanently delete its stored values from every device?\n\nOK = delete values\nCancel = retain dormant values",
    );
    var next = clone(config);
    next.properties = next.properties.filter(function (item) {
      return item.id !== definition.id;
    });
    saveConfiguration(next, purge ? [definition.key] : []);
  }

  function openDisplayGroup(definition) {
    var item = definition
      ? clone(definition)
      : {
          id: makeId("display-group"),
          name: "",
          description: "",
          color: "#2458b8",
          order: (config.displayGroups || []).length + 1,
          rule: emptyRule(),
        };
    byId("displayGroupDialogTitle").textContent = definition
      ? "Edit Link Group"
      : "Create Link Group";
    byId("displayGroupId").value = item.id;
    byId("displayGroupName").value = item.name || "";
    byId("displayGroupDescription").value = item.description || "";
    byId("displayGroupColor").value = /^#[0-9a-f]{6}$/i.test(item.color || "")
      ? item.color
      : "#2458b8";
    byId("displayGroupOrder").value = item.order || 1;
    clearEditorStatus("displayGroupDialog");
    displayGroupRule = clone(item.rule || emptyRule());
    renderRuleEditor(byId("displayGroupRules"), displayGroupRule, function () {
      updatePreview(displayGroupRule, "displayGroupPreview");
    });
    updatePreview(displayGroupRule, "displayGroupPreview");
    byId("displayGroupDialog").showModal();
  }
  function saveDisplayGroup(event) {
    event.preventDefault();
    var item = {
      id: byId("displayGroupId").value,
      name: byId("displayGroupName").value.trim(),
      description: byId("displayGroupDescription").value.trim(),
      color: byId("displayGroupColor").value,
      order: Number(byId("displayGroupOrder").value || 1),
      rule: clone(displayGroupRule),
    };
    if (!item.name) {
      showEditorError("displayGroupDialog", "Enter a Link Group name.", "displayGroupName");
      return;
    }
    var duplicate = (config.displayGroups || []).find(function (group) {
      return (
        group.id !== item.id &&
        group.name.toLowerCase() === item.name.toLowerCase()
      );
    });
    if (duplicate) {
      showEditorError("displayGroupDialog", "A Link Group with that name already exists.", "displayGroupName");
      return;
    }
    try {
      validateTemplateBraces(item.name, "Link Group name", "displayGroupName");
      validateTemplateBraces(item.description, "Link Group description", "displayGroupDescription");
    } catch (error) {
      showEditorError("displayGroupDialog", error.message, error.fieldId);
      return;
    }
    var next = clone(config);
    next.displayGroups = next.displayGroups || [];
    var index = next.displayGroups.findIndex(function (group) {
      return group.id === item.id;
    });
    if (index >= 0) next.displayGroups[index] = item;
    else next.displayGroups.push(item);
    byId("displayGroupSaveStatus").hidden = false;
    byId("displayGroupSaveStatus").textContent = "Saving…";
    saveConfiguration(next, [], "displayGroupDialog");
  }
  function deleteDisplayGroup(definition) {
    var used = (config.items || []).filter(function (item) {
      return item.displayGroupId === definition.id;
    }).length;
    if (
      !window.confirm(
        'Delete the Link Group "' +
          definition.name +
          '"?' +
          (used ? "\n\n" + used + " item(s) will be changed to No group." : ""),
      )
    )
      return;
    var next = clone(config);
    next.displayGroups = (next.displayGroups || []).filter(function (group) {
      return group.id !== definition.id;
    });
    (next.items || []).forEach(function (item) {
      if (item.displayGroupId === definition.id) item.displayGroupId = "";
    });
    saveConfiguration(next, []);
  }

  function openLink(definition) {
    var item = definition
      ? clone(definition)
      : {
          id: makeId("item"),
          kind: "",
          displayNameTemplate: "",
          displayDescriptionTemplate: "",
          hintTemplate: "",
          displayGroupId: "",
          row: 1,
          position: 1,
          color: "",
          ruleMode: "inherit",
          enabled: false,
          showGeneral: true,
          showTerminal: false,
          rule: emptyRule(),
          link: {
            urlTemplate: "",
            defaultUrlTemplate: "",
            protocol: "https",
            target: "new",
          },
        };
    var link = item.link || {},
      commandItem = item.command || {};
    byId("linkDialogTitle").textContent = definition
      ? "Edit Link"
      : "Create Link";
    byId("linkDialog").dataset.newItem = definition ? "false" : "true";
    byId("linkId").value = item.id;
    byId("linkName").value = item.displayNameTemplate || "";
    byId("linkKind").value = item.kind || "";
    var groupSelect = byId("linkDisplayGroup");
    groupSelect.replaceChildren();
    option(groupSelect, "", "No group");
    (config.displayGroups || []).forEach(function (group) {
      option(groupSelect, group.id, group.name);
    });
    groupSelect.value = item.displayGroupId || "";
    byId("linkRow").value = Math.max(1, Math.min(9999, Number(item.row) || 1));
    byId("linkOrder").value = Math.max(
      1,
      Math.min(9999, Number(item.position) || 1),
    );
    byId("linkUrl").value = link.urlTemplate || "";
    byId("linkDefaultUrl").value = link.defaultUrlTemplate || "";
    var savedProtocol = String(link.protocol || "web").toLowerCase(),
      urlProtocol = literalScheme(link.urlTemplate);
    if (savedProtocol === "web")
      savedProtocol =
        urlProtocol === "http" || urlProtocol === "https"
          ? urlProtocol
          : "https";
    if (savedProtocol === "custom") savedProtocol = urlProtocol || "";
    setUriScheme(savedProtocol);
    byId("linkDescription").value = item.displayDescriptionTemplate || "";
    byId("linkHint").value = item.hintTemplate || "";
    byId("linkEnabled").checked = definition ? item.enabled !== false : false;
    byId("itemUseGroupColor").checked = !item.color;
    byId("linkColor").value = /^#[0-9a-f]{6}$/i.test(item.color || "")
      ? item.color
      : "#2458b8";
    updateLinkColourVisibility();
    byId("commandShell").value = commandItem.shell || "cmd";
    byId("commandMode").value = commandItem.mode || "run";
    byId("commandRunAs").value = String(commandItem.runAs || 0);
    byId("commandText").value = commandItem.commandTemplate || "";
    byId("commandConfirm").checked = commandItem.confirm === true;
    byId("commandConfirmText").value = commandItem.confirmTemplate || "";
    byId("itemShowGeneral").checked = item.showGeneral !== false;
    byId("itemShowTerminal").checked = item.showTerminal === true;
    byId("itemRuleMode").value =
      item.ruleMode === "inherit" ? "inherit" : "override";
    clearEditorStatus("linkDialog");
    linkKindChanged();
    uriSchemeChanged(!definition);
    itemRuleModeChanged();
    updateLinkWizard();
    linkRule = clone(item.rule || emptyRule());
    renderRuleEditor(byId("linkRules"), linkRule, function () {
      updatePreview(linkRule, "linkPreview");
    });
    updatePreview(linkRule, "linkPreview");
    byId("linkDialog").showModal();
  }
  function linkNameAvailable() {
    var name = byId("linkName").value.trim();
    return Boolean(name) && !/[{}]/.test(name);
  }
  function updateLinkWizard() {
    var kind = byId("linkKind").value,
      hasKind = kind === "link" || kind === "command",
      hasName = linkNameAvailable(),
      name = byId("linkName").value.trim(),
      status = byId("linkNameStatus");
    byId("linkIdentityStep").hidden = !hasKind;
    byId("linkDetailsSteps").hidden = !(hasKind && hasName);
    byId("linkVisibilityStep").hidden = !(
      hasKind &&
      hasName &&
      byId("linkEnabled").checked
    );
    status.textContent = !name
      ? "Enter a Name to continue."
      : /[{}]/.test(name)
        ? "Name cannot contain a formula."
        : "Name is valid.";
    status.className = "ui tiny basic label hint" + (name && !hasName ? " red error-text" : "");
  }
  function linkKindChanged() {
    var kind = byId("linkKind").value,
      command = kind === "command";
    byId("linkFields").style.display = command ? "none" : "block";
    byId("commandFields").style.display = command ? "block" : "none";
    byId("linkConfigurationTitle").textContent = command
      ? "4. Command Configuration"
      : "4. URL Configuration";
    updateLinkWizard();
  }
  function itemRuleModeChanged() {
    var hasGroup = Boolean(byId("linkDisplayGroup").value);
    if (!hasGroup) byId("itemRuleMode").value = "override";
    byId("itemRuleMode").disabled = !hasGroup;
    var inherit = hasGroup && byId("itemRuleMode").value === "inherit";
    byId("itemRuleEditor").style.display = inherit ? "none" : "";
    var group = (config.displayGroups || []).find(function (entry) {
      return entry.id === byId("linkDisplayGroup").value;
    });
    byId("itemRuleExplanation").textContent = inherit
      ? "This item uses the Link Group rule: " +
        ruleSummary(group && group.rule) +
        "."
      : hasGroup
        ? "This item’s rule completely replaces the Link Group rule."
        : "Items without a Link Group use their own rule.";
  }
  function updateLinkColourVisibility() {
    var useGroup = byId("itemUseGroupColor").checked;
    byId("linkColorField").hidden = useGroup;
    byId("linkColor").disabled = useGroup;
  }
  function saveLink(event) {
    event.preventDefault();
    try {
    var item = {
      id: byId("linkId").value,
      kind: byId("linkKind").value,
      displayNameTemplate: byId("linkName").value.trim(),
      displayDescriptionTemplate: byId("linkDescription").value.trim(),
      hintTemplate: byId("linkHint").value.trim(),
      displayGroupId: byId("linkDisplayGroup").value,
      row: Math.max(
        1,
        Math.min(9999, Math.trunc(Number(byId("linkRow").value || 1))),
      ),
      position: Math.max(
        1,
        Math.min(9999, Math.trunc(Number(byId("linkOrder").value || 1))),
      ),
      color: byId("itemUseGroupColor").checked ? "" : byId("linkColor").value,
      ruleMode:
        byId("linkDisplayGroup").value &&
        byId("itemRuleMode").value === "inherit"
          ? "inherit"
          : "override",
      enabled: byId("linkEnabled").checked,
      showGeneral: byId("itemShowGeneral").checked,
      showTerminal: byId("itemShowTerminal").checked,
      rule: clone(linkRule),
    };
    if (item.kind === "link")
      item.link = {
        urlTemplate: byId("linkUrl").value.trim(),
        defaultUrlTemplate: byId("linkDefaultUrl").value.trim(),
        protocol: selectedUriScheme() || "custom",
        target: "new",
      };
    else
      item.command = {
        shell: byId("commandShell").value,
        mode: byId("commandMode").value,
        runAs: Number(byId("commandRunAs").value),
        commandTemplate: byId("commandText").value.trim(),
        confirm: byId("commandConfirm").checked,
        confirmTemplate: byId("commandConfirmText").value.trim(),
      };
    if (
      !linkNameAvailable() ||
      (item.kind === "link"
        ? !item.link.urlTemplate || !selectedUriScheme()
        : item.kind !== "command" || !item.command.commandTemplate)
    ) {
      showEditorError(
        "linkDialog",
        "Select a Link Type, enter a plain Name and provide the " +
          (item.kind === "link" ? "URI Scheme and URL" : "command") + ".",
        !item.kind ? "linkKind" : !item.displayNameTemplate ? "linkName" : item.kind === "link" && !selectedUriScheme() ? "linkProtocol" : item.kind === "link" ? "linkUrl" : "commandText",
      );
      return;
    }
    validateTemplateBraces(item.displayDescriptionTemplate, "Link description", "linkDescription");
    validateTemplateBraces(item.hintTemplate, "Link hint", "linkHint");
    if (item.kind === "link") {
      validateTemplateBraces(item.link.urlTemplate, "Link URL", "linkUrl");
      validateTemplateBraces(item.link.defaultUrlTemplate, "Link fallback URL", "linkDefaultUrl");
    } else {
      validateTemplateBraces(item.command.commandTemplate, "Command", "commandText");
      validateTemplateBraces(item.command.confirmTemplate, "Command confirmation", "commandConfirmText");
    }
    var next = clone(config);
    next.items = next.items || [];
    var index = next.items.findIndex(function (existing) {
      return existing.id === item.id;
    });
    if (index >= 0) next.items[index] = item;
    else next.items.push(item);
    byId("linkSaveStatus").hidden = false;
    byId("linkSaveStatus").textContent = "Saving…";
    saveConfiguration(next, [], "linkDialog");
    } catch (error) {
      showEditorError("linkDialog", error.message, error.fieldId);
    }
  }
  function deleteLink(definition) {
    if (!window.confirm('Delete "' + definition.displayNameTemplate + '"?'))
      return;
    var next = clone(config);
    next.items = (next.items || []).filter(function (item) {
      return item.id !== definition.id;
    });
    saveConfiguration(next, []);
  }

  function dataSourceKeyFromName(name) {
    var key = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!/^[a-z]/.test(key)) key = "source_" + key;
    return key.slice(0, 64);
  }
  function dataVariableKeyFromName(name) {
    var key = String(name || "")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!/^[A-Za-z_]/.test(key)) key = "value_" + key;
    return key.slice(0, 64);
  }
  function requestPlaceholderFromName(name) {
    var key = String(name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!/^[a-z_]/.test(key)) key = "value_" + key;
    return key.slice(0, 64);
  }
  function requestVariablesValid() {
    var seen = Object.create(null);
    return dataSourceVariables.every(function (variable) {
      var key = String(variable.key || "").trim(),
        normalized = key.toLowerCase();
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) || seen[normalized])
        return false;
      seen[normalized] = true;
      if (variable.mode === "api") {
        var dependency = (config.dataSources || []).find(function (source) {
          return (
            source.id !== byId("dataSourceId").value &&
            source.key === variable.sourceKey &&
            source.enabled !== false
          );
        });
        if (!dependency) return false;
      }
      return Boolean(String(variable.valueTemplate || "").trim());
    });
  }
  function dataSourceNameAvailable() {
    var name = byId("dataSourceName").value.trim(),
      id = byId("dataSourceId").value,
      key = dataSourceKeyFromName(name);
    return (
      Boolean(name) &&
      !(config.dataSources || []).some(function (source) {
        return (
          source.id !== id &&
          (String(source.name || "").toLowerCase() === name.toLowerCase() ||
            String(source.key || "").toLowerCase() === key.toLowerCase())
        );
      })
    );
  }
  function dataOutputKeyFromName(name) {
    return dataSourceKeyFromName(name).replace(/^source_/, "value_");
  }
  function formulaButton(target) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "formula-button";
    button.textContent = "fx";
    button.onclick = function () {
      openFormulaComposer(target.id);
    };
    return button;
  }
  function sourceTypeName(type) {
    return (
      {
        staticList: "Static List",
        databaseQuery: "Database Query",
        apiQuery: "API Query",
      }[type] || "Data Source"
    );
  }
  function renderDataSourceVariables() {
    var list = byId("dataSourceVariables");
    list.replaceChildren();
    if (!dataSourceVariables.length) {
      var empty = document.createElement("div");
      empty.className = "empty compact-empty";
      empty.textContent = "No Request Variables have been added.";
      list.appendChild(empty);
      return;
    }
    dataSourceVariables.forEach(function (variable, index) {
      var row = document.createElement("div");
      row.className = "repeat-row request-variable-row";
      var keyLabel = document.createElement("label");
      keyLabel.textContent = "Placeholder";
      var key = document.createElement("input");
      key.value = variable.key || "";
      key.maxLength = 64;
      key.placeholder = "Enter Placeholder...";
      function validatePlaceholder() {
        var normalized = String(key.value || "").trim().toLowerCase(),
          duplicate = dataSourceVariables.some(function (item, itemIndex) {
            return (
              itemIndex !== index &&
              String(item.key || "").trim().toLowerCase() === normalized
            );
          }),
          valid = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key.value);
        key.setCustomValidity(
          !key.value
            ? "Enter a placeholder."
            : !valid
              ? "Use letters, digits and underscores only, beginning with a letter or underscore."
              : duplicate
                ? "Request Variable placeholders must be unique."
                : "",
        );
        key.setAttribute(
          "aria-invalid",
          key.validationMessage ? "true" : "false",
        );
      }
      key.oninput = function () {
        variable.key = key.value;
        validatePlaceholder();
        scheduleDataSourceValidation();
      };
      key.onblur = function () {
        if (key.value && !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key.value)) {
          variable.key = requestPlaceholderFromName(key.value);
          key.value = variable.key;
        }
        validatePlaceholder();
        scheduleDataSourceValidation();
      };
      validatePlaceholder();
      keyLabel.appendChild(key);
      var valueLabel = document.createElement("label");
      var title = document.createElement("span");
      title.className = "field-title";
      title.appendChild(
        document.createTextNode(
          variable.mode === "api" ? "Data Source Output" : "Value / Formula ",
        ),
      );
      var value = document.createElement("input");
      value.id = "dataSourceVariableValue" + index;
      value.value = variable.valueTemplate || "";
      value.maxLength = 2048;
      value.placeholder = "{...}";
      value.oninput = function () {
        variable.valueTemplate = value.value;
        scheduleDataSourceValidation();
      };
      if (variable.mode !== "api") title.appendChild(formulaButton(value));
      valueLabel.append(title, value);
      if (variable.mode === "api") {
        value.readOnly = true;
        var picker = document.createElement("div");
        picker.className = "form-grid two";
        var source = document.createElement("select"),
          output = document.createElement("select");
        option(source, "", "Select Data Source…");
        (config.dataSources || [])
          .filter(function (item) {
            return (
              item.id !== byId("dataSourceId").value &&
              item.enabled !== false
            );
          })
          .forEach(function (item) {
            option(source, item.key, item.name);
          });
        var dependencyAvailable = (config.dataSources || []).some(function (item) {
          return (
            item.id !== byId("dataSourceId").value &&
            item.key === variable.sourceKey &&
            item.enabled !== false
          );
        });
        if (variable.sourceKey && !dependencyAvailable) {
          var unavailable = document.createElement("option");
          unavailable.value = variable.sourceKey;
          unavailable.textContent = "Unavailable Data Source — enable it first";
          unavailable.disabled = true;
          source.appendChild(unavailable);
          source.setCustomValidity(
            "Enable the selected Data Source before using its outputs.",
          );
          source.setAttribute("aria-invalid", "true");
        }
        source.value = variable.sourceKey || "";
        function outputs() {
          output.replaceChildren();
          option(output, "", "Select Output…");
          var selected = (config.dataSources || []).find(function (item) {
            return item.key === source.value;
          });
          ((selected && selected.outputs) || []).forEach(function (item) {
            option(output, item.key, item.name);
          });
          if (selected && selected.output)
            option(output, selected.output.key, selected.output.name);
          output.value = variable.outputKey || "";
        }
        outputs();
        source.onchange = function () {
          source.setCustomValidity("");
          source.setAttribute("aria-invalid", "false");
          variable.sourceKey = source.value;
          variable.outputKey = "";
          outputs();
          value.value = "";
          scheduleDataSourceValidation();
        };
        output.onchange = function () {
          variable.outputKey = output.value;
          var selectedOutput = ((config.dataSources || []).find(function (item) {
            return item.key === source.value;
          }) || {}).outputs || [];
          var outputDefinition = selectedOutput.find(function (item) {
            return item.key === output.value;
          });
          if (!outputDefinition) {
            var selectedSource = (config.dataSources || []).find(function (item) {
              return item.key === source.value;
            });
            if (selectedSource && selectedSource.output && selectedSource.output.key === output.value)
              outputDefinition = selectedSource.output;
          }
          if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(variable.key || "")) {
            variable.key = requestPlaceholderFromName(
              (outputDefinition && (outputDefinition.key || outputDefinition.name)) || output.value,
            );
            key.value = variable.key;
            validatePlaceholder();
          }
          variable.valueTemplate =
            source.value && output.value
              ? "{api." + source.value + "." + output.value + "}"
              : "";
          value.value = variable.valueTemplate;
          scheduleDataSourceValidation();
        };
        picker.append(source, output);
        valueLabel.appendChild(picker);
      }
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger repeat-remove";
      remove.textContent = "Remove";
      remove.onclick = function () {
        dataSourceVariables.splice(index, 1);
        renderDataSourceVariables();
        scheduleDataSourceValidation();
      };
      row.append(keyLabel, valueLabel, remove);
      list.appendChild(row);
    });
  }
  function jmesPathSegment(prefix, key) {
    var segment = /^[A-Za-z_][A-Za-z0-9_]*$/.test(key)
      ? key
      : '"' + String(key).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    return prefix ? prefix + "." + segment : segment;
  }
  function jmesPathLiteral(value) {
    if (typeof value === "string")
      return "'" + value.replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";
    if (typeof value === "number" || typeof value === "boolean" || value === null)
      return "`" + JSON.stringify(value) + "`";
    return "";
  }
  function availableJmesPaths(value) {
    var result = [],
      seen = Object.create(null);
    function add(path) {
      if (path && !seen[path] && result.length < 300) {
        seen[path] = true;
        result.push(path);
      }
    }
    function visit(current, path, depth) {
      if (depth > 7 || result.length >= 300) return;
      if (path) add(path);
      if (Array.isArray(current)) {
        if (current.length) {
          var arrayPath =
            current.length === 1
              ? path
                ? path + "[0]"
                : "[0]"
              : path
                ? path + "[]"
                : "[]";
          visit(current[0], arrayPath, depth + 1);
          if (current.length > 1)
            current.slice(0, 25).forEach(function (entry, index) {
              visit(entry, path ? path + "[" + index + "]" : "[" + index + "]", depth + 1);
            });
        }
      } else if (current && typeof current === "object") {
        Object.keys(current).forEach(function (key) {
          visit(current[key], jmesPathSegment(path, key), depth + 1);
        });
      }
    }
    add("@");
    visit(value, "", 0);
    return result;
  }
  function previewJmesPath(expression) {
    if (!apiPreviewAvailable || !String(expression || "").trim()) return null;
    return (window.TechWizardPropertyLibraries || {}).jmespath.search(
      apiPreviewResult,
      expression,
    );
  }
  function wildcardFilterParts(filterExpression) {
    var match = /^(.+?)\s*(==|!=|matches)\s*(['"])([\s\S]*)\3\s*$/i.exec(
      String(filterExpression || "").trim(),
    );
    if (!match || !/[*?]/.test(match[4])) return null;
    return {
      fieldExpression: match[1].trim(),
      pattern: match[4],
      negate: match[2] === "!=",
    };
  }
  function wildcardMatches(value, pattern) {
    var expression = "^";
    String(pattern || "").split("").forEach(function (character) {
      if (character === "*") expression += ".*";
      else if (character === "?") expression += ".";
      else expression += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    });
    return new RegExp(expression + "$", "i").test(String(value == null ? "" : value));
  }
  function stripFilterParentheses(expression) {
    expression = String(expression || "").trim();
    while (expression[0] === "(" && expression[expression.length - 1] === ")") {
      var depth = 0, quote = "", escaped = false, wraps = true;
      for (var index = 0; index < expression.length; index += 1) {
        var character = expression[index];
        if (quote) {
          if (escaped) escaped = false;
          else if (character === "\\") escaped = true;
          else if (character === quote) quote = "";
          continue;
        }
        if (character === "'" || character === '"') quote = character;
        else if (character === "(") depth += 1;
        else if (character === ")") {
          depth -= 1;
          if (depth === 0 && index < expression.length - 1) { wraps = false; break; }
        }
      }
      if (!wraps || depth !== 0 || quote) break;
      expression = expression.slice(1, -1).trim();
    }
    return expression;
  }
  function findFilterOperator(expression, operator) {
    var depth = 0, quote = "", escaped = false;
    for (var index = 0; index <= expression.length - operator.length; index += 1) {
      var character = expression[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === "'" || character === '"') quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      else if (depth === 0 && expression.slice(index, index + operator.length) === operator) return index;
    }
    return -1;
  }
  function evaluateFilterPredicate(entry, filterExpression, search) {
    var expression = stripFilterParentheses(filterExpression), operatorIndex, wildcard, matched;
    operatorIndex = findFilterOperator(expression, "||");
    if (operatorIndex >= 0)
      return evaluateFilterPredicate(entry, expression.slice(0, operatorIndex), search) ||
        evaluateFilterPredicate(entry, expression.slice(operatorIndex + 2), search);
    operatorIndex = findFilterOperator(expression, "&&");
    if (operatorIndex >= 0)
      return evaluateFilterPredicate(entry, expression.slice(0, operatorIndex), search) &&
        evaluateFilterPredicate(entry, expression.slice(operatorIndex + 2), search);
    wildcard = wildcardFilterParts(expression);
    if (wildcard) {
      matched = wildcardMatches(search(entry, wildcard.fieldExpression), wildcard.pattern);
      return wildcard.negate ? !matched : matched;
    }
    return Boolean(search(entry, expression));
  }
  function availableInputSuggestions(value, filterExpression) {
    var result = [], seen = Object.create(null), search = ((window.TechWizardPropertyLibraries || {}).jmespath || {}).search;
    function add(path) {
      if (path && !seen[path] && result.length < 300) { seen[path] = true; result.push(path); }
    }
    function matches(entries) {
      if (!filterExpression) return true;
      try {
        return entries.some(function (entry) { return evaluateFilterPredicate(entry, filterExpression, search); });
      } catch (error) { return false; }
    }
    function visit(current, path, depth) {
      if (depth > 7 || result.length >= 300) return;
      if (Array.isArray(current)) {
        var collectionPath = path ? path + "[]" : "[]";
        if (matches(current)) add(collectionPath);
        current.slice(0, 25).forEach(function (entry) {
          if (entry && typeof entry === "object" && !Array.isArray(entry))
            Object.keys(entry).forEach(function (key) {
              visit(entry[key], jmesPathSegment(collectionPath, key), depth + 1);
            });
        });
      } else if (current && typeof current === "object") {
        Object.keys(current).forEach(function (key) {
          visit(current[key], jmesPathSegment(path, key), depth + 1);
        });
      }
    }
    if (!filterExpression && value && typeof value === "object" && !Array.isArray(value)) add("@");
    visit(value, "", 0);
    return result;
  }
  function evaluatePreviewOutput(output) {
    var libraries = window.TechWizardPropertyLibraries || {},
      inputExpression = String(output.inputExpression || output.expression || "@").trim() || "@",
      filterExpression = String(output.filterExpression || "").trim(),
      outputExpression = String(output.outputExpression || "").trim(), input, entries, selected;
    if (!filterExpression) {
      var expression = composeOutputExpression(output);
      return expression ? libraries.jmespath.search(apiPreviewResult, expression) : apiPreviewResult;
    }
    input = libraries.jmespath.search(apiPreviewResult, inputExpression);
    entries = Array.isArray(input) ? input : (input == null ? [] : [input]);
    selected = entries.find(function (entry) {
      return evaluateFilterPredicate(entry, filterExpression, libraries.jmespath.search);
    });
    if (selected == null) return null;
    if (!outputExpression || outputExpression === "@") return selected;
    return libraries.jmespath.search(selected, outputExpression);
  }
  function populateSuggestions(list, suggestions, atLabel) {
    list.replaceChildren();
    suggestions.forEach(function (suggestion) {
      option(list, suggestion, suggestion === "@" ? (atLabel || "Entire value") : suggestion);
    });
  }
  function populateSemanticMenu(menu, suggestions, atLabel) {
    menu.replaceChildren();
    suggestions.forEach(function (suggestion) {
      var item = document.createElement("div");
      item.className = "item";
      item.dataset.value = suggestion;
      item.textContent = suggestion === "@" ? (atLabel || "Entire value") : suggestion;
      menu.appendChild(item);
    });
  }
  function configureSemanticSearch(wrapper, value, onChange) {
    if (!(window.jQuery && window.jQuery.fn && window.jQuery.fn.dropdown)) return;
    var jq = window.jQuery(wrapper), suppressChange = true;
    try { jq.dropdown("destroy"); } catch (error) {}
    jq.dropdown({
      allowAdditions: true,
      hideAdditions: false,
      forceSelection: false,
      fullTextSearch: true,
      clearable: true,
      message: { addResult: "Use custom value <b>{term}</b>" },
      onChange: function (selected) {
        if (!suppressChange) onChange(String(selected || ""));
      },
    });
    if (value) jq.dropdown("set selected", value);
    else jq.dropdown("clear");
    suppressChange = false;
    suppressPasswordManager(wrapper.querySelector("input.search"), wrapper.id || "search-dropdown");
    enableSelectedValueEditing(wrapper, function () {
      var hidden = wrapper.querySelector('input[type="hidden"]');
      return hidden ? hidden.value : value;
    });
  }
  function createSemanticCombo(id, value, suggestions, placeholder, atLabel, onChange) {
    var wrapper = document.createElement("div"), hidden = document.createElement("input"),
      icon = document.createElement("i"), textValue = document.createElement("div"), menu = document.createElement("div");
    wrapper.id = id;
    wrapper.className = "ui fluid search selection dropdown";
    hidden.type = "hidden";
    hidden.value = value || "";
    icon.className = "dropdown icon";
    textValue.className = "default text";
    textValue.textContent = placeholder;
    menu.className = "menu";
    populateSemanticMenu(menu, suggestions, atLabel);
    wrapper.append(hidden, icon, textValue, menu);
    wrapper._initializeCombo = function () { configureSemanticSearch(wrapper, value, onChange); };
    return wrapper;
  }
  function availableFilterSuggestions(inputExpression) {
    var result = [], seen = Object.create(null), value;
    try { value = previewJmesPath(inputExpression); } catch (error) { return result; }
    value = Array.isArray(value) ? value : (value && typeof value === "object" ? [value] : []);
    function add(path, item) {
      var literal = jmesPathLiteral(item), suggestion, wildcardSuggestion;
      if (!literal) return;
      suggestion = path + " == " + literal;
      if (!seen[suggestion]) { seen[suggestion] = true; result.push(suggestion); }
      if (typeof item === "string") {
        wildcardSuggestion = path + " == '*" + item.replace(/'/g, "''") + "*'";
        if (!seen[wildcardSuggestion]) { seen[wildcardSuggestion] = true; result.push(wildcardSuggestion); }
      }
    }
    function visit(current, path, depth) {
      if (!current || typeof current !== "object" || Array.isArray(current) || depth > 2) return;
      Object.keys(current).forEach(function (key) {
        var nextPath = jmesPathSegment(path, key), child = current[key];
        if (child !== null && typeof child === "object") visit(child, nextPath, depth + 1);
        else add(nextPath, child);
      });
    }
    value.slice(0, 50).forEach(function (entry) { visit(entry, "", 0); });
    return result.slice(0, 300);
  }
  function refreshDataSourceOutputFilterSuggestions() {
    var suggestions = [], seen = Object.create(null), candidateInputs = [], candidateSeen = Object.create(null);
    function addInput(expression) {
      expression = String(expression || "").trim();
      if (!expression || candidateSeen[expression]) return;
      try {
        var value = previewJmesPath(expression);
        if (!Array.isArray(value) && !(value && typeof value === "object")) return;
      } catch (error) { return; }
      candidateSeen[expression] = true;
      candidateInputs.push(expression);
    }
    dataSourceOutputs.forEach(function (output) {
      addInput(output.inputExpression || output.expression || "@");
    });
    if (apiPreviewAvailable) {
      var discoveredInputs = availableInputSuggestions(apiPreviewResult, "");
      if (discoveredInputs.some(function (expression) { return expression !== "@"; }))
        discoveredInputs = discoveredInputs.filter(function (expression) { return expression !== "@"; });
      discoveredInputs.forEach(addInput);
    }
    candidateInputs.forEach(function (inputExpression) {
      availableFilterSuggestions(inputExpression).forEach(function (suggestion) {
        if (!seen[suggestion]) {
          seen[suggestion] = true;
          suggestions.push(suggestion);
        }
      });
    });
    suggestions = suggestions.slice(0, 500);
    var signature = JSON.stringify(suggestions), wrapper = byId("dataSourceOutputFilterDropdown");
    if (signature === dataSourceFilterSuggestionsSignature && wrapper.classList.contains("active-semantic-combo")) return;
    dataSourceFilterSuggestionsSignature = signature;
    populateSemanticMenu(byId("dataSourceOutputFilterMenu"), suggestions);
    configureSemanticSearch(wrapper, dataSourceOutputFilterExpression, setDataSourceOutputFilter);
    wrapper.classList.add("active-semantic-combo");
  }
  function setDataSourceOutputFilter(value) {
    dataSourceOutputFilterExpression = String(value || "").trim();
    dataSourceOutputs.forEach(function (output) {
      output.filterExpression = dataSourceOutputFilterExpression;
      output.expression = composeOutputExpression(output);
    });
    renderDataSourceOutputs();
    updateDataSourceWizard();
  }
  function appendOutputPath(expression, outputExpression) {
    if (!outputExpression) return expression;
    return /^\[/.test(outputExpression)
      ? expression + outputExpression
      : expression + "." + outputExpression;
  }
  function composeOutputExpression(output) {
    var inputExpression = String(output.inputExpression || output.expression || "").trim(),
      filterExpression = String(output.filterExpression || "").trim(),
      outputExpression = String(output.outputExpression || "").trim(),
      expression = inputExpression;
    if (outputExpression === "@") outputExpression = "";
    if (!expression) return "";
    if (filterExpression) {
      expression = expression.replace(/\[\]\s*$/, "") + "[?" + filterExpression + "] | [0]";
      return appendOutputPath(expression, outputExpression);
    }
    if (outputExpression) {
      expression = appendOutputPath(expression, outputExpression);
    }
    return expression;
  }
  function availableOutputSuggestions(output) {
    var result = [], value;
    try {
      value = evaluatePreviewOutput({
        inputExpression: output.inputExpression,
        filterExpression: output.filterExpression,
        outputExpression: "@",
      });
      if (Array.isArray(value)) value = value.length ? value[0] : null;
      result = availableJmesPaths(value);
    } catch (error) {}
    return result;
  }
  function outputValueType(value) {
    if (
      Array.isArray(value) &&
      value.length > 1 &&
      value.every(function (item) {
        return item !== null && typeof item === "object" && !Array.isArray(item);
      })
    )
      return "Dataset";
    if (
      Array.isArray(value) &&
      value.length === 1 &&
      value[0] !== null &&
      typeof value[0] === "object" &&
      !Array.isArray(value[0])
    )
      return "Object";
    if (
      !Array.isArray(value) &&
      value !== null &&
      typeof value === "object"
    )
      return "Object";
    return "Single Value";
  }
  function refreshOutputValuePreview(output, typeElement, valueElement) {
    output.expression = composeOutputExpression(output);
    if (!String(output.expression || "").trim()) {
      typeElement.value = "Not configured";
      valueElement.textContent = "Enter or select an Input to preview this variable.";
      return;
    }
    if (!apiPreviewAvailable) {
      typeElement.value = "Not previewed";
      valueElement.textContent = "Run Live Preview & Validation to inspect this variable.";
      return;
    }
    try {
      var value = evaluatePreviewOutput(output),
        rendered = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      typeElement.value = outputValueType(value);
      valueElement.textContent = (rendered == null ? String(value) : rendered).slice(0, 4000);
    } catch (error) {
      typeElement.value = "Invalid JMESPath";
      valueElement.textContent = error.message;
    }
  }
  function renderDataSourceOutputs() {
    var list = byId("dataSourceOutputs");
    dataSourceSuggestionRevision += 1;
    list.replaceChildren();
    if (!dataSourceOutputs.length) {
      var empty = document.createElement("div");
      empty.className = "empty compact-empty";
      empty.textContent = "No Output Variables have been added.";
      list.appendChild(empty);
      refreshDataSourceOutputFilterSuggestions();
      return;
    }
    dataSourceOutputs.forEach(function (output, index) {
      var row = document.createElement("div");
      row.className = "repeat-row api-output-row";
      var nameLabel = document.createElement("label");
      nameLabel.textContent = "Variable Name";
      var name = document.createElement("input");
      name.value = output.name || "";
      name.maxLength = 120;
      name.placeholder = "Enter Variable Name...";
      name.oninput = function () {
        output.name = name.value;
        output.key = dataOutputKeyFromName(name.value);
        updateDataSourceWizard();
      };
      nameLabel.appendChild(name);
      if (output.inputExpression == null)
        output.inputExpression = output.expression || "@";
      output.filterExpression = dataSourceOutputFilterExpression;
      output.outputExpression = output.outputExpression || "";
      var inputLabel = document.createElement("label"), outputLabel = document.createElement("label"),
        inputSuggestions = apiPreviewAvailable ? availableInputSuggestions(apiPreviewResult, dataSourceOutputFilterExpression) : [],
        outputSuggestions;
      if (dataSourceOutputFilterExpression && /\[\d+\]/.test(output.inputExpression) && inputSuggestions.indexOf(output.inputExpression) < 0)
        output.inputExpression = "";
      inputLabel.textContent = "Input";
      outputLabel.textContent = "Output";
      outputSuggestions = availableOutputSuggestions(output);
      var preview = document.createElement("div");
      preview.className = "api-output-preview";
      var typeLabel = document.createElement("label");
      typeLabel.className = "api-output-type";
      typeLabel.textContent = "Output Variable Type";
      var typeValue = document.createElement("input");
      typeValue.className = "api-output-type-value";
      typeValue.readOnly = true;
      typeLabel.appendChild(typeValue);
      var valueLabel = document.createElement("label");
      valueLabel.textContent = "Output Variable Value Preview";
      var valuePreview = document.createElement("pre");
      valueLabel.appendChild(valuePreview);
      preview.append(typeLabel, valueLabel);
      function updateOutputPreview(inputValue, outputValue, rerender) {
        if (inputValue != null) output.inputExpression = inputValue;
        output.filterExpression = dataSourceOutputFilterExpression;
        if (outputValue != null) output.outputExpression = outputValue;
        output.expression = composeOutputExpression(output);
        refreshDataSourceOutputFilterSuggestions();
        refreshOutputValuePreview(output, typeValue, valuePreview);
        updateDataSourceWizard();
        if (rerender) renderDataSourceOutputs();
      }
      var inputCombo = createSemanticCombo(
        "dataSourceOutputInputDropdown" + dataSourceSuggestionRevision + "_" + index,
        output.inputExpression,
        inputSuggestions,
        "Select or enter an Input...",
        "Entire response",
        function (value) { updateOutputPreview(value, null, true); },
      );
      var outputCombo = createSemanticCombo(
        "dataSourceOutputValueDropdown" + dataSourceSuggestionRevision + "_" + index,
        output.outputExpression,
        outputSuggestions,
        "Entire matching object",
        "Entire matching object",
        function (value) { updateOutputPreview(null, value, false); },
      );
      inputLabel.appendChild(inputCombo);
      outputLabel.appendChild(outputCombo);
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger repeat-remove";
      remove.textContent = "Remove";
      remove.onclick = function () {
        dataSourceOutputs.splice(index, 1);
        renderDataSourceOutputs();
        updateDataSourceWizard();
      };
      row.append(nameLabel, inputLabel, outputLabel, remove, preview);
      refreshOutputValuePreview(output, typeValue, valuePreview);
      list.appendChild(row);
      inputCombo._initializeCombo();
      outputCombo._initializeCombo();
    });
    refreshDataSourceOutputFilterSuggestions();
  }
  function renderDataSourceHeaders() {
    var list = byId("dataSourceHeaderList");
    list.replaceChildren();
    if (!dataSourceHeaders.length) {
      var empty = document.createElement("div");
      empty.className = "empty compact-empty";
      empty.textContent = "No additional Headers.";
      list.appendChild(empty);
      return;
    }
    dataSourceHeaders.forEach(function (header, index) {
      var row = document.createElement("div");
      row.className = "table-row";
      var name = document.createElement("code");
      name.textContent = header.name;
      var value = document.createElement("span");
      value.textContent = header.value;
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger small-button";
      remove.textContent = "Remove";
      remove.onclick = function () {
        dataSourceHeaders.splice(index, 1);
        renderDataSourceHeaders();
        scheduleDataSourceValidation();
      };
      row.append(name, value, remove);
      list.appendChild(row);
    });
  }
  function syncAdvancedEntries() {
    byId("staticAdvancedEntries").value = staticEntries
      .map(function (entry) {
        return entry.name + "," + entry.value;
      })
      .join("\n");
  }
  function parseAdvancedEntries() {
    var next = [],
      valid = true;
    byId("staticAdvancedEntries")
      .value.split(/\r?\n/)
      .forEach(function (line) {
        if (!line.trim()) return;
        var comma = line.indexOf(",");
        if (comma < 1 || !line.slice(comma + 1).trim()) {
          valid = false;
          return;
        }
        next.push({
          name: line.slice(0, comma).trim(),
          value: line.slice(comma + 1).trim(),
        });
      });
    if (valid) staticEntries = next;
    renderStaticEntries();
    return valid;
  }
  function renderStaticEntries() {
    var list = byId("staticEntryList");
    list.replaceChildren();
    if (!staticEntries.length) {
      var empty = document.createElement("div");
      empty.className = "empty compact-empty";
      empty.textContent = "No List entries.";
      list.appendChild(empty);
    } else
      staticEntries.forEach(function (entry, index) {
        var row = document.createElement("div");
        row.className = "table-row";
        var name = document.createElement("strong");
        name.textContent = entry.name;
        var value = document.createElement("span");
        value.textContent = entry.value;
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger small-button";
        remove.textContent = "Remove";
        remove.onclick = function () {
          staticEntries.splice(index, 1);
          renderStaticEntries();
          syncAdvancedEntries();
          updateDataSourceWizard();
        };
        row.append(name, value, remove);
        list.appendChild(row);
      });
  }
  function populateDataSourceAuthenticationSecrets(selectedId, legacyAuth) {
    var select = byId("dataSourceAuthSecret");
    select.replaceChildren();
    option(select, "", "None");
    (config.authenticationSecrets || []).slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    }).forEach(function (secret) {
      option(select, secret.id, secret.name);
    });
    dataSourceHasLegacyAuthentication = Boolean(
      !selectedId && legacyAuth && legacyAuth.type && legacyAuth.type !== "none",
    );
    select.value = selectedId || "";
  }
  function updateDataSourceAuthFields() {
    if (byId("dataSourceAuthSecret").value) dataSourceHasLegacyAuthentication = false;
  }
  function updateAuthenticationSecretFields() {
    var type = byId("authenticationSecretType").value,
      header = type === "headerStored",
      basic = type === "basicStored",
      token = type === "bearerStored" || header;
    byId("authenticationSecretHeaderLabel").hidden = !header;
    byId("authenticationSecretTokenLabel").hidden = !token;
    byId("authenticationSecretUsernameLabel").hidden = !basic;
    byId("authenticationSecretPasswordLabel").hidden = !basic;
    if (header && !byId("authenticationSecretHeaderName").value.trim())
      byId("authenticationSecretHeaderName").value = "X-API-Key";
  }
  function authenticationSecretNameAvailable() {
    var name = byId("authenticationSecretName").value.trim(),
      id = byId("authenticationSecretId").value,
      duplicate = (config.authenticationSecrets || []).some(function (secret) {
        return secret.id !== id && secret.name.toLowerCase() === name.toLowerCase();
      }),
      status = byId("authenticationSecretNameStatus");
    status.textContent = duplicate ? "An Authentication Secret with this name already exists." : "";
    status.className = duplicate ? "ui tiny red basic label hint error-text" : "ui tiny basic label hint";
    return Boolean(name) && !duplicate;
  }
  function openAuthenticationSecret(definition, selectAfterSave) {
    var secret = definition ? clone(definition) : {
      id: makeId("secret"), name: "", description: "", type: "", headerName: "X-API-Key"
    };
    pendingAuthenticationSecretId = selectAfterSave ? secret.id : null;
    byId("authenticationSecretDialogTitle").textContent = definition
      ? "Edit Authentication Secret" : "Create Authentication Secret";
    byId("authenticationSecretId").value = secret.id;
    byId("authenticationSecretName").value = secret.name || "";
    byId("authenticationSecretDescription").value = secret.description || "";
    byId("authenticationSecretType").value = secret.type || "";
    byId("authenticationSecretHeaderName").value = secret.headerName || "X-API-Key";
    byId("authenticationSecretToken").value = secret.token || "";
    byId("authenticationSecretUsername").value = secret.username || "";
    byId("authenticationSecretPassword").value = secret.password || "";
    authenticationSecretNameAvailable();
    updateAuthenticationSecretFields();
    clearEditorStatus("authenticationSecretDialog");
    byId("authenticationSecretDialog").showModal();
  }
  function saveAuthenticationSecret(event) {
    event.preventDefault();
    clearEditorStatus("authenticationSecretDialog");
    if (!authenticationSecretNameAvailable()) return;
    var type = byId("authenticationSecretType").value,
      secret = {
        id: byId("authenticationSecretId").value,
        name: byId("authenticationSecretName").value.trim(),
        description: byId("authenticationSecretDescription").value.trim(),
        type: type,
        headerName: byId("authenticationSecretHeaderName").value.trim(),
        token: byId("authenticationSecretToken").value,
        username: byId("authenticationSecretUsername").value,
        password: byId("authenticationSecretPassword").value,
      };
    if (!type) return showEditorError("authenticationSecretDialog", "Select an Authentication type.", "authenticationSecretType");
    if (type === "headerStored" && (!secret.headerName || !secret.token))
      return showEditorError("authenticationSecretDialog", "Enter the Header Name and Token / Key.", !secret.headerName ? "authenticationSecretHeaderName" : "authenticationSecretToken");
    if (type === "bearerStored" && !secret.token)
      return showEditorError("authenticationSecretDialog", "Enter the Bearer Token.", "authenticationSecretToken");
    if (type === "basicStored" && (!secret.username || !secret.password))
      return showEditorError("authenticationSecretDialog", "Enter the Username and Password.", !secret.username ? "authenticationSecretUsername" : "authenticationSecretPassword");
    var next = clone(config), index = (next.authenticationSecrets || []).findIndex(function (entry) {
      return entry.id === secret.id;
    });
    next.authenticationSecrets = next.authenticationSecrets || [];
    if (index < 0) next.authenticationSecrets.push(secret);
    else next.authenticationSecrets[index] = secret;
    saveConfiguration(next, [], "authenticationSecretDialog");
  }
  function deleteAuthenticationSecret(secret) {
    var usage = (config.dataSources || []).filter(function (source) {
      return source.authSecretId === secret.id;
    });
    if (usage.length) {
      window.alert("This Authentication Secret is used by " + usage.length + " Data Source" +
        (usage.length === 1 ? ": " : "s: ") + usage.map(function (source) { return source.name; }).join(", ") + ".");
      return;
    }
    if (!window.confirm("Delete Authentication Secret “" + secret.name + "”?")) return;
    var next = clone(config);
    next.authenticationSecrets = (next.authenticationSecrets || []).filter(function (entry) {
      return entry.id !== secret.id;
    });
    saveConfiguration(next, []);
  }
  function updateDatabaseConnectionFields(forceDefaultPort) {
    var type = byId("databaseType").value,
      sqlite = type === "sqlite";
    byId("databaseConnectionStep").hidden = !type;
    byId("networkDatabaseFields").hidden = !type || sqlite;
    byId("sqliteFilenameLabel").hidden = !sqlite;
    if (sqlite) {
      byId("databasePort").value = "";
    } else if (type && (forceDefaultPort || byId("databasePort").value === "")) {
      byId("databasePort").value = type === "postgresql" ? "5432" : "3306";
    }
    databaseConnectionOk = false;
    byId("databaseConnectionStatus").className = "ui message validation-status";
    byId("databaseConnectionStatus").textContent =
      "Complete the required connection fields.";
    updateDataSourceWizard();
    scheduleDataSourceValidation();
  }
  function updateDatabaseOutputFields() {
    var mode = byId("databaseOutputMode").value;
    byId("databaseRowIndexLabel").hidden = mode !== "row" && mode !== "cell";
    byId("databaseColumnLabel").hidden = mode !== "column" && mode !== "cell";
  }
  function apiRequestComplete() {
    return Boolean(
      apiUrlValid() &&
      byId("dataSourceMethod").value,
    );
  }
  function apiUrlValid() {
    var control = byId("dataSourceUrl"),
      raw = control.value.trim(),
      valid = false;
    if (raw) {
      try {
        var candidate = raw.replace(/\{[^{}]+\}/g, "placeholder"),
          parsed = new URL(candidate);
        valid =
          (parsed.protocol === "http:" || parsed.protocol === "https:") &&
          Boolean(parsed.hostname);
      } catch (ignored) {}
    }
    control.setCustomValidity(
      raw && !valid ? "Enter a valid HTTP or HTTPS URL." : "",
    );
    control.setAttribute("aria-invalid", raw && !valid ? "true" : "false");
    return valid;
  }
  function apiConfigurationReady() {
    if (!apiRequestComplete()) return false;
    if (!requestVariablesValid()) return false;
    var selectedSecret = byId("dataSourceAuthSecret").value;
    if (selectedSecret)
      return (config.authenticationSecrets || []).some(function (secret) {
        return secret.id === selectedSecret;
      });
    if (!selectedSecret && !dataSourceHasLegacyAuthentication) return true;
    var auth = byId("dataSourceAuth").value;
    if (auth === "bearerStored") return Boolean(byId("dataSourceToken").value);
    if (auth === "headerStored")
      return Boolean(
        byId("dataSourceHeaderName").value.trim() &&
          byId("dataSourceToken").value,
      );
    if (auth === "basicStored")
      return Boolean(
        byId("dataSourceUsername").value && byId("dataSourcePassword").value,
      );
    return auth === "none";
  }
  function apiPreviewReady() {
    return apiConfigurationReady();
  }
  function databaseConnectionComplete() {
    var type = byId("databaseType").value;
    if (type === "sqlite")
      return Boolean(byId("databaseFilename").value.trim());
    return Boolean(
      type &&
      byId("databaseHost").value.trim() &&
      byId("databasePort").value &&
      byId("databaseName").value.trim() &&
      byId("databaseUsername").value.trim(),
    );
  }
  function outputComplete(type) {
    if (type === "apiQuery")
      return (
        Boolean(dataSourceLegacyResponseExpression) ||
        (dataSourceOutputs.length > 0 &&
          dataSourceOutputs.every(function (output) {
            return output.name.trim() && String(output.inputExpression || output.expression || "").trim();
          }))
      );
    if (type === "staticList")
      return staticEntries.length > 0 && byId("staticOutputName").value.trim();
    if (type === "databaseQuery")
      return (
        databasePreviewRows.length > 0 &&
        databaseConnectionOk &&
        byId("databaseQuery").value.trim() &&
        byId("databaseOutputName").value.trim()
      );
    return false;
  }
  function updateDataSourceWizard() {
    var type = byId("dataSourceType").value,
      name = byId("dataSourceName").value.trim(),
      hasName = dataSourceNameAvailable(),
      api = type === "apiQuery",
      stat = type === "staticList",
      database = type === "databaseQuery",
      requestReady = apiRequestComplete();
    byId("dataSourceIdentityStep").hidden = !type;
    var nameStatus = byId("dataSourceNameStatus");
    nameStatus.textContent = !name
      ? "Enter a unique Name to continue."
      : hasName
        ? "Name is available."
        : "A Data Source with that Name already exists.";
    nameStatus.className = "ui tiny basic label hint" + (name && !hasName ? " red error-text" : "");
    byId("dataSourceName").setCustomValidity(
      name && !hasName ? "A Data Source with that Name already exists." : "",
    );
    byId("apiSourceSteps").hidden = !(api && hasName);
    byId("staticSourceSteps").hidden = !(stat && hasName);
    byId("databaseSourceSteps").hidden = !(database && hasName);
    var testStep = byId("dataSourceTestStep");
    if (api) {
      byId("apiSourceSteps").insertBefore(testStep, byId("apiFiltersStep"));
    } else if (stat) {
      byId("staticSourceSteps").insertBefore(testStep, byId("staticOutputStep"));
    } else {
      byId("dataSourceForm").insertBefore(
        testStep,
        byId("dataSourceForm").querySelector(".dialog-actions"),
      );
    }
    if (api && hasName) {
      byId("apiAuthenticationStep").hidden = !requestReady;
      byId("apiHeadersStep").hidden = !requestReady;
      byId("apiLimitsStep").hidden = !requestReady;
      byId("apiFiltersStep").hidden = !requestReady;
      byId("apiOutputsStep").hidden = !requestReady;
      byId("dataSourceBodyLabel").hidden =
        byId("dataSourceMethod").value !== "POST";
    }
    if (stat && hasName)
      byId("staticOutputStep").hidden = !staticEntries.length;
    if (database && hasName) {
      byId("databaseConnectionStep").hidden = !byId("databaseType").value;
      byId("databaseQueryStep").hidden = !databaseConnectionOk;
      byId("databaseFilterStep").hidden = !databasePreviewRows.length;
      byId("databaseOutputStep").hidden = !databasePreviewRows.length;
    }
    var complete = outputComplete(type);
    byId("dataSourceAvailabilityStep").hidden = !complete;
    byId("dataSourceAvailabilityHeading").textContent =
      (api ? "12" : stat ? "6" : "8") + ". Availability";
    byId("dataSourceTestHeading").textContent =
      (api ? "9. Live Preview & Validation" : stat ? "4. Validation & Preview" : "10. Validation & Preview");
    byId("dataSourceTestDeviceLabel").hidden = api;
    var testReady =
      (api && apiConfigurationReady()) ||
      (stat && staticEntries.length) ||
      (database && databaseConnectionComplete());
    byId("dataSourceTestStep").hidden = !testReady;
    byId("refreshDataSourcePreviewButton").disabled = false;
  }
  function headersObject() {
    var result = {};
    dataSourceHeaders.forEach(function (header) {
      result[header.name] = header.value;
    });
    return result;
  }
  function dataSourceSnapshot() {
    var existing = (config.dataSources || []).find(function (source) {
        return source.id === byId("dataSourceId").value;
      }),
      name = byId("dataSourceName").value.trim(),
      type = byId("dataSourceType").value,
      item = {
        id: byId("dataSourceId").value,
        name: name,
        description: byId("dataSourceDescription").value.trim(),
        key:
          existing && existing.key ? existing.key : dataSourceKeyFromName(name),
        sourceType: type,
        enabled: byId("dataSourceEnabled").checked,
      };
    if (type === "apiQuery") {
      item.method = byId("dataSourceMethod").value;
      item.urlTemplate = byId("dataSourceUrl").value.trim();
      item.tlsVerify = byId("dataSourceTlsVerify").checked;
      item.bodyTemplate = byId("dataSourceBody").value;
      item.requestVariables = clone(dataSourceVariables);
      item.outputFilterExpression = dataSourceOutputFilterExpression;
      item.outputs = clone(dataSourceOutputs).map(function (output) {
        output.key = dataOutputKeyFromName(output.name);
        output.filterExpression = dataSourceOutputFilterExpression;
        output.expression = composeOutputExpression(output);
        return output;
      });
      if (!item.outputs.length && dataSourceLegacyResponseExpression)
        item.responseExpression = dataSourceLegacyResponseExpression;
      item.cacheTtlSeconds = Number(byId("dataSourceCache").value);
      item.timeoutMs = Number(byId("dataSourceTimeout").value);
      item.maxBytes = Number(byId("dataSourceMaxBytes").value);
      item.headers = headersObject();
      var selectedSecret = byId("dataSourceAuthSecret").value;
      item.authSecretId = selectedSecret || "";
      item.auth = !selectedSecret && dataSourceHasLegacyAuthentication ? {
          type: byId("dataSourceAuth").value,
          token: byId("dataSourceToken").value,
          username: byId("dataSourceUsername").value,
          password: byId("dataSourcePassword").value,
          headerName: byId("dataSourceHeaderName").value.trim(),
        } : { type: "none", token: "", username: "", password: "", headerName: "" };
    } else if (type === "staticList") {
      if (
        byId("staticEntryMode").value === "advanced" &&
        !parseAdvancedEntries()
      )
        throw new Error(
          "Advanced List entries must use one name,value pair per line.",
        );
      item.entryMode = byId("staticEntryMode").value;
      item.entries = clone(staticEntries);
      item.output = {
        name: byId("staticOutputName").value.trim(),
        key: dataOutputKeyFromName(byId("staticOutputName").value),
      };
    } else if (type === "databaseQuery") {
      item.databaseType = byId("databaseType").value;
      item.connection = {
        host: byId("databaseHost").value.trim(),
        port: Number(byId("databasePort").value),
        database: byId("databaseName").value.trim(),
        username: byId("databaseUsername").value.trim(),
        password: byId("databasePassword").value,
        filename: byId("databaseFilename").value.trim(),
        ssl: byId("databaseSsl").checked,
      };
      item.queryTemplate = byId("databaseQuery").value;
      item.filterExpression = byId("databaseFilter").value.trim();
      item.limit = Number(byId("databaseLimit").value);
      item.output = {
        name: byId("databaseOutputName").value.trim(),
        key: dataOutputKeyFromName(byId("databaseOutputName").value),
        mode: byId("databaseOutputMode").value,
        rowIndex: Number(byId("databaseRowIndex").value),
        column: byId("databaseColumn").value,
      };
    }
    return item;
  }
  function populateDataSourceTestDevices() {
    var select = byId("dataSourceTestDevice"),
      apiSelect = byId("apiDataSourceDevice");
    select.replaceChildren();
    apiSelect.replaceChildren();
    option(apiSelect, "", "None");
    inventory.nodes.forEach(function (node) {
      option(select, node.id, node.name + (node.connected ? "" : " — offline"));
      option(apiSelect, node.id, node.name + (node.connected ? "" : " — offline"));
    });
    apiSelect.value = "";
  }
  function renderDataPreview(targetId, result) {
    var target = byId(targetId);
    target.hidden = false;
    target.replaceChildren();
    var value = result;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      var keys = Object.keys(value);
      if (keys.length === 1) value = value[keys[0]];
    }
    if (
      Array.isArray(value) &&
      value.length &&
      value.every(function (row) {
        return row && typeof row === "object" && !Array.isArray(row);
      })
    ) {
      var columns = [];
      value.slice(0, 50).forEach(function (row) {
        Object.keys(row).forEach(function (key) {
          if (columns.indexOf(key) < 0) columns.push(key);
        });
      });
      var table = document.createElement("table");
      var head = document.createElement("tr");
      columns.forEach(function (column) {
        var th = document.createElement("th");
        th.textContent = column;
        head.appendChild(th);
      });
      table.appendChild(head);
      value.slice(0, 50).forEach(function (row) {
        var tr = document.createElement("tr");
        columns.forEach(function (column) {
          var td = document.createElement("td");
          td.textContent =
            typeof row[column] === "object"
              ? JSON.stringify(row[column])
              : text(row[column]);
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      target.appendChild(table);
      databasePreviewRows = value;
      var columnSelect = byId("databaseColumn");
      if (columnSelect) {
        var selected = columnSelect.value || databaseOutputColumnPending;
        columnSelect.replaceChildren();
        columns.forEach(function (column) {
          option(columnSelect, column, column);
        });
        columnSelect.value = selected;
        databaseOutputColumnPending = "";
      }
    } else {
      var pre = document.createElement("pre");
      pre.textContent =
        typeof value === "string" ? value : JSON.stringify(value, null, 2);
      target.appendChild(pre);
    }
  }
  function previewDatabaseVariable() {
    var mode = byId("databaseOutputMode").value,
      row = Math.max(0, Number(byId("databaseRowIndex").value) || 0),
      column = byId("databaseColumn").value,
      value;
    if (mode === "set") value = databasePreviewRows;
    else if (mode === "row") value = databasePreviewRows[row] || null;
    else if (mode === "column")
      value = databasePreviewRows.map(function (item) {
        return item && Object.prototype.hasOwnProperty.call(item, column)
          ? item[column]
          : null;
      });
    else
      value =
        databasePreviewRows[row] &&
        Object.prototype.hasOwnProperty.call(databasePreviewRows[row], column)
          ? databasePreviewRows[row][column]
          : null;
    renderDataPreview("databaseVariablePreview", value);
  }
  function requestDataSourcePreview(mode, manual) {
    try {
      var source = dataSourceSnapshot(),
        nodeId =
          source.sourceType === "apiQuery"
            ? byId("apiDataSourceDevice").value
            : byId("dataSourceTestDevice").value;
      if (!nodeId && source.sourceType !== "apiQuery")
        throw new Error("Select a Device.");
      if (source.sourceType === "databaseQuery" && mode === "connection") {
        source.queryTemplate = "SELECT 1 AS connection_test";
        source.output = {
          name: "Connection Test",
          key: "connection_test",
          mode: "set",
          rowIndex: 0,
          column: "",
        };
      } else if (source.sourceType === "databaseQuery" && !source.output.name) {
        source.output = {
          name: "Preview",
          key: "preview",
          mode: "set",
          rowIndex: 0,
          column: "",
        };
      }
      if (source.sourceType === "staticList" && !source.output.name)
        source.output = { name: "Preview", key: "preview" };
      dataSourcePreviewRequestId =
        "source-preview-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 7);
      var status =
        mode === "connection"
          ? byId("databaseConnectionStatus")
          : byId("dataSourceTestStatus");
      status.className = "ui info message validation-status testing";
      status.textContent =
        mode === "connection" ? "Testing connection…" : "Testing Data Source…";
      if (manual) byId("dataSourceResultPreview").hidden = true;
      command("previewDataSource", {
        requestId: dataSourcePreviewRequestId,
        nodeId: nodeId,
        previewMode: mode,
        source: source,
      });
    } catch (error) {
      var status =
        mode === "connection"
          ? byId("databaseConnectionStatus")
          : byId("dataSourceTestStatus");
      status.className = "ui negative message validation-status error";
      status.textContent = error.message;
    }
  }
  function scheduleDataSourceValidation() {
    window.clearTimeout(dataSourcePreviewTimer);
    updateDataSourceWizard();
    var type = byId("dataSourceType").value;
    if (type === "staticList") {
      if (staticEntries.length) {
        byId("dataSourceTestStatus").className = "ui positive message validation-status success";
        byId("dataSourceTestStatus").textContent =
          staticEntries.length + " List entries are valid.";
      }
      return;
    }
    var ready =
      type === "apiQuery"
        ? apiPreviewReady()
        : type === "databaseQuery" &&
          databaseConnectionComplete() &&
          (!databaseConnectionOk || byId("databaseQuery").value.trim());
    if (!ready) return;
    var signature;
    try {
      var snapshot = dataSourceSnapshot();
      if (type === "apiQuery") {
        delete snapshot.outputs;
        delete snapshot.responseExpression;
        delete snapshot.enabled;
        delete snapshot.rule;
      }
      signature =
        JSON.stringify(snapshot) +
        "|" +
        databaseConnectionOk +
        "|" +
        (type === "apiQuery"
          ? byId("apiDataSourceDevice").value
          : byId("dataSourceTestDevice").value);
    } catch (error) {
      return;
    }
    if (signature === dataSourcePreviewSignature) return;
    if (type === "apiQuery") {
      apiPreviewAvailable = false;
      apiPreviewResult = null;
      byId("dataSourceResultPreview").hidden = true;
      byId("dataSourceResultPreview").replaceChildren();
      renderDataSourceOutputs();
    }
    dataSourcePreviewTimer = window.setTimeout(function () {
      dataSourcePreviewSignature = signature;
      requestDataSourcePreview(
        type === "databaseQuery" && !databaseConnectionOk
          ? "connection"
          : "data",
        false,
      );
    }, 900);
  }
  function openDataSource(definition) {
    var item = definition
      ? clone(definition)
      : {
          id: makeId("source"),
          sourceType: "",
          name: "",
          description: "",
          enabled: false,
        };
    if (!item.sourceType) item.sourceType = "apiQuery";
    byId("dataSourceDialogTitle").textContent = definition
      ? "Edit Data Source"
      : "Create Data Source";
    byId("dataSourceId").value = item.id;
    byId("dataSourceType").value = definition ? item.sourceType : "";
    byId("dataSourceName").value = item.name || "";
    byId("dataSourceDescription").value = item.description || "";
    byId("dataSourceEnabled").checked = definition
      ? item.enabled === true
      : false;
    dataSourceVariables = clone(item.requestVariables || []).map(
      function (variable) {
        var match = /^\{api\.([a-z][a-z0-9_]*)\.([a-z][a-z0-9_]*)\}$/i.exec(
          variable.valueTemplate || "",
        );
        if (match) {
          variable.mode = "api";
          variable.sourceKey = match[1];
          variable.outputKey = match[2];
        }
        return variable;
      },
    );
    dataSourceOutputs = clone(item.outputs || []);
    var legacyOutputFilters = dataSourceOutputs
      .map(function (output) { return String(output.filterExpression || "").trim(); })
      .filter(function (filter) { return Boolean(filter); });
    dataSourceOutputFilterExpression = item.outputFilterExpression != null
      ? String(item.outputFilterExpression || "")
      : (legacyOutputFilters[0] || "");
    byId("dataSourceOutputFilter").value = dataSourceOutputFilterExpression;
    dataSourceFilterSuggestionsSignature = "";
    dataSourceOutputs.forEach(function (output) {
      output.filterExpression = dataSourceOutputFilterExpression;
    });
    dataSourceLegacyResponseExpression = dataSourceOutputs.length
      ? ""
      : String(item.responseExpression || "");
    dataSourceHeaders = Object.keys(item.headers || {}).map(function (name) {
      return { name: name, value: String(item.headers[name]) };
    });
    staticEntries = clone(item.entries || []);
    databaseConnectionOk = false;
    databasePreviewRows = [];
    databaseOutputColumnPending = (item.output && item.output.column) || "";
    dataSourcePreviewSignature = "";
    apiPreviewAvailable = false;
    apiPreviewResult = null;
    byId("dataSourcePreviewDetails").open = false;
    byId("dataSourceMethod").value = item.method || "";
    byId("dataSourceUrl").value = item.urlTemplate || "";
    byId("dataSourceTlsVerify").checked = item.tlsVerify !== false;
    byId("dataSourceBody").value = item.bodyTemplate || "";
    byId("dataSourceCache").value =
      item.cacheTtlSeconds == null ? 300 : item.cacheTtlSeconds;
    byId("dataSourceTimeout").value = item.timeoutMs || 5000;
    byId("dataSourceMaxBytes").value = item.maxBytes || 524288;
    var auth = item.auth || {};
    byId("dataSourceAuth").value = auth.type || "none";
    if (!byId("dataSourceAuth").value) byId("dataSourceAuth").value = "none";
    byId("dataSourceToken").value = auth.token || "";
    byId("dataSourceUsername").value = auth.username || "";
    byId("dataSourcePassword").value = auth.password || "";
    byId("dataSourceHeaderName").value = auth.headerName || "";
    populateDataSourceAuthenticationSecrets(item.authSecretId || "", auth);
    byId("staticEntryMode").value = item.entryMode || "friendly";
    byId("staticOutputName").value =
      item.output && item.sourceType === "staticList"
        ? item.output.name || ""
        : "";
    byId("databaseType").value = item.databaseType || "";
    var connection = item.connection || {};
    byId("databaseHost").value = connection.host || "";
    byId("databasePort").value = connection.port || "";
    byId("databaseName").value = connection.database || "";
    byId("databaseUsername").value = connection.username || "";
    byId("databasePassword").value = connection.password || "";
    byId("databaseFilename").value = connection.filename || "";
    byId("databaseSsl").checked = connection.ssl === true;
    byId("databaseQuery").value = item.queryTemplate || "";
    byId("databaseFilter").value = item.filterExpression || "";
    byId("databaseLimit").value = item.limit || 500;
    byId("databaseOutputName").value =
      item.output && item.sourceType === "databaseQuery"
        ? item.output.name || ""
        : "";
    byId("databaseOutputMode").value =
      (item.output && item.output.mode) || "set";
    byId("databaseRowIndex").value = (item.output && item.output.rowIndex) || 0;
    renderDataSourceVariables();
    renderDataSourceOutputs();
    renderDataSourceHeaders();
    renderStaticEntries();
    syncAdvancedEntries();
    var advanced = byId("staticEntryMode").value === "advanced";
    byId("staticFriendlyFields").hidden = advanced;
    byId("staticAdvancedFields").hidden = !advanced;
    updateDataSourceAuthFields();
    updateDatabaseConnectionFields();
    updateDatabaseOutputFields();
    populateDataSourceTestDevices();
    updateDataSourceWizard();
    clearEditorStatus("dataSourceDialog");
    byId("dataSourceDialog").showModal();
    scheduleDataSourceValidation();
  }
  function saveDataSource(event) {
    event.preventDefault();
    clearEditorStatus("dataSourceDialog");
    try {
      var item = dataSourceSnapshot();
      if (!item.sourceType || !item.name)
        throw new Error("Select a Type and enter a Name.");
      var duplicate = (config.dataSources || []).find(function (source) {
        return (
          source.id !== item.id &&
          (source.name.toLowerCase() === item.name.toLowerCase() ||
            source.key.toLowerCase() === item.key.toLowerCase())
        );
      });
      if (duplicate)
        throw new Error("A Data Source with that Name already exists.");
      if (!outputComplete(item.sourceType))
        throw new Error(
          "Complete the Output Variable and test the Data Source before saving.",
        );
      var next = clone(config);
      next.dataSources = next.dataSources || [];
      var index = next.dataSources.findIndex(function (source) {
        return source.id === item.id;
      });
      if (index >= 0) next.dataSources[index] = item;
      else next.dataSources.push(item);
      saveConfiguration(next, [], "dataSourceDialog");
    } catch (error) {
      showEditorError("dataSourceDialog", error.message, error.fieldId);
    }
  }
  function deleteDataSource(source) {
    var usages = dataSourceReferenceUsage(config, source);
    if (usages.length) {
      window.alert(dataSourceDeletionError(source, usages));
      return;
    }
    if (!window.confirm('Delete the Data Source "' + source.name + '"?'))
      return;
    var next = clone(config);
    next.dataSources = (next.dataSources || []).filter(function (item) {
      return item.id !== source.id;
    });
    saveConfiguration(next, []);
  }
  function dataSourceReferenceUsage(configuration, source) {
    var usages = [],
      seen = Object.create(null),
      sourceKey = String(source && source.key || "").toLowerCase(),
      outputNames = Object.create(null);
    if (!sourceKey) return usages;
    (source.outputs || []).forEach(function (output) {
      outputNames[String(output.key || "").toLowerCase()] = output.name || output.key;
    });
    if (source.output && source.output.key)
      outputNames[String(source.output.key).toLowerCase()] = source.output.name || source.output.key;
    var escapedKey = sourceKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    function add(outputKey, location) {
      outputKey = String(outputKey || "").toLowerCase();
      var reference = "api." + sourceKey + (outputKey ? "." + outputKey : ""),
        identity = reference + "|" + location;
      if (seen[identity]) return;
      seen[identity] = true;
      usages.push({
        outputName: outputNames[outputKey] || outputKey || "Data Source result",
        reference: reference,
        location: location,
      });
    }
    function scan(location, value) {
      if (typeof value !== "string" || !value) return;
      var expression = new RegExp("\\bapi\\." + escapedKey + "(?:\\.([a-z][a-z0-9_]{0,63}))?", "gi"),
        match;
      while ((match = expression.exec(value)) !== null) add(match[1] || "", location);
    }
    (configuration.dataSources || []).forEach(function (candidate) {
      if (candidate.id === source.id) return;
      var prefix = 'Data Source "' + candidate.name + '"';
      scan(prefix + " URL", candidate.urlTemplate);
      scan(prefix + " request body", candidate.bodyTemplate);
      scan(prefix + " database query", candidate.queryTemplate);
      (candidate.requestVariables || []).forEach(function (variable) {
        scan(prefix + ' Request Variable "' + variable.key + '"', variable.valueTemplate);
      });
      Object.keys(candidate.headers || {}).forEach(function (name) {
        scan(prefix + ' Header "' + name + '"', candidate.headers[name]);
      });
    });
    (configuration.properties || []).forEach(function (property) {
      var prefix = 'Property "' + property.label + '"';
      scan(prefix + " Computed Value", property.valueTemplate);
      scan(prefix + " Default Value", property.defaultTemplate);
      if (property.optionSource && String(property.optionSource.sourceKey || "").toLowerCase() === sourceKey)
        add("", prefix + " selectable-list options");
    });
    (configuration.items || []).forEach(function (item) {
      var prefix = 'Link "' + item.displayNameTemplate + '"';
      scan(prefix + " Name", item.displayNameTemplate);
      scan(prefix + " Description", item.displayDescriptionTemplate);
      scan(prefix + " Hint", item.hintTemplate);
      if (item.link) {
        scan(prefix + " URL", item.link.urlTemplate);
        scan(prefix + " fallback URL", item.link.defaultUrlTemplate);
      }
      if (item.command) {
        scan(prefix + " Command", item.command.commandTemplate);
        scan(prefix + " confirmation", item.command.confirmTemplate);
      }
    });
    (configuration.displayGroups || []).forEach(function (group) {
      scan('Link Group "' + group.name + '" Name', group.name);
      scan('Link Group "' + group.name + '" Description', group.description);
    });
    return usages;
  }
  function dataSourceDeletionError(source, usages) {
    return 'Data Source "' + source.name + '" cannot be deleted because its outputs are still in use:\n' +
      usages.map(function (usage) {
        return '- "' + usage.outputName + '" (' + usage.reference + ') — ' + usage.location;
      }).join("\n");
  }

  function insertAtCursor(control, value) {
    var start =
      typeof control.selectionStart === "number"
        ? control.selectionStart
        : control.value.length;
    var end =
      typeof control.selectionEnd === "number" ? control.selectionEnd : start;
    control.value =
      control.value.slice(0, start) + value + control.value.slice(end);
    control.focus();
    try {
      control.setSelectionRange(start + value.length, start + value.length);
    } catch (error) {}
    control.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function formulaInsertion(control, value) {
    var cursor =
        typeof control.selectionStart === "number"
          ? control.selectionStart
          : control.value.length,
      depth = 0,
      index;
    for (index = 0; index < cursor; index++) {
      if (control.value[index] === "{") depth++;
      else if (control.value[index] === "}" && depth > 0) depth--;
    }
    return depth > 0 ? value : "{" + value + "}";
  }

  function formulaContextForTarget(targetId) {
    if (/^(?:dataSource|database|static)/.test(targetId || "") || byId("dataSourceDialog").open)
      return "Data Source";
    if (/^property/.test(targetId || "") || byId("propertyDialog").open)
      return "Property";
    if (/^(?:link|command|item)/.test(targetId || "") || byId("linkDialog").open)
      return "Links";
    return "Global";
  }

  function appendFormulaVariableGroup(select, label, entries) {
    if (!entries.length) return;
    var group = document.createElement("optgroup");
    group.label = label;
    entries.forEach(function (entry) {
      option(group, entry[0], entry[2] ? entry[1] : entry[1] + " — " + entry[0]);
    });
    select.appendChild(group);
  }

  function populateFormulaLists(targetId) {
    var variable = byId("formulaVariable"),
      formulaContext = formulaContextForTarget(targetId),
      dataSourceFormulaContext = formulaContext === "Data Source",
      deviceContextAvailable = !(
        dataSourceFormulaContext &&
        byId("dataSourceType").value === "apiQuery" &&
        !byId("apiDataSourceDevice").value
      );
    variable.replaceChildren();
    appendFormulaVariableGroup(variable, "User", [
      ["user.name", "Current user name"],
      ["user.email", "Current user email"],
      ["user.id", "Current user identifier"],
    ]);
    appendFormulaVariableGroup(variable, "System", [
      ["system.serverName", "Server name"],
      ["system.dnsName", "Server DNS name"],
      ["system.serverUrl", "Server URL"],
      ["system.domain", "MeshCentral domain"],
    ]);
    appendFormulaVariableGroup(variable, "Global", [
      ["now()", "Current UTC timestamp"],
    ]);
    if (deviceContextAvailable) {
      appendFormulaVariableGroup(variable, "Device", [
        ["device.name", "Device name"],
        ["device.hostname", "Device hostname"],
        ["device.ip", "Device IP address"],
        ["device.id", "Device identifier"],
      ]);
      appendFormulaVariableGroup(variable, "Device Group", [
        ["group.name", "Device group name"],
        ["group.id", "Device group identifier"],
      ]);
    }
    if (!dataSourceFormulaContext) {
      var dataSourceVariablesForFormula = [];
      (config.dataSources || [])
        .filter(function (source) {
          return source.enabled === true;
        })
        .forEach(function (source) {
          var outputs = (source.outputs || []).slice(), seenOutputs = Object.create(null);
          if (source.output) outputs.push(source.output);
          outputs.forEach(function (output) {
            if (!output || !output.key || seenOutputs[output.key]) return;
            seenOutputs[output.key] = true;
            dataSourceVariablesForFormula.push([
              "api." + source.key + "." + output.key,
              "Data Source: " + source.name + ": " + output.name,
              true,
            ]);
          });
        });
      appendFormulaVariableGroup(variable, "Data Source", dataSourceVariablesForFormula);
    }
    if (deviceContextAvailable) {
      appendFormulaVariableGroup(
        variable,
        "Properties",
        config.properties.map(function (property) {
          return ["property." + property.key, property.label];
        }),
      );
    }
    if (
      dataSourceFormulaContext &&
      byId("dataSourceType").value === "apiQuery"
    ) {
      appendFormulaVariableGroup(
        variable,
        "Request Variables",
        dataSourceVariables
          .filter(function (requestVariable) {
            return /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(requestVariable.key || "");
          })
          .map(function (requestVariable) {
            return [requestVariable.key, requestVariable.key];
          }),
      );
    }
    var functions = byId("formulaFunction");
    functions.replaceChildren();
    var builtInFunctions = [
      ["now()", "Current UTC timestamp"],
      ["concat(value1, value2)", "Concatenate"],
      ["proper(value)", "Proper case"],
      ["upper(value)", "Uppercase"],
      ["lower(value)", "Lowercase"],
      ["trim(value)", "Trim whitespace"],
      ["len(value)", "Length"],
      ["substring(value, start, length)", "Substring"],
      ["left(value, count)", "Left characters"],
      ["right(value, count)", "Right characters"],
      ["coalesce(value1, value2)", "First available value"],
      ["replace(value, find, replacement)", "Replace text"],
      ["contains(value, search)", "Contains text"],
      ["startsWith(value, search)", "Starts with"],
      ["endsWith(value, search)", "Ends with"],
      ["split(value, separator)", "Split into list"],
      ["join(values, separator)", "Join list"],
      ["first(value)", "First item"],
      ["last(value)", "Last item"],
      ["padLeft(value, width, fill)", "Pad left"],
      ["padRight(value, width, fill)", "Pad right"],
      ["urlEncode(value)", "URL encode"],
      ["urlDecode(value)", "URL decode"],
      ["toString(value)", "Convert to text"],
      ["toNumber(value)", "Convert to number"],
      ["toBoolean(value)", "Convert to Boolean"],
      ["add(number1, number2)", "Add"],
      ["subtract(number1, number2)", "Subtract"],
      ["multiply(number1, number2)", "Multiply"],
      ["divide(number1, number2)", "Divide"],
      ["mod(number1, number2)", "Remainder"],
      ["round(number, places)", "Round"],
      ["abs(number)", "Absolute value"],
      ["min(values)", "Minimum"],
      ["max(values)", "Maximum"],
      ["sum(values)", "Total"],
      ["average(values)", "Average"],
      ["unique(values)", "Unique values"],
      ["formatDate(value, format)", "Format date"],
      ["dateAdd(value, amount, unit)", "Add to date"],
      ["dateDiff(start, end, unit)", "Date difference"],
    ];
    builtInFunctions.forEach(function (entry) {
      option(functions, entry[0], entry[1] + " — " + entry[0]);
    });
    var devices = byId("formulaPreviewDevice");
    devices.replaceChildren();
    inventory.nodes.forEach(function (node) {
      option(devices, node.id, node.name);
    });
  }

  function openFormulaComposer(targetId) {
    var target = byId(targetId);
    if (!target) return;
    formulaTargetId = targetId;
    byId("formulaDialogTitle").textContent =
      "Formula Compose (" + formulaContextForTarget(targetId) + ")";
    populateFormulaLists(targetId);
    byId("formulaText").value = target.value || "";
    setFormulaActionsEnabled(false);
    byId("formulaPreview").textContent = inventory.nodes.length
      ? "Preparing preview…"
      : "No preview device is available.";
    byId("formulaDialog").showModal();
    scheduleFormulaPreview();
  }

  function scheduleFormulaPreview() {
    if (formulaPreviewTimer) window.clearTimeout(formulaPreviewTimer);
    formulaPreviewRequestId = null;
    setFormulaActionsEnabled(false);
    formulaPreviewTimer = window.setTimeout(function () {
      var template = byId("formulaText").value;
      var nodeId = byId("formulaPreviewDevice").value;
      if (!template) {
        byId("formulaPreview").textContent = "Enter a formula to preview it.";
        byId("formulaPreview").className = "ui message preview";
        return;
      }
      try {
        validateTemplateBraces(template, "Formula", "formulaText");
        byId("formulaText").removeAttribute("aria-invalid");
      } catch (error) {
        byId("formulaText").setAttribute("aria-invalid", "true");
        byId("formulaPreview").textContent = "Unable to preview: " + error.message;
        byId("formulaPreview").className = "ui negative message preview error";
        return;
      }
      if (!nodeId) {
        byId("formulaPreview").textContent = "Select a preview device.";
        byId("formulaPreview").className = "ui negative message preview error";
        return;
      }
      formulaPreviewRequestId =
        "formula-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 8);
      byId("formulaPreview").textContent = "Calculating…";
      byId("formulaPreview").className = "ui message preview";
      command("previewFormula", {
        requestId: formulaPreviewRequestId,
        nodeId: nodeId,
        template: template,
        requestVariables:
          byId("dataSourceDialog").open &&
          byId("dataSourceType").value === "apiQuery"
            ? clone(dataSourceVariables)
            : [],
      });
    }, 250);
  }

  function setFormulaActionsEnabled(enabled) {
    formulaPreviewValid = enabled === true;
    byId("copyFormulaButton").disabled = !formulaPreviewValid;
    byId("applyFormulaButton").disabled = !formulaPreviewValid;
  }

  function closeFormulaComposer() {
    closeDialog("formulaDialog");
    formulaTargetId = null;
    if (formulaPreviewTimer) window.clearTimeout(formulaPreviewTimer);
    formulaPreviewRequestId = null;
    setFormulaActionsEnabled(false);
  }

  function utf8Base64(value) {
    var bytes = new TextEncoder().encode(value),
      binary = "";
    bytes.forEach(function (byte) {
      binary += String.fromCharCode(byte);
    });
    return window.btoa(binary);
  }

  function schemeDetails() {
    var details = {
      scheme: byId("schemeName").value.trim().toLowerCase(),
      displayName: byId("schemeDisplayName").value.trim(),
      executable: byId("schemeExecutable").value.trim(),
      arguments: byId("schemeArguments").value.trim(),
      operatingSystem: byId("schemeOperatingSystem").value,
    };
    if (!/^[a-z][a-z0-9+.-]{0,63}$/.test(details.scheme))
      throw new Error("Enter a valid URI scheme name without a colon.");
    if (details.scheme === "javascript" || details.scheme === "data")
      throw new Error(
        "Browser-executable JavaScript and data schemes cannot be registered by this tool.",
      );
    if (!details.displayName) throw new Error("Enter a display name.");
    if (!details.executable || /["\r\n]/.test(details.executable))
      throw new Error(
        "Enter an executable path without quotes or line breaks.",
      );
    if (
      !details.arguments ||
      details.arguments.indexOf(
        details.operatingSystem === "linux" ? "%u" : "%1",
      ) < 0 ||
      /[\r\n]/.test(details.arguments)
    )
      throw new Error(
        "The argument template must contain " +
          (details.operatingSystem === "linux" ? "%u" : "%1") +
          " and cannot contain line breaks.",
      );
    return details;
  }

  function isWindowsAgent(node) {
    return (
      node &&
      ((node.agentId > 0 && node.agentId < 5) ||
        (node.agentId > 41 && node.agentId < 44))
    );
  }
  function isLinuxAgent(node) {
    return (
      node &&
      node.agentId > 0 &&
      !isWindowsAgent(node) &&
      node.agentId !== 16 &&
      node.agentId !== 29
    );
  }

  function schemeOperatingSystemChanged() {
    var linux = byId("schemeOperatingSystem").value === "linux";
    byId("schemeArguments").value = linux ? "%u" : '"%1"';
    byId("schemeExecutable").placeholder = linux
      ? "/usr/bin/xdg-open"
      : "%ProgramFiles%\\PuTTY\\putty.exe";
    var target = byId("schemeTarget");
    target.replaceChildren();
    option(target, "", "Custom/unmanaged computer — download installer");
    inventory.nodes
      .filter(linux ? isLinuxAgent : isWindowsAgent)
      .forEach(function (node) {
        option(
          target,
          node.id,
          node.name +
            (node.connected ? " — connected" : " — currently offline"),
        );
      });
  }

  function openSchemeRegistration() {
    var match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(
      byId("linkUrl").value.trim(),
    );
    byId("schemeName").value = match ? match[1].toLowerCase() : "";
    byId("schemeDisplayName").value = match ? match[1] + " URL Handler" : "";
    byId("schemeOperatingSystem").value = "windows";
    byId("schemeExecutable").value = "";
    schemeOperatingSystemChanged();
    byId("schemeRegistrationStatus").textContent =
      "Select a managed device or download an installer for an unmanaged computer.";
    byId("schemeRegistrationDialog").showModal();
  }

  function registryFile(details) {
    function escape(value) {
      return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }
    var commandLine = '"' + details.executable + '" ' + details.arguments;
    return (
      "Windows Registry Editor Version 5.00\r\n\r\n" +
      "[HKEY_CURRENT_USER\\Software\\Classes\\" +
      details.scheme +
      "]\r\n" +
      '@="URL:' +
      escape(details.displayName) +
      '"\r\n"URL Protocol"=""\r\n\r\n' +
      "[HKEY_CURRENT_USER\\Software\\Classes\\" +
      details.scheme +
      "\\shell\\open\\command]\r\n" +
      '@="' +
      escape(commandLine) +
      '"\r\n'
    );
  }

  function linuxInstaller(details) {
    function shell(value) {
      return "'" + String(value).replace(/'/g, "'\\''") + "'";
    }
    var desktop =
      "[Desktop Entry]\nType=Application\nName=" +
      details.displayName.replace(/[\r\n]/g, " ") +
      "\nExec=" +
      details.executable +
      " " +
      details.arguments +
      "\nTerminal=false\nNoDisplay=true\nMimeType=x-scheme-handler/" +
      details.scheme +
      ";\n";
    var encoded = utf8Base64(desktop),
      filename = "the-tech-wizard-" + details.scheme + ".desktop";
    return (
      '#!/bin/sh\nset -eu\ndir="$HOME/.local/share/applications"\nmkdir -p "$dir"\nbackup="$HOME/.local/share/applications/the-tech-wizard-uri-backup-' +
      details.scheme +
      '-$(date +%Y%m%d%H%M%S)"\nmkdir -p "$backup"\n[ ! -f "$dir/' +
      filename +
      '" ] || cp "$dir/' +
      filename +
      '" "$backup/"\n[ ! -f "$HOME/.config/mimeapps.list" ] || cp "$HOME/.config/mimeapps.list" "$backup/"\nprintf %s ' +
      shell(encoded) +
      ' | base64 -d > "$dir/' +
      filename +
      '"\nchmod 644 "$dir/' +
      filename +
      '"\ncommand -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$dir" || true\nxdg-mime default ' +
      filename +
      " x-scheme-handler/" +
      details.scheme +
      '\nprintf "Registered ' +
      details.scheme +
      ': as %s\\n" "$(xdg-mime query default x-scheme-handler/' +
      details.scheme +
      ')"\n'
    );
  }

  function downloadSchemeRegistration() {
    try {
      var details = schemeDetails();
      var linux = details.operatingSystem === "linux";
      var blob = new Blob(
        [linux ? linuxInstaller(details) : registryFile(details)],
        { type: "application/octet-stream" },
      );
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        "register-" + details.scheme + "-uri-handler." + (linux ? "sh" : "reg");
      anchor.click();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      byId("schemeRegistrationStatus").textContent =
        "Installer downloaded. Review it before running it as the target desktop user.";
    } catch (error) {
      byId("schemeRegistrationStatus").textContent = error.message;
    }
  }

  function runSchemeRegistration(event) {
    event.preventDefault();
    try {
      var details = schemeDetails();
      var nodeId = byId("schemeTarget").value;
      if (!nodeId)
        throw new Error(
          "Select a MeshCentral-managed device. Use Download installer for an unmanaged computer.",
        );
      var node = inventory.nodes.find(function (item) {
        return item.id === nodeId;
      });
      var linux = details.operatingSystem === "linux";
      if ((linux && !isLinuxAgent(node)) || (!linux && !isWindowsAgent(node)))
        throw new Error(
          "The selected target does not match the chosen operating system.",
        );
      if (
        !window.confirm(
          "Register the " +
            details.scheme +
            ": URI scheme for the signed-in " +
            (linux ? "Linux desktop" : "Windows") +
            " user on " +
            node.name +
            "?\n\nHandler: " +
            details.executable +
            "\nArguments: " +
            details.arguments,
        )
      )
        return;
      var payload = utf8Base64(JSON.stringify(details));
      var script = linux
        ? linuxInstaller(details)
        : "$ErrorActionPreference='Stop';$p=ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('" +
          payload +
          "')));$base='HKCU:\\Software\\Classes\\'+$p.scheme;New-Item -Path $base -Force|Out-Null;Set-Item -LiteralPath $base -Value ('URL:'+$p.displayName);New-ItemProperty -LiteralPath $base -Name 'URL Protocol' -Value '' -PropertyType String -Force|Out-Null;$commandKey=$base+'\\shell\\open\\command';New-Item -Path $commandKey -Force|Out-Null;$command='\"'+$p.executable+'\" '+$p.arguments;Set-Item -LiteralPath $commandKey -Value $command;Write-Output ('Registered '+$p.scheme+':');";
      window.parent.meshserver.send({
        action: "runcommands",
        nodeids: [nodeId],
        type: linux ? 3 : 2,
        cmds: script,
        runAsUser: 2,
        reply: false,
        responseid: "devicepropertieslinks-" + Date.now().toString(36),
      });
      byId("schemeRegistrationStatus").textContent =
        "Registration command submitted through MeshCentral. The core event log records the command; the target must have a signed-in user and Remote Commands permission.";
    } catch (error) {
      byId("schemeRegistrationStatus").textContent = error.message;
    }
  }

  function saveConfiguration(next, purgeKeys, closeOnSuccess) {
    if (busy) return;
    setBusy(true);
    clearStatus();
    saveRequestId =
      "save-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 8);
    window.__dplCloseOnSave = closeOnSuccess || null;
    command("saveAdminConfig", {
      requestId: saveRequestId,
      expectedRevision: config.revision,
      config: next,
      purgeKeys: purgeKeys || [],
    });
  }

  function addDisplayGroup() {
    openDisplayGroup(null);
  }

  function exportConfiguration() {
    var output = {
      schemaVersion: 3,
      properties: config.properties,
      displayGroups: config.displayGroups || [],
      items: config.items || [],
      dataSources: config.dataSources || [],
      authenticationSecrets: config.authenticationSecrets || [],
    };
    var blob = new Blob([JSON.stringify(output, null, 2) + "\n"], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "links-properties.json";
    anchor.click();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }
  function importConfiguration(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (
          !parsed ||
          !Array.isArray(parsed.properties) ||
          !Array.isArray(parsed.links)
        )
          throw new Error(
            "The JSON file does not contain properties and links arrays.",
          );
        if (
          !window.confirm(
            "Replace the current definitions with the imported configuration?",
          )
        )
          return;
        var next = clone(config);
        next.properties = parsed.properties;
        next.links = parsed.links;
        next.dataSources = Array.isArray(parsed.dataSources)
          ? parsed.dataSources
          : [];
        next.authenticationSecrets = Array.isArray(parsed.authenticationSecrets)
          ? parsed.authenticationSecrets
          : [];
        saveConfiguration(next, []);
      } catch (error) {
        showStatus(false, error.message);
      }
    };
    reader.onerror = function () {
      showStatus(false, "The selected file could not be read.");
    };
    reader.readAsText(file);
  }

  window.DevicePropertiesLinksAdmin = {
    receiveData: function (nextConfig, nextInventory, nextPermissions, nextPresets) {
      config = nextConfig || {
        revision: 0,
        properties: [],
        links: [],
        displayGroups: [],
        items: [],
        dataSources: [],
        authenticationSecrets: [],
      };
      config.dataSources = config.dataSources || [];
      config.authenticationSecrets = config.authenticationSecrets || [];
      config.items = config.items || [];
      config.displayGroups = config.displayGroups || [];
      inventory = nextInventory || {
        groups: [],
        nodes: [],
        tags: [],
        users: [],
        userGroups: [],
      };
      inventory.users = inventory.users || [];
      inventory.userGroups = inventory.userGroups || [];
      permissions = nextPermissions || {
        manageDefinitions: false,
        manageDataSources: false,
      };
      populatePropertyPresets(nextPresets);
      byId("propertyDefinitionsPanel").hidden = !permissions.manageDefinitions;
      byId("linkGroupsPanel").hidden = !permissions.manageDefinitions;
      byId("linksPanel").hidden = !permissions.manageDefinitions;
      byId("dataSourcesPanel").hidden = !permissions.manageDataSources;
      byId("authenticationSecretsPanel").hidden = !permissions.manageDataSources;
      byId("exportButton").hidden = !(
        permissions.manageDefinitions && permissions.manageDataSources
      );
      byId("importButton").hidden = !(
        permissions.manageDefinitions && permissions.manageDataSources
      );
      renderLists();
      setBusy(false);
    },
    receiveResult: function (success, message, requestId, savedConfig) {
      if (requestId && saveRequestId && requestId !== saveRequestId) return;
      var saveDialogId = window.__dplCloseOnSave,
        inlineHandled = false;
      if (!success && saveDialogId)
        inlineHandled = showEditorError(saveDialogId, message);
      if (success || !inlineHandled) showStatus(success, message);
      setBusy(false);
      if (success && savedConfig) {
        config = savedConfig;
        config.authenticationSecrets = config.authenticationSecrets || [];
        renderLists();
        if (byId("dataSourceDialog").open) {
          populateDataSourceAuthenticationSecrets(
            pendingAuthenticationSecretId || byId("dataSourceAuthSecret").value,
            null,
          );
          updateDataSourceAuthFields();
          scheduleDataSourceValidation();
        }
        pendingAuthenticationSecretId = null;
        if (window.__dplCloseOnSave) closeDialog(window.__dplCloseOnSave);
        window.__dplCloseOnSave = null;
        saveRequestId = null;
      } else if (!success) {
        window.__dplCloseOnSave = null;
        saveRequestId = null;
      }
    },
    receiveFormulaPreview: function (message) {
      if (!message || message.requestId !== formulaPreviewRequestId) return;
      var preview = byId("formulaPreview"),
        output = message.success ? String(message.result == null ? "" : message.result) : "",
        usable = message.success === true && output.trim().length > 0;
      setFormulaActionsEnabled(usable);
      preview.textContent = usable
        ? output
        : message.success
          ? "Formula is valid but produced no output."
          : "Unable to preview: " + String(message.message || "Unknown error");
      preview.className = "ui message preview" + (usable ? " positive" : " negative error");
    },
    receiveDataSourcePreview: function (message) {
      if (
        message &&
        message.previewMode === "certificate" &&
        message.requestId === certificatePreviewRequestId
      ) {
        var certificateStatus = byId("tlsCertificateStatus");
        certificateStatus.className =
          "ui message validation-status " + (message.success ? "positive success" : "negative error");
        certificateStatus.textContent = String(
          message.message ||
            (message.success
              ? "Certificate retrieved."
              : "Certificate inspection failed."),
        );
        byId("tlsCertificateDetails").hidden = !message.success;
        if (message.success)
          renderDataPreview("tlsCertificateDetails", message.result);
        return;
      }
      if (!message || message.requestId !== dataSourcePreviewRequestId) return;
      var connection = message.previewMode === "connection",
        status = connection
          ? byId("databaseConnectionStatus")
          : byId("dataSourceTestStatus");
      status.className =
        "ui message validation-status " + (message.success ? "positive success" : "negative error");
      status.textContent = String(
        message.message ||
          (message.success ? "Test succeeded." : "Test failed."),
      );
      if (connection) {
        databaseConnectionOk = Boolean(message.success);
        databasePreviewRows = [];
        updateDataSourceWizard();
        if (message.success && byId("databaseQuery").value.trim())
          scheduleDataSourceValidation();
        return;
      }
      if (message.success) {
        renderDataPreview("dataSourceResultPreview", message.result);
        if (byId("dataSourceType").value === "apiQuery") {
          apiPreviewAvailable = true;
          apiPreviewResult = message.result;
          renderDataSourceOutputs();
        }
        if (byId("dataSourceType").value === "databaseQuery") {
          var result = message.result;
          if (result && typeof result === "object" && !Array.isArray(result)) {
            var keys = Object.keys(result);
            if (keys.length === 1) result = result[keys[0]];
          }
          databasePreviewRows = Array.isArray(result) ? result : [];
          renderDataPreview("databaseQueryPreview", databasePreviewRows);
          byId("databaseFilterStep").hidden = false;
          byId("databaseOutputStep").hidden = false;
          updateDataSourceWizard();
        }
      } else if (byId("dataSourceType").value === "apiQuery") {
        apiPreviewAvailable = false;
        apiPreviewResult = null;
        renderDataSourceOutputs();
      }
    },
  };

  byId("refreshButton").onclick = requestData;
  byId("exportButton").onclick = exportConfiguration;
  byId("importButton").onclick = function () {
    byId("importFile").click();
  };
  byId("importFile").onchange = importConfiguration;
  byId("addPropertyButton").onclick = function () {
    openProperty(null);
  };
  byId("addLinkButton").onclick = function () {
    openLink(null);
  };
  byId("addDisplayGroupButton").onclick = addDisplayGroup;
  byId("addDataSourceButton").onclick = function () {
    openDataSource(null);
  };
  byId("addAuthenticationSecretButton").onclick = function () {
    openAuthenticationSecret(null, false);
  };
  byId("createAuthenticationSecretFromDataSourceButton").onclick = function () {
    openAuthenticationSecret(null, true);
  };
  function closeDialog(id) {
    var dialog = byId(id);
    if (dialog && dialog.open) dialog.close("cancel");
  }
  function enforceFourDigitInteger(id, min) {
    var control = byId(id);
    control.onkeydown = function (event) {
      if (["e", "E", "+", "-", "."].indexOf(event.key) >= 0)
        event.preventDefault();
    };
    control.oninput = function () {
      var digits = String(control.value || "")
        .replace(/\D/g, "")
        .slice(0, 4);
      control.value = digits;
    };
    control.onblur = function () {
      if (control.value === "") return;
      var value = Math.max(
        min,
        Math.min(9999, Math.trunc(Number(control.value) || min)),
      );
      control.value = String(value);
    };
  }
  enforceFourDigitInteger("propertyOrder", 0);
  enforceFourDigitInteger("linkRow", 1);
  enforceFourDigitInteger("linkOrder", 1);
  byId("propertyMode").onchange = updatePropertyWizard;
  byId("propertyLabel").oninput = updatePropertyWizard;
  byId("propertyType").onchange = propertyTypeChanged;
  byId("linkKind").onchange = linkKindChanged;
  byId("linkName").oninput = updateLinkWizard;
  byId("linkEnabled").onchange = updateLinkWizard;
  byId("linkDisplayGroup").onchange = function () {
    if (
      byId("linkDisplayGroup").value &&
      byId("linkDialog").dataset.newItem === "true"
    ) {
      byId("itemRuleMode").value = "inherit";
      byId("linkDialog").dataset.newItem = "false";
    }
    itemRuleModeChanged();
  };
  byId("itemRuleMode").onchange = itemRuleModeChanged;
  byId("itemUseGroupColor").onchange = updateLinkColourVisibility;
  byId("validationPreset").onchange = function () {
    validationPresetChanged(true);
  };
  byId("inputMaskPreset").onchange = function () {
    inputMaskPresetChanged(true);
  };
  byId("validationEnabled").onchange = optionalPropertySectionsChanged;
  byId("inputMaskEnabled").onchange = optionalPropertySectionsChanged;
  byId("propertyEnabled").onchange = updatePropertyWizard;
  byId("propertyEnabledReadonly").onchange = updatePropertyWizard;
  byId("propertyForm").onsubmit = saveProperty;
  byId("displayGroupForm").onsubmit = saveDisplayGroup;
  byId("linkForm").onsubmit = saveLink;
  byId("cancelDisplayGroupButton").onclick = function () {
    closeDialog("displayGroupDialog");
  };
  byId("closeDisplayGroupButton").onclick = function () {
    closeDialog("displayGroupDialog");
  };
  byId("dataSourceForm").onsubmit = saveDataSource;
  byId("dataSourceType").onchange = function () {
    databaseConnectionOk = false;
    databasePreviewRows = [];
    updateDataSourceWizard();
    scheduleDataSourceValidation();
  };
  byId("dataSourceName").oninput = function () {
    updateDataSourceWizard();
    scheduleDataSourceValidation();
  };
  byId("dataSourceEnabled").onchange = updateDataSourceWizard;
  byId("dataSourceAuthSecret").onchange = function () {
    updateDataSourceAuthFields();
    scheduleDataSourceValidation();
  };
  byId("authenticationSecretForm").onsubmit = saveAuthenticationSecret;
  byId("authenticationSecretName").oninput = authenticationSecretNameAvailable;
  byId("authenticationSecretType").onchange = updateAuthenticationSecretFields;
  byId("closeAuthenticationSecretButton").onclick = function () {
    pendingAuthenticationSecretId = null;
    closeDialog("authenticationSecretDialog");
  };
  byId("cancelAuthenticationSecretButton").onclick = function () {
    pendingAuthenticationSecretId = null;
    closeDialog("authenticationSecretDialog");
  };
  byId("dataSourceMethod").onchange = scheduleDataSourceValidation;
  [
    "dataSourceUrl",
    "dataSourceBody",
    "dataSourceToken",
    "dataSourceUsername",
    "dataSourcePassword",
    "dataSourceHeaderName",
    "dataSourceCache",
    "dataSourceTimeout",
    "dataSourceMaxBytes",
  ].forEach(function (id) {
    byId(id).oninput = scheduleDataSourceValidation;
  });
  byId("dataSourceTlsVerify").onchange = scheduleDataSourceValidation;
  byId("viewTlsCertificateButton").onclick = function () {
    var url = byId("dataSourceUrl").value.trim(),
      status = byId("tlsCertificateStatus");
    byId("tlsCertificateDetails").hidden = true;
    byId("tlsCertificateDetails").replaceChildren();
    byId("tlsCertificateDialog").showModal();
    if (!url) {
      status.className = "ui negative message validation-status error";
      status.textContent = "Enter an HTTPS URL before viewing its certificate.";
      return;
    }
    certificatePreviewRequestId =
      "certificate-preview-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 7);
    status.className = "ui info message validation-status testing";
    status.textContent = "Retrieving the TLS certificate…";
    command("inspectDataSourceCertificate", {
      requestId: certificatePreviewRequestId,
      url: url,
    });
  };
  byId("closeTlsCertificateButton").onclick = function () {
    closeDialog("tlsCertificateDialog");
  };
  byId("dismissTlsCertificateButton").onclick = function () {
    closeDialog("tlsCertificateDialog");
  };
  byId("addDataSourceVariableButton").onclick = function () {
    dataSourceVariables.push({ key: "", valueTemplate: "", mode: "manual" });
    renderDataSourceVariables();
  };
  byId("addDataSourceApiVariableButton").onclick = function () {
    dataSourceVariables.push({
      key: "",
      valueTemplate: "",
      mode: "api",
      sourceKey: "",
      outputKey: "",
    });
    renderDataSourceVariables();
  };
  byId("addDataSourceOutputButton").onclick = function () {
    dataSourceOutputs.push({ name: "", key: "", inputExpression: "", filterExpression: "", outputExpression: "", expression: "" });
    renderDataSourceOutputs();
    updateDataSourceWizard();
  };
  byId("addDataSourceHeaderButton").onclick = function () {
    var name = byId("dataSourceHeaderNewName").value.trim(),
      value = byId("dataSourceHeaderNewValue").value.trim();
    if (!name || !value) {
      window.alert("Enter a Header and Value.");
      return;
    }
    if (
      dataSourceHeaders.some(function (header) {
        return header.name.toLowerCase() === name.toLowerCase();
      })
    ) {
      window.alert("That Header already exists.");
      return;
    }
    dataSourceHeaders.push({ name: name, value: value });
    byId("dataSourceHeaderNewName").value = "";
    byId("dataSourceHeaderNewValue").value = "";
    renderDataSourceHeaders();
    scheduleDataSourceValidation();
  };
  byId("staticEntryMode").onchange = function () {
    var advanced = byId("staticEntryMode").value === "advanced";
    if (advanced) syncAdvancedEntries();
    else parseAdvancedEntries();
    byId("staticFriendlyFields").hidden = advanced;
    byId("staticAdvancedFields").hidden = !advanced;
    updateDataSourceWizard();
  };
  byId("staticAdvancedEntries").oninput = function () {
    if (parseAdvancedEntries()) updateDataSourceWizard();
  };
  byId("addStaticEntryButton").onclick = function () {
    var name = byId("staticEntryName").value.trim(),
      value = byId("staticEntryValue").value.trim();
    if (!name || !value) {
      window.alert("Enter a Name and Value.");
      return;
    }
    staticEntries.push({ name: name, value: value });
    byId("staticEntryName").value = "";
    byId("staticEntryValue").value = "";
    renderStaticEntries();
    syncAdvancedEntries();
    updateDataSourceWizard();
  };
  byId("staticOutputName").oninput = updateDataSourceWizard;
  byId("databaseType").onchange = function () {
    updateDatabaseConnectionFields(true);
  };
  [
    "databaseHost",
    "databasePort",
    "databaseName",
    "databaseUsername",
    "databasePassword",
    "databaseFilename",
    "databaseSsl",
  ].forEach(function (id) {
    byId(id).oninput = function () {
      databaseConnectionOk = false;
      databasePreviewRows = [];
      scheduleDataSourceValidation();
    };
    byId(id).onchange = byId(id).oninput;
  });
  byId("retryDatabaseConnectionButton").onclick = function () {
    dataSourcePreviewSignature = "";
    requestDataSourcePreview("connection", true);
  };
  byId("databaseQuery").oninput = function () {
    databasePreviewRows = [];
    scheduleDataSourceValidation();
  };
  byId("previewDatabaseQueryButton").onclick = function () {
    dataSourcePreviewSignature = "";
    requestDataSourcePreview("data", true);
  };
  byId("databaseFilter").oninput = function () {
    databasePreviewRows = [];
  };
  byId("databaseOutputMode").onchange = function () {
    updateDatabaseOutputFields();
    previewDatabaseVariable();
  };
  byId("databaseRowIndex").oninput = previewDatabaseVariable;
  byId("databaseColumn").onchange = previewDatabaseVariable;
  byId("databaseOutputName").oninput = updateDataSourceWizard;
  byId("previewDatabaseVariableButton").onclick = previewDatabaseVariable;
  byId("refreshDataSourcePreviewButton").onclick = function () {
    dataSourcePreviewSignature = "";
    requestDataSourcePreview("data", true);
  };
  byId("dataSourceTestDevice").onchange = function () {
    dataSourcePreviewSignature = "";
    scheduleDataSourceValidation();
  };
  byId("apiDataSourceDevice").onchange = function () {
    dataSourcePreviewSignature = "";
    apiPreviewAvailable = false;
    apiPreviewResult = null;
    byId("dataSourceResultPreview").hidden = true;
    byId("dataSourceResultPreview").replaceChildren();
    byId("dataSourcePreviewDetails").open = false;
    renderDataSourceOutputs();
    scheduleDataSourceValidation();
  };
  document.querySelectorAll("[data-secret-target]").forEach(function (button) {
    button.onclick = function () {
      var input = byId(button.dataset.secretTarget),
        secretName = /Password$/.test(button.dataset.secretTarget)
          ? "password"
          : "token or key",
        showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.setAttribute("aria-pressed", showing ? "false" : "true");
      button.setAttribute(
        "aria-label",
        (showing ? "Show " : "Hide ") + secretName,
      );
    };
  });
  byId("cancelDataSourceButton").onclick = function () {
    closeDialog("dataSourceDialog");
  };
  byId("closeDataSourceButton").onclick = function () {
    closeDialog("dataSourceDialog");
  };
  byId("cancelPropertyButton").onclick = function () {
    closeDialog("propertyDialog");
  };
  byId("closePropertyButton").onclick = function () {
    closeDialog("propertyDialog");
  };
  byId("cancelLinkButton").onclick = function () {
    closeDialog("linkDialog");
  };
  byId("closeLinkButton").onclick = function () {
    closeDialog("linkDialog");
  };
  document.querySelectorAll("[data-formula-target]").forEach(function (button) {
    button.onclick = function () {
      openFormulaComposer(button.dataset.formulaTarget);
    };
  });
  byId("formulaText").oninput = scheduleFormulaPreview;
  byId("formulaPreviewDevice").onchange = scheduleFormulaPreview;
  byId("insertVariableButton").onclick = function () {
    var control = byId("formulaText");
    insertAtCursor(
      control,
      formulaInsertion(control, byId("formulaVariable").value),
    );
    scheduleFormulaPreview();
  };
  byId("insertFunctionButton").onclick = function () {
    var control = byId("formulaText");
    insertAtCursor(
      control,
      formulaInsertion(control, byId("formulaFunction").value),
    );
    scheduleFormulaPreview();
  };
  byId("insertTextButton").onclick = function () {
    insertAtCursor(byId("formulaText"), '"text"');
    scheduleFormulaPreview();
  };
  byId("applyFormulaButton").onclick = function () {
    if (!formulaPreviewValid) return;
    var target = byId(formulaTargetId);
    if (target) {
      target.value = byId("formulaText").value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
    closeFormulaComposer();
  };
  byId("copyFormulaButton").onclick = function () {
    if (!formulaPreviewValid) return;
    var value = byId("formulaText").value;
    if (navigator.clipboard && navigator.clipboard.writeText)
      navigator.clipboard.writeText(value);
    else {
      byId("formulaText").select();
      document.execCommand("copy");
    }
    byId("formulaPreview").textContent = "Copied to clipboard.";
  };
  byId("cancelFormulaButton").onclick = closeFormulaComposer;
  byId("closeFormulaButton").onclick = closeFormulaComposer;
  byId("openSchemeRegistrationButton").onclick = openSchemeRegistration;
  byId("schemeRegistrationForm").onsubmit = runSchemeRegistration;
  byId("schemeOperatingSystem").onchange = schemeOperatingSystemChanged;
  byId("downloadSchemeRegistrationButton").onclick = downloadSchemeRegistration;
  byId("cancelSchemeRegistrationButton").onclick = function () {
    closeDialog("schemeRegistrationDialog");
  };
  byId("closeSchemeRegistrationButton").onclick = function () {
    closeDialog("schemeRegistrationDialog");
  };
  populateUriSchemes();
  semanticizeAdminControls(document);
  new MutationObserver(function (mutations) {
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType === 1) {
          semanticizeAdminControls(node);
          if (node.tagName === "OPTION" && node.parentElement && node.parentElement.tagName === "SELECT") initializeSemanticSelect(node.parentElement, true);
        }
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  requestData();
})();
