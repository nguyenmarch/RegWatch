# app/utils/text_processor.py

def clean_legal_text(raw_text: str) -> str:
    """
    # TODO: Clean raw text before chunking (Remove redundant whitespaces, normalize Vietnamese signs).
    Args:
        raw_text (str): Input text from PDF/OCR
    Returns:
        str: Cleaned text
    """
    # TODO: Write regex to clean text
    return raw_text.strip()