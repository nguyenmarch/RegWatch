import re

_DIEU_PATTERN = re.compile(r'[Đđ]i[eề]u\s+(\d+)', re.IGNORECASE)


def extract_article_numbers(text: str) -> list[int]:
    """Extract all referenced article numbers from Vietnamese legal text."""
    return [int(m) for m in _DIEU_PATTERN.findall(text)]
