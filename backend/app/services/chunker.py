import re

def split_legal_document(raw_text: str) -> list[dict]:
    """
    Demo innocent chunking logic based on regex boundaries. In production, this should be replaced with a more robust NLP-based chunker that understands 
    legal document structures (e.g., articles, sections, clauses).
    """
    boundary_pattern = re.compile(
        r"(?=^(?:Article|Section)\s+\d+)",
        re.IGNORECASE | re.MULTILINE,
    )

    raw_segments = boundary_pattern.split(raw_text)

    chunks: list[dict] = []
    chunk_index = 0

    for segment in raw_segments:
        stripped = segment.strip()
        if not stripped:
            continue
        chunks.append({"chunk_id": f"chunk_{chunk_index}", "text_content": stripped})
        chunk_index += 1

    if not chunks and raw_text.strip():
        chunks.append({"chunk_id": "chunk_0", "text_content": raw_text.strip()})

    return chunks
