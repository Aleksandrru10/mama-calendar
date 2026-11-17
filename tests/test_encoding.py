"""Regression checks for the published Russian interface, not just HTTP 200."""
from html.parser import HTMLParser
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]


class Document(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.labels = []
        self.values = []
        self.feed(text)

    def handle_data(self, data):
        self.labels.append(data)

    def handle_starttag(self, tag, attrs):
        if tag == 'option':
            self.values.extend(value for key, value in attrs if key == 'value')


class EncodingTests(unittest.TestCase):
    def test_russian_html_and_schedule_values_are_not_mojibake(self):
        text = (ROOT / 'index.html').read_text(encoding='utf-8-sig')
        document = Document(text)
        self.assertIn('<title>Мой график</title>', text)
        self.assertIn('Добавить человека', document.labels)
        self.assertIn('ЛИЧНЫЙ РИТМ', document.labels)
        self.assertIn('Календарь', document.labels)
        for value in ['Р', 'Д', 'Н', 'В', 'С', 'О', 'Б', 'Д Н В В']:
            self.assertIn(value, document.values)
        self.assertNotRegex(text, r'[\u0080-\u009f\ufffd]')
        self.assertNotRegex(text, r'Р[њѕ№і]|С[ЂЃ]|вЂ[”№є¦]|пј‹')

    def test_javascript_labels_are_already_utf8(self):
        self.assertIn('Сохранить профиль', (ROOT / 'app.js').read_text(encoding='utf-8'))
        self.assertIn('Выходной', (ROOT / 'schedule.js').read_text(encoding='utf-8'))
        for name in ['app.js', 'profiles.js', 'money.js', 'schedule.js']:
            text = (ROOT / name).read_text(encoding='utf-8')
            self.assertNotRegex(text, r'[\u0080-\u009f\ufffd]')
            self.assertNotRegex(text, r'Р[њѕ№і]|С[ЂЃ]|вЂ[”№є¦]|пј‹')


if __name__ == '__main__':
    unittest.main(verbosity=2)
