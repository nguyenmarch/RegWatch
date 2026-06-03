import re
import unicodedata

LEGAL_SECTION_PATTERN = re.compile(
    r"""
    ^(
        Chương\s+[IVXLCDM]+
        |Mục\s+\d+\.
        |Điều\s+\d+\.
        |Khoản\s+\d+
        |Phụ\s+lục
    )
    """,
    re.IGNORECASE | re.VERBOSE,
)

def clean_legal_text(text: str) -> str:
    text = unicodedata.normalize("NFC", text)

    text = text.replace("\r", "")
    text = text.replace("\f", "\n")

    text = re.sub(
        r"<PARSED TEXT FOR PAGE:\s*(\d+)\s*/\s*(\d+)\s*>",
        lambda m: f"\n[PAGE {m.group(1)}]\n",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"^\s*-\s*\d+\s*-\s*$",
        "",
        text,
        flags=re.MULTILINE,
    )

    text = re.sub(
        r"^\s*(Trang|Page)\s+\d+\s*$",
        "",
        text,
        flags=re.MULTILINE | re.IGNORECASE,
    )

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)

    text = re.sub(
        r"\n?(Chương\s+[IVXLCDM]+)",
        r"\n\n\1",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\n?(Mục\s+\d+\.)",
        r"\n\n\1",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\n?(Điều\s+\d+\.)",
        r"\n\n\1",
        text,
        flags=re.IGNORECASE,
    )

    text = merge_broken_lines(text)

    text = re.sub(r"\n{3,}", "\n\n", text)

    return "\n".join(
        line.rstrip()
        for line in text.splitlines()
    ).strip()


def merge_broken_lines(text: str) -> str:
    lines = [line.strip() for line in text.splitlines()]

    merged = []

    for line in lines:
        if not line:
            merged.append("")
            continue

        if not merged:
            merged.append(line)
            continue

        prev = merged[-1]

        if (
            prev
            and line
            and not LEGAL_SECTION_PATTERN.match(line)
            and not re.match(r"^\[\s*PAGE\s+\d+\s*\]$", line, re.I)
            and not re.match(r"^\d+\.", line)
            and not re.match(r"^[a-zđ]\)", line, re.I)
            and not prev.endswith((".", "!", "?", ":", ";"))
        ):
            merged[-1] = prev + " " + line
        else:
            merged.append(line)

    return "\n".join(merged)

