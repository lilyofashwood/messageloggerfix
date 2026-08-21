"""Dependency-free source contracts for the distributed BetterDiscord plugin."""

from pathlib import Path
import re
import unittest
import unicodedata


ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "messageloggerfix.plugin.js"
README = ROOT / "README.md"


class PluginSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = PLUGIN.read_text(encoding="utf-8")
        cls.readme = README.read_text(encoding="utf-8")
        cls.normalized_readme = unicodedata.normalize("NFKC", cls.readme).lower()

    def test_metadata_and_entry_points(self):
        self.assertTrue(self.source.startswith("/**"))
        for field in (
            "@name MessageLoggerFix",
            "@author lilyofashwood",
            "@version 1.0.0",
            "@license MIT",
            "module.exports = class MessageLoggerFix",
            "start()",
            "stop()",
            "getSettingsPanel()",
        ):
            self.assertIn(field, self.source)

    def test_uses_a_bound_documented_bdapi_surface(self):
        self.assertIn("new BdApi(PLUGIN_ID)", self.source)
        for namespace in ("Data", "DOM", "Webpack", "UI", "Logger"):
            self.assertIn(f"this.api.{namespace}", self.source)
        self.assertNotRegex(self.source, r"BdApi\.(?:Data|DOM|Webpack|UI|Logger)\b")

    def test_flux_subscriptions_are_complete_and_feature_checked(self):
        for event_type in (
            "MESSAGE_CREATE",
            "MESSAGE_UPDATE",
            "MESSAGE_DELETE",
            "MESSAGE_DELETE_BULK",
        ):
            self.assertIn(f'"{event_type}"', self.source)
        self.assertIn("candidate.subscribe(type, handler)", self.source)
        self.assertIn("dispatcher.unsubscribe(type, handler)", self.source)
        for method in ("subscribe", "unsubscribe", "dispatch"):
            self.assertIn(f'typeof value.{method} === "function"', self.source)

    def test_capture_is_explicitly_opt_in(self):
        self.assertRegex(
            self.source,
            r"captureEnabled:\s*false,\s*\n\s*consentVersion:\s*0",
        )
        self.assertIn("MessageLoggerFix is opt-in", self.source)
        self.assertIn("Enable capture", self.source)
        self.assertIn("This plugin can retain message text", self.source)

    def test_snapshot_and_event_fields_are_allowlisted(self):
        expected_snapshot_fields = {
            "id",
            "channelId",
            "guildId",
            "authorId",
            "authorName",
            "content",
            "mentionIds",
            "capturedAt",
        }
        sanitizer = re.search(
            r"sanitizeSnapshot\(raw\)\s*\{(?P<body>.*?)\n\s*\}\n\n\s*sanitizeEvent",
            self.source,
            flags=re.DOTALL,
        )
        self.assertIsNotNone(sanitizer)
        returned = re.search(r"return\s*\{(?P<object>.*?)\n\s*\};", sanitizer.group("body"), re.DOTALL)
        self.assertIsNotNone(returned)
        keys = set(re.findall(r"^\s{12}([A-Za-z][A-Za-z0-9]*)(?::|,)", returned.group("object"), re.MULTILINE))
        self.assertEqual(expected_snapshot_fields, keys)
        self.assertNotIn("...message", self.source)
        self.assertNotIn("...raw", self.source)

    def test_edits_require_a_real_content_change(self):
        self.assertIn('!own(message, "content")', self.source)
        self.assertIn('typeof message.content !== "string"', self.source)
        self.assertIn('typeof previous.content !== "string"', self.source)
        self.assertIn("previous.content === current.content", self.source)
        self.assertIn("An uncached update cannot prove that content changed", self.source)

    def test_deletes_have_tombstones_and_mention_based_ghost_pings(self):
        self.assertIn("tombstoneSnapshot(action, messageId)", self.source)
        self.assertIn("[content unavailable — this message was not cached]", self.source)
        self.assertIn("snapshot.mentionIds.includes(currentUserId)", self.source)
        self.assertIn("getCurrentUser", self.source)

    def test_events_and_cache_have_count_age_and_byte_bounds(self):
        self.assertIn("maxEvents: 1000", self.source)
        self.assertIn("maxAgeDays: 30", self.source)
        self.assertIn("STORAGE_BYTE_LIMIT = 4 * 1024 * 1024", self.source)
        self.assertIn(".slice(-this.settings.maxEvents)", self.source)
        self.assertIn("while (this.cache.size > this.settings.maxEvents)", self.source)
        self.assertIn("snapshot.capturedAt < cutoff", self.source)
        self.assertIn("event.at >= cutoff", self.source)
        self.assertIn("pruneStorageByteBudget()", self.source)
        self.assertIn("storageEnvelopeByteLength(state)", self.source)
        self.assertIn("this.api.Data.save(STORAGE_KEY, budget.state)", self.source)

    def test_bulk_delete_work_and_allocation_are_bounded(self):
        self.assertIn("rawIds.length - this.settings.maxEvents", self.source)
        self.assertIn("index >= firstIndex", self.source)
        self.assertIn("const seen = new Set()", self.source)
        self.assertNotIn("rawIds.map(", self.source)

    def test_capture_failure_is_visible_in_settings(self):
        self.assertIn('this.captureFailure = "Discord\'s FluxDispatcher is unavailable."', self.source)
        self.assertIn("captureStatusText()", self.source)
        self.assertIn('element("p", "mlf-setting-note", this.captureStatusText())', self.source)

    def test_local_saves_are_debounced(self):
        self.assertIn("SAVE_DELAY_MS", self.source)
        self.assertIn("clearTimeout(this.saveTimer)", self.source)
        self.assertIn("this.api.Data.save", self.source)
        self.assertIn("local plaintext data store", self.source)

    def test_dom_rendering_has_no_html_injection_sink(self):
        for forbidden in ("innerHTML", "outerHTML", "insertAdjacentHTML", "parseHTML"):
            self.assertNotIn(forbidden, self.source)
        self.assertIn("node.textContent = text", self.source)
        self.assertIn("textContent =", self.source)

    def test_no_runtime_network_updates_or_dependencies(self):
        for forbidden in (
            "require(",
            "fetch(",
            "XMLHttpRequest",
            "WebSocket",
            "this.api.Net",
            "http://",
            "https://",
            "checkForUpdate",
            "autoUpdate",
        ):
            self.assertNotIn(forbidden, self.source)

    def test_settings_include_all_local_skins_and_actions(self):
        for skin in ("original", "black heart", "crimson", "ghost terminal"):
            self.assertIn(skin, self.source)
        for action in ("Open logs", "Export JSON", "Clear logs and cache"):
            self.assertIn(action, self.source)
        self.assertIn("this.applySkin()", self.source)

    def test_dark_unicode_copy_does_not_corrupt_accessible_input_names(self):
        self.assertIn("a betterdiscord black box", self.normalized_readme)
        self.assertIn("mutiny edition", self.normalized_readme)
        self.assertIn(
            'search.placeholder = "𝗌𝐞𝐚𝗋𝖼𝗁 𝗍𝗁𝐞 𝗅𝐨𝖼𝐚𝗅 𝗀𝗋𝐚𝗏𝐞',
            self.source,
        )
        self.assertIn('search.setAttribute("aria-label", "Search logs")', self.source)

    def test_stop_contains_full_cleanup_contract(self):
        stop = re.search(
            r"\n\s{4}stop\(\)\s*\{(?P<body>.*?)\n\s{4}\}\n\n\s{4}loadLocalData",
            self.source,
            flags=re.DOTALL,
        )
        self.assertIsNotNone(stop)
        for cleanup in (
            "unsubscribeCapture()",
            "clearTimeout(this.saveTimer)",
            "URL.revokeObjectURL",
            "this.destroyRoot(root)",
            "this.api.DOM.removeStyle(STYLE_ID)",
        ):
            self.assertIn(cleanup, stop.group("body"))

    def test_readme_leads_with_one_honest_pirate_note(self):
        opening = self.normalized_readme[:2500]
        for phrase in (
            "pirate's note",
            "loot is plaintext",
            "if it sinks, it sinks",
            "original clean-room",
            "single-file betterdiscord plugin",
        ):
            self.assertIn(phrase.lower(), opening)
        self.assertNotIn("[!WARNING]", self.readme)
        self.assertNotIn("[!CAUTION]", self.readme)
        for official_url in (
            "https://docs.betterdiscord.app/plugins/publishing/guidelines",
            "https://docs.betterdiscord.app/users/getting-started/faq",
            "https://discord.com/terms",
            "https://docs.betterdiscord.app/api/BoundData",
            "https://docs.betterdiscord.app/discord/modules/flux-events",
        ):
            self.assertIn(official_url, self.readme)


if __name__ == "__main__":
    unittest.main()
