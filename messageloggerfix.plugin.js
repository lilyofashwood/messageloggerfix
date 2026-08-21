/**
 * @name MessageLoggerFix
 * @author lilyofashwood
 * @description Locally records message edits and deletions after explicit opt-in.
 * @version 1.0.0
 * @license MIT
 */

"use strict";

const PLUGIN_ID = "MessageLoggerFix";
const STORAGE_KEY = "localLog";
const STYLE_ID = "message-logger-fix";
const SCHEMA_VERSION = 1;
const CONTENT_LIMIT = 20000;
const SAVE_DELAY_MS = 750;
const STORAGE_BYTE_LIMIT = 4 * 1024 * 1024;
const EVENT_TYPES = ["MESSAGE_CREATE", "MESSAGE_UPDATE", "MESSAGE_DELETE", "MESSAGE_DELETE_BULK"];

const DEFAULT_SETTINGS = Object.freeze({
    captureEnabled: false,
    consentVersion: 0,
    maxEvents: 1000,
    maxAgeDays: 30,
    skin: "original"
});

const SKINS = Object.freeze({
    original: "original",
    "black-heart": "black heart",
    crimson: "crimson",
    "ghost-terminal": "ghost terminal"
});

const CSS = `
.mlf-root {
    --mlf-bg: #1e1f22;
    --mlf-panel: #2b2d31;
    --mlf-card: #313338;
    --mlf-text: #f2f3f5;
    --mlf-muted: #b5bac1;
    --mlf-border: #3f4147;
    --mlf-accent: #5865f2;
    --mlf-danger: #da373c;
    --mlf-success: #23a55a;
    color: var(--mlf-text);
    color-scheme: dark;
    font-family: var(--font-primary, system-ui, sans-serif);
}
.mlf-root[data-mlf-skin="black-heart"] {
    --mlf-bg: #050506;
    --mlf-panel: #0d0d10;
    --mlf-card: #15151a;
    --mlf-text: #f8f5fa;
    --mlf-muted: #aaa2b0;
    --mlf-border: #332a38;
    --mlf-accent: #cf7dff;
    --mlf-danger: #ff4d75;
    --mlf-success: #72d6a0;
}
.mlf-root[data-mlf-skin="crimson"] {
    --mlf-bg: #17090d;
    --mlf-panel: #250d14;
    --mlf-card: #32121b;
    --mlf-text: #fff2f4;
    --mlf-muted: #d2a9b0;
    --mlf-border: #642438;
    --mlf-accent: #ed3b64;
    --mlf-danger: #ff244f;
    --mlf-success: #62cf91;
}
.mlf-root[data-mlf-skin="ghost-terminal"] {
    --mlf-bg: #04100d;
    --mlf-panel: #071a15;
    --mlf-card: #0b241c;
    --mlf-text: #bdffd7;
    --mlf-muted: #72b88d;
    --mlf-border: #17643b;
    --mlf-accent: #35e879;
    --mlf-danger: #ff5f72;
    --mlf-success: #35e879;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.mlf-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgb(0 0 0 / 72%);
}
.mlf-dialog {
    width: min(880px, 96vw);
    max-height: min(760px, 92vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--mlf-border);
    border-radius: 12px;
    background: var(--mlf-panel);
    box-shadow: 0 20px 70px rgb(0 0 0 / 55%);
}
.mlf-header, .mlf-footer, .mlf-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
}
.mlf-header { justify-content: space-between; border-bottom: 1px solid var(--mlf-border); }
.mlf-header h2, .mlf-settings h3, .mlf-settings h4 { margin: 0; color: var(--mlf-text); }
.mlf-body { overflow: auto; padding: 16px; background: var(--mlf-bg); }
.mlf-footer { justify-content: flex-end; border-top: 1px solid var(--mlf-border); }
.mlf-toolbar { flex-wrap: wrap; padding: 0 0 14px; }
.mlf-input, .mlf-select, .mlf-number {
    min-height: 36px;
    box-sizing: border-box;
    border: 1px solid var(--mlf-border);
    border-radius: 6px;
    padding: 7px 10px;
    background: var(--mlf-card);
    color: var(--mlf-text);
}
.mlf-input { flex: 1 1 260px; }
.mlf-number { width: 110px; }
.mlf-button {
    min-height: 34px;
    border: 0;
    border-radius: 6px;
    padding: 7px 12px;
    background: var(--mlf-accent);
    color: #fff;
    font-weight: 650;
    cursor: pointer;
}
.mlf-button:hover { filter: brightness(1.09); }
.mlf-button:focus-visible, .mlf-input:focus-visible, .mlf-select:focus-visible, .mlf-number:focus-visible {
    outline: 2px solid var(--mlf-accent);
    outline-offset: 2px;
}
.mlf-button-secondary { background: var(--mlf-card); color: var(--mlf-text); border: 1px solid var(--mlf-border); }
.mlf-button-danger { background: var(--mlf-danger); }
.mlf-close { width: 34px; padding: 0; font-size: 20px; }
.mlf-copy { margin: 0 0 12px; color: var(--mlf-muted); line-height: 1.5; }
.mlf-warning { border-left: 4px solid var(--mlf-danger); padding: 10px 12px; background: var(--mlf-card); color: var(--mlf-text); }
.mlf-stats { margin: 0 0 12px; color: var(--mlf-muted); font-size: 13px; }
.mlf-list { display: grid; gap: 10px; }
.mlf-card {
    border: 1px solid var(--mlf-border);
    border-left: 4px solid var(--mlf-accent);
    border-radius: 8px;
    padding: 12px;
    background: var(--mlf-card);
}
.mlf-card[data-kind="delete"] { border-left-color: var(--mlf-danger); }
.mlf-card[data-ghost="true"] { box-shadow: inset 0 0 0 1px var(--mlf-danger); }
.mlf-card-title { margin: 0 0 5px; font-weight: 750; }
.mlf-card-meta { margin: 0 0 10px; color: var(--mlf-muted); font-size: 12px; overflow-wrap: anywhere; }
.mlf-label { margin: 8px 0 3px; color: var(--mlf-muted); font-size: 12px; font-weight: 700; text-transform: uppercase; }
.mlf-content { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--mlf-text); }
.mlf-empty { padding: 34px 12px; text-align: center; color: var(--mlf-muted); }
.mlf-settings {
    box-sizing: border-box;
    border: 1px solid var(--mlf-border);
    border-radius: 10px;
    padding: 18px;
    background: var(--mlf-panel);
}
.mlf-settings-intro { margin: 8px 0 18px; color: var(--mlf-muted); line-height: 1.45; }
.mlf-setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: 13px 0;
    border-top: 1px solid var(--mlf-border);
}
.mlf-setting-copy { min-width: 0; }
.mlf-setting-name { margin: 0 0 3px; font-weight: 700; color: var(--mlf-text); }
.mlf-setting-note { margin: 0; color: var(--mlf-muted); font-size: 13px; line-height: 1.35; }
.mlf-actions { display: flex; flex-wrap: wrap; gap: 9px; padding-top: 16px; border-top: 1px solid var(--mlf-border); }
.mlf-checkbox { width: 20px; height: 20px; accent-color: var(--mlf-accent); }
`;

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function idValue(value) {
    if (typeof value === "string") return value.slice(0, 128);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "bigint") return String(value);
    return "";
}

function clippedString(value, limit = CONTENT_LIMIT) {
    return typeof value === "string" ? value.slice(0, limit) : "";
}

function boundedInteger(value, fallback, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

function utf8ByteLength(value) {
    let bytes = 0;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code < 0x80) bytes += 1;
        else if (code < 0x800) bytes += 2;
        else if (code >= 0xd800 && code <= 0xdbff
            && index + 1 < value.length
            && value.charCodeAt(index + 1) >= 0xdc00
            && value.charCodeAt(index + 1) <= 0xdfff) {
            bytes += 4;
            index += 1;
        }
        else bytes += 3;
    }
    return bytes;
}

function serializedByteLength(value) {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? utf8ByteLength(serialized) : 0;
}

module.exports = class MessageLoggerFix {
    constructor() {
        this.api = new BdApi(PLUGIN_ID);
        this.settings = {...DEFAULT_SETTINGS};
        this.events = [];
        this.cache = new Map();
        this.dispatcher = null;
        this.captureFailure = "";
        this.userStore = null;
        this.userStoreLookupAttempted = false;
        this.subscriptions = [];
        this.uiRoots = new Map();
        this.objectUrls = new Set();
        this.revokeTimers = new Set();
        this.logModal = null;
        this.renderLogModal = null;
        this.saveTimer = null;
        this.onboardingTimer = null;
        this.dirty = false;
        this.started = false;
        this.sequence = 0;
        this.handlers = {
            MESSAGE_CREATE: action => this.handleCreate(action),
            MESSAGE_UPDATE: action => this.handleUpdate(action),
            MESSAGE_DELETE: action => this.handleSingleDelete(action),
            MESSAGE_DELETE_BULK: action => this.handleBulkDelete(action)
        };
    }

    start() {
        if (this.started) return;
        this.started = true;
        this.loadLocalData();
        this.api.DOM.addStyle(STYLE_ID, CSS);
        this.dispatcher = null;
        this.captureFailure = "";
        this.userStore = null;
        this.userStoreLookupAttempted = false;
        this.findUserStore();

        let localDataPruned = this.pruneRetention();
        if (this.pruneStorageByteBudget().pruned) localDataPruned = true;
        if (localDataPruned) this.scheduleSave();
        if (this.settings.captureEnabled && this.settings.consentVersion >= SCHEMA_VERSION) {
            this.subscribeCapture();
        }

        if (this.settings.consentVersion < SCHEMA_VERSION) {
            this.onboardingTimer = setTimeout(() => {
                this.onboardingTimer = null;
                if (this.started) this.openFirstRunWarning();
            }, 0);
        }
    }

    stop() {
        if (!this.started) return;
        this.started = false;
        if (this.onboardingTimer !== null) clearTimeout(this.onboardingTimer);
        this.onboardingTimer = null;
        this.unsubscribeCapture();
        this.dispatcher = null;

        if (this.saveTimer !== null) clearTimeout(this.saveTimer);
        this.saveTimer = null;
        if (this.dirty) this.persistNow();

        for (const timer of this.revokeTimers) clearTimeout(timer);
        this.revokeTimers.clear();
        for (const url of this.objectUrls) URL.revokeObjectURL(url);
        this.objectUrls.clear();

        for (const root of [...this.uiRoots.keys()]) this.destroyRoot(root);
        this.logModal = null;
        this.renderLogModal = null;
        this.userStore = null;
        this.api.DOM.removeStyle(STYLE_ID);
    }

    loadLocalData() {
        this.settings = {...DEFAULT_SETTINGS};
        this.events = [];
        this.cache.clear();
        let storedSettings;
        let storedState;
        try {
            storedSettings = this.api.Data.load("settings");
            storedState = this.api.Data.load(STORAGE_KEY);
        }
        catch (error) {
            this.logError("Could not load local data", error);
        }

        if (storedSettings && typeof storedSettings === "object" && !Array.isArray(storedSettings)) {
            this.settings = {
                captureEnabled: storedSettings.captureEnabled === true,
                consentVersion: boundedInteger(storedSettings.consentVersion, 0, 0, SCHEMA_VERSION),
                maxEvents: boundedInteger(storedSettings.maxEvents, DEFAULT_SETTINGS.maxEvents, 25, 10000),
                maxAgeDays: boundedInteger(storedSettings.maxAgeDays, DEFAULT_SETTINGS.maxAgeDays, 1, 3650),
                skin: own(SKINS, storedSettings.skin) ? storedSettings.skin : DEFAULT_SETTINGS.skin
            };
        }

        if (!storedState || typeof storedState !== "object" || Array.isArray(storedState)) return;
        if (Array.isArray(storedState.events)) {
            this.events = storedState.events.map(event => this.sanitizeEvent(event)).filter(Boolean);
        }
        if (Array.isArray(storedState.cache)) {
            for (const raw of storedState.cache) {
                const snapshot = this.sanitizeSnapshot(raw);
                if (snapshot) this.cache.set(snapshot.id, snapshot);
            }
        }
    }

    sanitizeSnapshot(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        const id = idValue(raw.id);
        if (!id) return null;
        return {
            id,
            channelId: idValue(raw.channelId),
            guildId: idValue(raw.guildId),
            authorId: idValue(raw.authorId),
            authorName: clippedString(raw.authorName, 256),
            content: typeof raw.content === "string" ? clippedString(raw.content) : null,
            mentionIds: this.sanitizeMentionIds(raw.mentionIds),
            capturedAt: boundedInteger(raw.capturedAt, Date.now(), 0, Number.MAX_SAFE_INTEGER)
        };
    }

    sanitizeEvent(raw) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
        if (raw.kind !== "edit" && raw.kind !== "delete") return null;
        const messageId = idValue(raw.messageId);
        if (!messageId) return null;
        return {
            eventId: idValue(raw.eventId) || this.nextEventId(raw.kind, messageId),
            kind: raw.kind,
            at: boundedInteger(raw.at, Date.now(), 0, Number.MAX_SAFE_INTEGER),
            source: raw.source === "bulk" ? "bulk" : "single",
            messageId,
            channelId: idValue(raw.channelId),
            guildId: idValue(raw.guildId),
            authorId: idValue(raw.authorId),
            authorName: clippedString(raw.authorName, 256),
            beforeContent: raw.kind === "edit" && typeof raw.beforeContent === "string" ? clippedString(raw.beforeContent) : null,
            content: typeof raw.content === "string" ? clippedString(raw.content) : null,
            mentionIds: this.sanitizeMentionIds(raw.mentionIds),
            ghostPing: raw.kind === "delete" && raw.ghostPing === true,
            tombstone: raw.tombstone === true || typeof raw.content !== "string"
        };
    }

    sanitizeMentionIds(raw) {
        if (!Array.isArray(raw)) return [];
        return [...new Set(raw.map(idValue).filter(Boolean))].slice(0, 100);
    }

    snapshotMessage(message, previous = null) {
        if (!message || typeof message !== "object" || Array.isArray(message)) return null;
        const id = idValue(message.id) || previous?.id || "";
        if (!id) return null;

        const author = message.author && typeof message.author === "object" ? message.author : null;
        const authorName = author
            ? clippedString(author.global_name || author.globalName || author.username, 256)
            : previous?.authorName || "";
        const mentionIds = own(message, "mentions")
            ? this.sanitizeMentionIds(Array.isArray(message.mentions) ? message.mentions.map(mention => mention?.id ?? mention) : [])
            : previous?.mentionIds || [];
        const content = own(message, "content")
            ? (typeof message.content === "string" ? clippedString(message.content) : null)
            : (previous?.content ?? null);

        return {
            id,
            channelId: idValue(message.channel_id ?? message.channelId) || previous?.channelId || "",
            guildId: idValue(message.guild_id ?? message.guildId) || previous?.guildId || "",
            authorId: idValue(author?.id) || previous?.authorId || "",
            authorName,
            content,
            mentionIds: [...mentionIds],
            capturedAt: Date.now()
        };
    }

    tombstoneSnapshot(action, messageId) {
        return {
            id: messageId,
            channelId: idValue(action?.channelId ?? action?.channel_id),
            guildId: idValue(action?.guildId ?? action?.guild_id),
            authorId: "",
            authorName: "",
            content: null,
            mentionIds: [],
            capturedAt: Date.now()
        };
    }

    handleCreate(action) {
        if (!this.captureIsActive()) return;
        const message = action?.message;
        const id = idValue(message?.id);
        if (!id) return;
        const snapshot = this.snapshotMessage(message, this.cache.get(id));
        if (!snapshot) return;
        this.putSnapshot(snapshot);
        this.pruneRetention();
        this.scheduleSave();
    }

    handleUpdate(action) {
        if (!this.captureIsActive()) return;
        const message = action?.message;
        if (!message || typeof message !== "object" || !own(message, "content") || typeof message.content !== "string") return;
        const id = idValue(message.id);
        if (!id) return;

        const previous = this.cache.get(id);
        const current = this.snapshotMessage(message, previous);
        if (!current) return;
        this.putSnapshot(current);

        // An uncached update cannot prove that content changed, so it becomes a baseline only.
        if (!previous || typeof previous.content !== "string") {
            this.pruneRetention();
            this.scheduleSave();
            return;
        }
        if (previous.content === current.content) {
            this.pruneRetention();
            this.scheduleSave();
            return;
        }

        this.events.push(this.sanitizeEvent({
            eventId: this.nextEventId("edit", id),
            kind: "edit",
            at: Date.now(),
            source: "single",
            messageId: id,
            channelId: current.channelId,
            guildId: current.guildId,
            authorId: current.authorId,
            authorName: current.authorName,
            beforeContent: previous.content,
            content: current.content,
            mentionIds: current.mentionIds,
            ghostPing: false,
            tombstone: false
        }));
        this.finishMutation();
    }

    handleSingleDelete(action) {
        if (!this.captureIsActive()) return;
        const id = idValue(action?.id ?? action?.messageId ?? action?.message?.id);
        if (!id) return;
        this.recordDelete(action, id, "single");
        this.finishMutation();
    }

    handleBulkDelete(action) {
        if (!this.captureIsActive()) return;
        const rawIds = Array.isArray(action?.ids) ? action.ids : (Array.isArray(action?.messageIds) ? action.messageIds : []);
        const ids = [];
        const seen = new Set();
        const firstIndex = Math.max(0, rawIds.length - this.settings.maxEvents);

        // Inspect and retain at most maxEvents trailing entries. This bounds both work and allocation.
        for (let index = rawIds.length - 1; index >= firstIndex; index--) {
            const id = idValue(rawIds[index]);
            if (!id || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
        }
        if (!ids.length) return;

        // Reverse the bounded selection so valid input keeps its original event order.
        for (let index = ids.length - 1; index >= 0; index--) this.recordDelete(action, ids[index], "bulk");
        this.finishMutation();
    }

    recordDelete(action, id, source) {
        const cached = this.cache.get(id);
        const supplied = idValue(action?.message?.id) === id ? this.snapshotMessage(action.message, cached) : null;
        const snapshot = supplied || cached || this.tombstoneSnapshot(action, id);
        const currentUserId = this.getCurrentUserId();
        const ghostPing = Boolean(currentUserId && snapshot.mentionIds.includes(currentUserId));

        this.events.push(this.sanitizeEvent({
            eventId: this.nextEventId("delete", id),
            kind: "delete",
            at: Date.now(),
            source,
            messageId: id,
            channelId: snapshot.channelId,
            guildId: snapshot.guildId,
            authorId: snapshot.authorId,
            authorName: snapshot.authorName,
            beforeContent: null,
            content: snapshot.content,
            mentionIds: snapshot.mentionIds,
            ghostPing,
            tombstone: typeof snapshot.content !== "string"
        }));
        this.cache.delete(id);

        if (ghostPing) this.toast("MessageLoggerFix recorded a deleted message that mentioned you.", "warning");
    }

    finishMutation() {
        this.events = this.events.filter(Boolean);
        this.pruneRetention();
        this.scheduleSave();
        if (this.renderLogModal) this.renderLogModal();
    }

    putSnapshot(snapshot) {
        this.cache.delete(snapshot.id);
        this.cache.set(snapshot.id, snapshot);
    }

    pruneRetention() {
        const cutoff = Date.now() - this.settings.maxAgeDays * 24 * 60 * 60 * 1000;
        const oldEventCount = this.events.length;
        const oldCacheCount = this.cache.size;
        this.events = this.events
            .filter(event => event && event.at >= cutoff)
            .slice(-this.settings.maxEvents);

        for (const [id, snapshot] of this.cache) {
            if (!snapshot || snapshot.capturedAt < cutoff) this.cache.delete(id);
        }
        while (this.cache.size > this.settings.maxEvents) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
        return oldEventCount !== this.events.length || oldCacheCount !== this.cache.size;
    }

    buildStoredState() {
        return {
            schemaVersion: SCHEMA_VERSION,
            events: this.events,
            cache: [...this.cache.values()]
        };
    }

    storageEnvelopeByteLength(state) {
        return serializedByteLength({
            settings: {...this.settings},
            [STORAGE_KEY]: state
        });
    }

    pruneStorageByteBudget() {
        const cacheEntries = [...this.cache.entries()];
        const initialState = this.buildStoredState();
        let byteLength = this.storageEnvelopeByteLength(initialState);
        let eventDropCount = 0;
        let cacheDropCount = 0;

        while (byteLength > STORAGE_BYTE_LIMIT
            && (eventDropCount < this.events.length || cacheDropCount < cacheEntries.length)) {
            const event = this.events[eventDropCount];
            const snapshot = cacheEntries[cacheDropCount]?.[1];
            const dropEvent = Boolean(event && (!snapshot || event.at <= snapshot.capturedAt));

            if (dropEvent) {
                const remaining = this.events.length - eventDropCount;
                byteLength -= serializedByteLength(event) + (remaining > 1 ? 1 : 0);
                eventDropCount += 1;
            }
            else {
                const remaining = cacheEntries.length - cacheDropCount;
                byteLength -= serializedByteLength(snapshot) + (remaining > 1 ? 1 : 0);
                cacheDropCount += 1;
            }
        }

        if (eventDropCount) this.events = this.events.slice(eventDropCount);
        for (let index = 0; index < cacheDropCount; index++) this.cache.delete(cacheEntries[index][0]);

        const state = this.buildStoredState();
        return {
            state,
            byteLength: this.storageEnvelopeByteLength(state),
            pruned: eventDropCount > 0 || cacheDropCount > 0
        };
    }

    scheduleSave() {
        this.dirty = true;
        if (this.saveTimer !== null) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.persistNow();
        }, SAVE_DELAY_MS);
    }

    persistNow() {
        this.pruneRetention();
        const budget = this.pruneStorageByteBudget();
        try {
            // The bound Data API writes JSON-serializable values to BetterDiscord's local plaintext store.
            this.api.Data.save("settings", {...this.settings});
            this.api.Data.save(STORAGE_KEY, budget.state);
            this.dirty = false;
            if (budget.pruned && this.renderLogModal) this.renderLogModal();
        }
        catch (error) {
            this.logError("Could not save local data", error);
        }
    }

    captureIsActive() {
        return this.started && this.settings.captureEnabled && this.subscriptions.length > 0;
    }

    captureStatusText() {
        if (!this.settings.captureEnabled) return "Capture is off.";
        if (this.captureFailure) return `Capture was requested, but ${this.captureFailure}`;
        if (this.captureIsActive()) return "Capture is active.";
        return "Capture is requested but not active.";
    }

    subscribeCapture() {
        if (!this.started) {
            this.captureFailure = "the plugin is not running.";
            return false;
        }
        if (this.subscriptions.length) {
            this.captureFailure = "";
            return true;
        }
        let candidate = this.dispatcher;
        try {
            candidate ||= this.api.Webpack.getByKeys("actionLogger");
            if (!this.isDispatcher(candidate)) candidate = this.api.Webpack.getByKeys("subscribe", "unsubscribe", "dispatch");
        }
        catch (error) {
            this.logError("FluxDispatcher lookup failed", error);
        }
        if (!this.isDispatcher(candidate)) {
            this.dispatcher = null;
            this.captureFailure = "Discord's FluxDispatcher is unavailable.";
            this.toast("Capture is unavailable: Discord's FluxDispatcher was not found.", "error");
            return false;
        }

        this.dispatcher = candidate;
        for (const type of EVENT_TYPES) {
            const handler = this.handlers[type];
            try {
                candidate.subscribe(type, handler);
                this.subscriptions.push({type, handler});
            }
            catch (error) {
                this.logError(`Could not subscribe to ${type}`, error);
            }
        }
        if (this.subscriptions.length !== EVENT_TYPES.length) {
            this.unsubscribeCapture();
            this.captureFailure = "not all required Flux subscriptions could be established.";
            this.toast("Capture is unavailable: not all required Flux subscriptions succeeded.", "error");
            return false;
        }
        this.captureFailure = "";
        return true;
    }

    unsubscribeCapture() {
        const dispatcher = this.dispatcher;
        for (const {type, handler} of this.subscriptions.splice(0)) {
            try {
                if (dispatcher && typeof dispatcher.unsubscribe === "function") dispatcher.unsubscribe(type, handler);
            }
            catch (error) {
                this.logError(`Could not unsubscribe from ${type}`, error);
            }
        }
    }

    isDispatcher(value) {
        return Boolean(value
            && typeof value.subscribe === "function"
            && typeof value.unsubscribe === "function"
            && typeof value.dispatch === "function");
    }

    findUserStore() {
        if (this.userStoreLookupAttempted) return;
        this.userStoreLookupAttempted = true;
        try {
            const store = this.api.Webpack.getStore("UserStore");
            if (store && typeof store.getCurrentUser === "function") this.userStore = store;
        }
        catch (error) {
            this.logError("UserStore lookup failed", error);
        }
    }

    getCurrentUserId() {
        try {
            if (!this.userStore && !this.userStoreLookupAttempted) this.findUserStore();
            return idValue(this.userStore?.getCurrentUser?.()?.id);
        }
        catch (error) {
            this.logError("Could not read the current user", error);
            return "";
        }
    }

    nextEventId(kind, messageId) {
        this.sequence = (this.sequence + 1) % 1000000;
        return `${kind}-${messageId}-${Date.now()}-${this.sequence}`.slice(0, 128);
    }

    getSettingsPanel() {
        const root = element("section", "mlf-root mlf-settings");
        root.dataset.mlfSkin = this.settings.skin;
        this.registerRoot(root);

        root.append(
            element("h3", "", "MessageLoggerFix"),
            element("p", "mlf-settings-intro", "Capture is local, opt-in, and plaintext. Only messages observed while capture is active can be reconstructed later.")
        );

        const capture = element("input", "mlf-checkbox");
        capture.type = "checkbox";
        capture.checked = this.settings.captureEnabled;
        const captureStatus = element("p", "mlf-setting-note", this.captureStatusText());
        root.append(this.settingRow("Capture edits and deletions", "Stores an allowlisted message snapshot locally so later edits and deletes can be logged.", capture, captureStatus));
        this.listen(root, capture, "change", () => {
            this.settings.captureEnabled = capture.checked;
            this.settings.consentVersion = SCHEMA_VERSION;
            if (capture.checked) this.subscribeCapture();
            else {
                this.unsubscribeCapture();
                this.captureFailure = "";
            }
            captureStatus.textContent = this.captureStatusText();
            this.scheduleSave();
        });

        const maxEvents = element("input", "mlf-number");
        maxEvents.type = "number";
        maxEvents.min = "25";
        maxEvents.max = "10000";
        maxEvents.step = "25";
        maxEvents.value = String(this.settings.maxEvents);
        root.append(this.settingRow("Maximum retained items", "Applies independently to logged events and cached message snapshots.", maxEvents));
        this.listen(root, maxEvents, "change", () => {
            this.settings.maxEvents = boundedInteger(maxEvents.value, DEFAULT_SETTINGS.maxEvents, 25, 10000);
            maxEvents.value = String(this.settings.maxEvents);
            this.finishMutation();
        });

        const maxAge = element("input", "mlf-number");
        maxAge.type = "number";
        maxAge.min = "1";
        maxAge.max = "3650";
        maxAge.step = "1";
        maxAge.value = String(this.settings.maxAgeDays);
        root.append(this.settingRow("Retention age in days", "Older events and cached snapshots are removed automatically.", maxAge));
        this.listen(root, maxAge, "change", () => {
            this.settings.maxAgeDays = boundedInteger(maxAge.value, DEFAULT_SETTINGS.maxAgeDays, 1, 3650);
            maxAge.value = String(this.settings.maxAgeDays);
            this.finishMutation();
        });

        const skin = element("select", "mlf-select");
        for (const [value, label] of Object.entries(SKINS)) {
            const option = element("option", "", label);
            option.value = value;
            option.selected = value === this.settings.skin;
            skin.append(option);
        }
        root.append(this.settingRow("Viewer skin", "Changes MessageLoggerFix panels immediately; it does not theme Discord.", skin));
        this.listen(root, skin, "change", () => {
            this.settings.skin = own(SKINS, skin.value) ? skin.value : DEFAULT_SETTINGS.skin;
            this.applySkin();
            this.scheduleSave();
        });

        const actions = element("div", "mlf-actions");
        const open = this.button("Open logs", "mlf-button");
        const exportButton = this.button("Export JSON", "mlf-button mlf-button-secondary");
        const clear = this.button("Clear logs and cache", "mlf-button mlf-button-danger");
        actions.append(open, exportButton, clear);
        root.append(actions);
        this.listen(root, open, "click", () => this.openLogs());
        this.listen(root, exportButton, "click", () => this.exportJson());
        this.listen(root, clear, "click", () => this.confirmClear());
        return root;
    }

    settingRow(name, note, control, status = null) {
        const row = element("div", "mlf-setting-row");
        const copy = element("div", "mlf-setting-copy");
        copy.append(element("p", "mlf-setting-name", name), element("p", "mlf-setting-note", note));
        if (status) copy.append(status);
        row.append(copy, control);
        return row;
    }

    openFirstRunWarning() {
        if (this.settings.consentVersion >= SCHEMA_VERSION || !this.started) return;
        let settled = false;
        const dismiss = close => {
            if (!settled) {
                settled = true;
                this.settings.consentVersion = SCHEMA_VERSION;
                this.settings.captureEnabled = false;
                this.scheduleSave();
            }
            close();
        };
        const dialog = this.createOverlay("MessageLoggerFix is opt-in", dismiss);
        dialog.body.append(
            element("p", "mlf-copy mlf-warning", "This plugin can retain message text—including text later edited or deleted—in BetterDiscord's local plaintext data store."),
            element("p", "mlf-copy", "Capture starts only if you choose Enable capture. Use it only where you have permission and understand the Discord and BetterDiscord policy risks. You can disable capture or clear local data at any time."),
            element("p", "mlf-copy", "Messages sent before capture begins cannot be recovered, and missing content is recorded only as a tombstone.")
        );
        const notNow = this.button("Not now", "mlf-button mlf-button-secondary");
        const enable = this.button("Enable capture", "mlf-button");
        dialog.footer.append(notNow, enable);
        this.listen(dialog.root, notNow, "click", () => dismiss(dialog.close));
        this.listen(dialog.root, enable, "click", () => {
            if (settled) return;
            settled = true;
            this.settings.consentVersion = SCHEMA_VERSION;
            this.settings.captureEnabled = true;
            this.scheduleSave();
            const active = this.subscribeCapture();
            dialog.close();
            this.toast(active ? "Local capture enabled." : "Capture requested, but FluxDispatcher is unavailable.", active ? "success" : "error");
        });
    }

    openLogs() {
        if (this.logModal?.isConnected) {
            this.logModal.querySelector(".mlf-input")?.focus();
            return;
        }

        let dialog;
        const dismiss = close => {
            close();
            this.logModal = null;
            this.renderLogModal = null;
        };
        dialog = this.createOverlay("MessageLoggerFix local logs", dismiss);
        this.logModal = dialog.root;

        const toolbar = element("div", "mlf-toolbar");
        const search = element("input", "mlf-input");
        search.type = "search";
        search.placeholder = "𝗌𝐞𝐚𝗋𝖼𝗁 𝗍𝗁𝐞 𝗅𝐨𝖼𝐚𝗅 𝗀𝗋𝐚𝗏𝐞 · 𝖼𝐨𝗇𝗍𝐞𝗇𝗍 / 𝐚𝐮𝗍𝗁𝐨𝗋 / 𝖼𝗁𝐚𝗇𝗇𝐞𝗅 / 𝗀𝐮𝐢𝗅𝖽 / 𝗆𝐞𝗌𝗌𝐚𝗀𝐞 𝐢𝖽";
        search.setAttribute("aria-label", "Search logs");
        const filter = element("select", "mlf-select");
        filter.setAttribute("aria-label", "Filter logs");
        for (const [value, label] of [["all", "all events"], ["edit", "edits"], ["delete", "deletions"], ["ghost", "ghost pings"]]) {
            const option = element("option", "", label);
            option.value = value;
            filter.append(option);
        }
        const exportButton = this.button("Export JSON", "mlf-button mlf-button-secondary");
        const clear = this.button("Clear", "mlf-button mlf-button-danger");
        toolbar.append(search, filter, exportButton, clear);
        const stats = element("p", "mlf-stats");
        const list = element("div", "mlf-list");
        dialog.body.append(toolbar, stats, list);

        const render = () => {
            if (!dialog.root.isConnected) return;
            const query = search.value.trim().toLocaleLowerCase();
            const mode = filter.value;
            const matching = [...this.events].reverse().filter(event => {
                if (mode === "edit" && event.kind !== "edit") return false;
                if (mode === "delete" && event.kind !== "delete") return false;
                if (mode === "ghost" && !event.ghostPing) return false;
                if (!query) return true;
                return [
                    event.kind, event.messageId, event.channelId, event.guildId, event.authorId,
                    event.authorName, event.beforeContent, event.content, ...event.mentionIds
                ].filter(value => typeof value === "string").join("\n").toLocaleLowerCase().includes(query);
            });

            while (list.firstChild) list.removeChild(list.firstChild);
            stats.textContent = `${matching.length} shown · ${this.events.length} retained · ${this.cache.size} cached snapshots`;
            if (!matching.length) {
                list.append(element("p", "mlf-empty", "No matching local events."));
                return;
            }
            for (const event of matching) list.append(this.renderEventCard(event));
        };

        this.renderLogModal = render;
        this.listen(dialog.root, search, "input", render);
        this.listen(dialog.root, filter, "change", render);
        this.listen(dialog.root, exportButton, "click", () => this.exportJson());
        this.listen(dialog.root, clear, "click", () => this.confirmClear());
        render();
        search.focus();
    }

    renderEventCard(event) {
        const card = element("article", "mlf-card");
        card.dataset.kind = event.kind;
        card.dataset.ghost = String(event.ghostPing);
        const title = event.kind === "edit"
            ? "Edited message"
            : (event.ghostPing ? "Deleted ghost ping" : "Deleted message");
        const author = event.authorName || event.authorId || "unknown author";
        const location = event.channelId ? `channel ${event.channelId}` : "unknown channel";
        const time = new Date(event.at).toLocaleString();
        card.append(
            element("p", "mlf-card-title", title),
            element("p", "mlf-card-meta", `${time} · ${author} · ${location} · message ${event.messageId}${event.source === "bulk" ? " · bulk delete" : ""}`)
        );

        if (event.kind === "edit") {
            card.append(
                element("p", "mlf-label", "Before"),
                element("p", "mlf-content", event.beforeContent ?? "[content unavailable]"),
                element("p", "mlf-label", "After"),
                element("p", "mlf-content", event.content ?? "[content unavailable]")
            );
        }
        else {
            card.append(
                element("p", "mlf-label", event.tombstone ? "Tombstone" : "Deleted content"),
                element("p", "mlf-content", event.content ?? "[content unavailable — this message was not cached]")
            );
        }
        return card;
    }

    confirmClear() {
        this.openConfirmation(
            "Clear local MessageLoggerFix data?",
            "This permanently clears retained edit/delete events and cached message snapshots. Settings and your opt-in choice are kept.",
            "Clear data",
            () => {
                this.events = [];
                this.cache.clear();
                this.dirty = true;
                if (this.saveTimer !== null) clearTimeout(this.saveTimer);
                this.saveTimer = null;
                this.persistNow();
                if (this.renderLogModal) this.renderLogModal();
                this.toast("Local MessageLoggerFix logs and cache cleared.", "success");
            }
        );
    }

    openConfirmation(title, copy, confirmText, onConfirm) {
        const dialog = this.createOverlay(title, close => close());
        dialog.body.append(element("p", "mlf-copy mlf-warning", copy));
        const cancel = this.button("Cancel", "mlf-button mlf-button-secondary");
        const confirm = this.button(confirmText, "mlf-button mlf-button-danger");
        dialog.footer.append(cancel, confirm);
        this.listen(dialog.root, cancel, "click", dialog.close);
        this.listen(dialog.root, confirm, "click", () => {
            dialog.close();
            onConfirm();
        });
        confirm.focus();
    }

    exportJson() {
        try {
            const exportData = {
                schemaVersion: SCHEMA_VERSION,
                plugin: PLUGIN_ID,
                exportedAt: new Date().toISOString(),
                events: this.events
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: "application/json;charset=utf-8"});
            const url = URL.createObjectURL(blob);
            this.objectUrls.add(url);
            const anchor = element("a");
            anchor.href = url;
            anchor.download = `MessageLoggerFix-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
            anchor.hidden = true;
            document.body.append(anchor);
            anchor.click();
            anchor.remove();
            const timer = setTimeout(() => {
                URL.revokeObjectURL(url);
                this.objectUrls.delete(url);
                this.revokeTimers.delete(timer);
            }, 1000);
            this.revokeTimers.add(timer);
            this.toast(`Exported ${this.events.length} local events.`, "success");
        }
        catch (error) {
            this.logError("JSON export failed", error);
            this.toast("JSON export failed.", "error");
        }
    }

    createOverlay(title, onDismiss) {
        const root = element("div", "mlf-root mlf-overlay");
        root.dataset.mlfSkin = this.settings.skin;
        root.setAttribute("role", "presentation");
        const panel = element("section", "mlf-dialog");
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-modal", "true");
        const header = element("header", "mlf-header");
        const heading = element("h2", "", title);
        const closeButton = this.button("×", "mlf-button mlf-button-secondary mlf-close");
        closeButton.setAttribute("aria-label", "Close");
        header.append(heading, closeButton);
        const body = element("div", "mlf-body");
        const footer = element("footer", "mlf-footer");
        panel.append(header, body, footer);
        root.append(panel);
        document.body.append(root);
        this.registerRoot(root);

        let closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            this.destroyRoot(root);
        };
        const requestDismiss = () => onDismiss ? onDismiss(close) : close();
        this.listen(root, closeButton, "click", requestDismiss);
        this.listen(root, root, "mousedown", event => {
            if (event.target === root) requestDismiss();
        });
        this.listen(root, document, "keydown", event => {
            if (event.key === "Escape" && root.isConnected) requestDismiss();
        });
        return {root, panel, body, footer, close};
    }

    button(text, className) {
        const button = element("button", className, text);
        button.type = "button";
        return button;
    }

    registerRoot(root) {
        this.uiRoots.set(root, []);
        root.dataset.mlfSkin = this.settings.skin;
    }

    listen(root, target, type, listener, options) {
        target.addEventListener(type, listener, options);
        const cleanups = this.uiRoots.get(root);
        if (cleanups) cleanups.push(() => target.removeEventListener(type, listener, options));
    }

    destroyRoot(root) {
        const cleanups = this.uiRoots.get(root) || [];
        this.uiRoots.delete(root);
        for (const cleanup of cleanups.reverse()) {
            try { cleanup(); }
            catch (_) { /* cleanup is best-effort */ }
        }
        root.remove();
        if (root === this.logModal) {
            this.logModal = null;
            this.renderLogModal = null;
        }
    }

    applySkin() {
        for (const root of this.uiRoots.keys()) root.dataset.mlfSkin = this.settings.skin;
    }

    toast(message, type) {
        try {
            if (this.api.UI && typeof this.api.UI.showToast === "function") {
                this.api.UI.showToast(message, {type, timeout: 4000});
            }
        }
        catch (error) {
            this.logError("Toast failed", error);
        }
    }

    logError(message, error) {
        try {
            if (this.api.Logger && typeof this.api.Logger.error === "function") this.api.Logger.error(message, error);
        }
        catch (_) { /* never let diagnostics affect Discord */ }
    }
};
