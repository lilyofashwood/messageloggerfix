"""Static presentation contracts; the source companion never executes a script."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unicodedata
import unittest


PAGE = Path(__file__).resolve().parents[1] / "index.html"


class Companion(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.tags = []
        self.attributes = []
        self.visible = []
        self.originals = []
        self.leaks = []
        self.codes = []
        self.title = ""

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        self.tags.append(tag)
        self.attributes.append((tag, attrs))
        if tag not in {"meta", "link", "br", "hr", "input", "img"}:
            self.stack.append((tag, attrs))

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                self.stack = self.stack[:index]
                return

    def handle_data(self, text):
        tags = {tag for tag, _ in self.stack}
        classes = {attrs.get("class", "") for _, attrs in self.stack}
        if "title" in tags:
            self.title += text
        if "code" in tags:
            self.codes.append(text)
        if "voice-visible" in classes:
            self.visible.append(text)
        elif "sr-only" in classes:
            self.originals.append(text)
        elif "body" in tags and not tags.intersection({"code", "pre", "style"}) and re.search(r"[A-Za-z]", text):
            self.leaks.append(text)


class FrontendPresentation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.page = Companion()
        cls.page.feed(PAGE.read_text(encoding="utf-8"))

    def test_every_dressed_passage_keeps_a_plain_accessible_original(self):
        self.assertGreater(len(self.page.visible), 45)
        self.assertEqual(len(self.page.visible), len(self.page.originals))
        for styled, original in zip(self.page.visible, self.page.originals):
            self.assertFalse(re.search(r"[A-Za-z]", styled))
            self.assertEqual(unicodedata.normalize("NFKC", styled), original.lower())
        self.assertEqual(self.page.leaks, [])

    def test_browser_title_is_dressed(self):
        self.assertFalse(re.search(r"[A-Za-z]", self.page.title))
        self.assertEqual(unicodedata.normalize("NFKC", self.page.title), "messageloggerfix · local records")

    def test_code_and_plugin_paths_remain_literal(self):
        self.assertEqual(self.page.codes, [
            "messageloggerfix.plugin.js",
            "~/Library/Application Support/BetterDiscord/plugins",
            "python3 -m unittest discover -s tests -v",
        ])

    def test_no_javascript_or_permissive_script_policy(self):
        self.assertNotIn("script", self.page.tags)
        for _, attrs in self.page.attributes:
            self.assertFalse(any(key.lower().startswith("on") for key in attrs))
        policy = next(attrs["content"] for tag, attrs in self.page.attributes
                      if tag == "meta" and attrs.get("http-equiv") == "Content-Security-Policy")
        self.assertEqual(policy, "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'")

    def test_visible_spans_are_hidden_from_accessibility_tree(self):
        for _, attrs in self.page.attributes:
            if attrs.get("class") == "voice-visible":
                self.assertEqual(attrs.get("aria-hidden"), "true")


if __name__ == "__main__":
    unittest.main()
