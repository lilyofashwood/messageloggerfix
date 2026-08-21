"""Behavior smoke for the distributable plugin using a tiny BetterDiscord mock."""

from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "messageloggerfix.plugin.js"
SYSTEM_JSC = Path("/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc")


def find_javascript_engine():
    for candidate in (shutil.which("node"), shutil.which("jsc"), str(SYSTEM_JSC)):
        if candidate and Path(candidate).is_file():
            return candidate
    return None


PRELUDE = r'''
var module = {exports: null};
var nextTimer = 0;
var timers = new Map();
function setTimeout(callback, delay) {
    var id = ++nextTimer;
    timers.set(id, {callback: callback, delay: delay});
    return id;
}
function clearTimeout(id) { timers.delete(id); }
function runTimers() {
    while (timers.size) {
        var pending = Array.from(timers.entries());
        timers.clear();
        for (var pair of pending) pair[1].callback();
    }
}
function check(value, message) {
    if (!value) throw new Error(message);
}

var callbacks = {};
var unsubscribeCount = 0;
var dispatcher = {
    actionLogger: true,
    subscribe: function(type, handler) { callbacks[type] = handler; },
    unsubscribe: function(type, handler) {
        if (callbacks[type] === handler) delete callbacks[type];
        unsubscribeCount += 1;
    },
    dispatch: function(action) {
        if (callbacks[action.type]) callbacks[action.type](action);
    }
};
var activeDispatcher = dispatcher;
var store = {
    settings: {
        captureEnabled: true,
        consentVersion: 1,
        maxEvents: 1000,
        maxAgeDays: 30,
        skin: "original"
    },
    localLog: {events: [], cache: []}
};
var styles = [];
var errors = [];

class BdApi {
    constructor() {
        this.Data = {
            load: function(key) { return store[key]; },
            save: function(key, value) { store[key] = value; }
        };
        this.DOM = {
            addStyle: function(id) { styles.push(id); },
            removeStyle: function(id) { styles = styles.filter(function(value) { return value !== id; }); }
        };
        this.Webpack = {
            getByKeys: function() { return activeDispatcher; },
            getStore: function() {
                return {getCurrentUser: function() { return {id: "current-user"}; }};
            }
        };
        this.UI = {showToast: function() {}};
        this.Logger = {error: function(message) { errors.push(message); }};
    }
}
globalThis.BdApi = BdApi;
'''


ASSERTIONS = r'''
var plugin = new module.exports();
plugin.start();
check(Object.keys(callbacks).length === 4, "all four Flux handlers should subscribe");
check(plugin.captureStatusText() === "Capture is active.", "active capture status should be accurate");

dispatcher.dispatch({
    type: "MESSAGE_CREATE",
    message: {
        id: "message-1",
        channel_id: "channel-1",
        guild_id: "guild-1",
        author: {id: "author-1", username: "author"},
        content: "before",
        mentions: [{id: "current-user"}]
    }
});
dispatcher.dispatch({type: "MESSAGE_UPDATE", message: {id: "message-1", content: "after"}});
check(plugin.events.length === 1 && plugin.events[0].kind === "edit", "content edit should be captured");
dispatcher.dispatch({type: "MESSAGE_DELETE", id: "message-1", channelId: "channel-1"});
check(plugin.events.length === 2, "delete should be captured");
check(plugin.events[1].ghostPing === true, "direct mention delete should be a ghost ping");

plugin.events = [];
plugin.cache.clear();
var firstLarge = "a".repeat(20000);
dispatcher.dispatch({type: "MESSAGE_CREATE", message: {id: "large", content: firstLarge}});
for (var update = 0; update < 220; update++) {
    var content = (update % 2 ? "b" : "c").repeat(20000);
    dispatcher.dispatch({type: "MESSAGE_UPDATE", message: {id: "large", content: content}});
}
check(timers.size === 1, "rapid mutations should share one debounced save timer");
runTimers();
var savedEnvelope = {settings: store.settings, localLog: store.localLog};
check(JSON.stringify(savedEnvelope).length <= 4 * 1024 * 1024, "ASCII fixture data must independently fit the aggregate byte budget");
check(serializedByteLength("é") === 4, "UTF-8 accounting should count a two-byte code point plus JSON quotes");
check(serializedByteLength("🖤") === 6, "UTF-8 accounting should count a surrogate pair once plus JSON quotes");
check(store.localLog.events.length > 0 && store.localLog.events.length < 220, "oldest events should be pruned by byte budget");
check(store.localLog.events[store.localLog.events.length - 1].content === "b".repeat(20000), "newest event should survive byte pruning");

plugin.events = [];
plugin.cache.clear();
plugin.settings.maxEvents = 25;
var hostileIds = new Array(1000);
Object.defineProperty(hostileIds, 0, {get: function() { throw new Error("bulk handler read outside its bound"); }});
for (var index = 975; index < 1000; index++) hostileIds[index] = "bulk-" + index;
dispatcher.dispatch({type: "MESSAGE_DELETE_BULK", ids: hostileIds});
check(plugin.events.length === 25, "bounded bulk handler should retain at most maxEvents records");
check(plugin.events[0].messageId === "bulk-975", "bounded bulk order should start with the earliest selected id");
check(plugin.events[24].messageId === "bulk-999", "bounded bulk order should preserve the final id");

plugin.stop();
check(Object.keys(callbacks).length === 0 && unsubscribeCount === 4, "stop should unsubscribe every handler");
check(styles.length === 0 && timers.size === 0, "stop should remove styles and timers");

activeDispatcher = null;
store.settings = {
    captureEnabled: true,
    consentVersion: 1,
    maxEvents: 1000,
    maxAgeDays: 30,
    skin: "original"
};
store.localLog = {events: [], cache: []};
var unavailable = new module.exports();
unavailable.start();
check(unavailable.subscriptions.length === 0, "missing dispatcher should fail closed");
check(unavailable.captureStatusText().includes("FluxDispatcher is unavailable"), "startup failure should be visible in status text");
unavailable.stop();

if (typeof print === "function") print("runtime behavior smoke ok");
else if (typeof console !== "undefined") console.log("runtime behavior smoke ok");
'''


class RuntimeBehaviorTests(unittest.TestCase):
    def test_mocked_betterdiscord_lifecycle_and_bounds(self):
        engine = find_javascript_engine()
        if engine is None:
            self.skipTest("Node.js or JavaScriptCore is required for the runtime smoke")

        script = PRELUDE + "\n" + PLUGIN.read_text(encoding="utf-8") + "\n" + ASSERTIONS
        with tempfile.TemporaryDirectory() as directory:
            smoke = Path(directory) / "message_logger_runtime_smoke.js"
            smoke.write_text(script, encoding="utf-8")
            completed = subprocess.run(
                [engine, str(smoke)],
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )

        self.assertEqual(0, completed.returncode, completed.stdout + completed.stderr)
        self.assertIn("runtime behavior smoke ok", completed.stdout)


if __name__ == "__main__":
    unittest.main()
