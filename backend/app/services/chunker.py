import re

_BOUNDARY_PATTERN = re.compile(
    r"(?=^\s*(?:Điều|Article|Section)\s+\d+[\.\s])",
    re.IGNORECASE | re.MULTILINE,
)

_HEADER_PATTERN = re.compile(
    r"^((?:Điều|Article|Section)\s+(\d+)[^\n]*)",
    re.IGNORECASE,
)


def split_legal_document(raw_text: str) -> list[dict]:
    segments = _BOUNDARY_PATTERN.split(raw_text)

    chunks: list[dict] = []
    for index, segment in enumerate(segments):
        stripped = segment.strip()
        if not stripped:
            continue

        chunk: dict = {"chunk_id": f"chunk_{len(chunks)}", "text_content": stripped}

        header_match = _HEADER_PATTERN.match(stripped)
        if header_match:
            chunk["header"] = header_match.group(1).strip()
            chunk["article_number"] = int(header_match.group(2))

        chunks.append(chunk)

    if not chunks and raw_text.strip():
        chunks.append({"chunk_id": "chunk_0", "text_content": raw_text.strip()})

    return chunks
