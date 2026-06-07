"""Mapping cố định: Khối (target_department trên alert) → văn bản nội bộ (title trong KB).

Mỗi khối sở hữu đúng 1 văn bản quy chế nội bộ trong internal_collection. Alert gửi
sang dùng tên hiển thị có dấu ("Khối Công nghệ"), còn document title được lưu dạng
chuẩn hóa không dấu ("khoicongnghe"). Bảng dưới đây ánh xạ tên khối → title.
"""

import unicodedata


def normalize_department(name: str) -> str:
    """Chuẩn hóa tên khối: bỏ dấu, bỏ ký tự không phải chữ/số, lowercase.

    "Khối Công nghệ" → "khoicongnghe"; "Ban Điều hành (BOD)" → "bandieuhanhbod".
    """
    decomposed = unicodedata.normalize("NFD", name or "")
    no_accent = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return "".join(ch for ch in no_accent.lower() if ch.isalnum())


# Bảng mapping cố định: key = tên khối đã chuẩn hóa, value = title document trong KB.
# Thêm alias ở đây khi có cách gọi khác cho cùng một khối.
DEPARTMENT_DOC_MAP: dict[str, str] = {
    "khoicongnghe": "khoicongnghe",
    "khoivanhanh": "khoivanhanh",
    "khoiphapche": "khoiphapche",
    "khoimarketing": "khoimarketing",
    "bod": "bod",
    "bandieuhanh": "bod",
    "bandieuhanhbod": "bod",
}


def resolve_internal_doc_title(department: str) -> str | None:
    """Trả về title văn bản nội bộ của khối, hoặc None nếu không xác định được.

    Ưu tiên bảng mapping cố định; nếu không có alias khớp, fallback về chính tên
    khối đã chuẩn hóa (vì title vốn được lưu theo đúng quy ước này).
    """
    norm = normalize_department(department)
    if not norm:
        return None
    return DEPARTMENT_DOC_MAP.get(norm, norm)
