import os
from google import genai

from app.core.config import settings
from app.core.gemini_client import get_gemini_client

async def _format_plain_text_to_html(plain_text: str) -> str:
    """
    Dùng LLM convert plain text từ Qdrant → HTML văn bản pháp lý đúng cấu trúc.
    Không thêm/bớt nội dung — chỉ format thuần túy.
    """
    import json
    from google.genai import types

    if not plain_text or plain_text.startswith("Không tìm thấy"):
        return f"<p><em>{plain_text}</em></p>"

    system_instruction = (
        "Bạn là công cụ format văn bản. Nhiệm vụ DUY NHẤT là chuyển plain text "
        "sang HTML thuần cấu trúc, KHÔNG thêm/bớt/diễn giải bất kỳ nội dung nào. "
        "Trả về JSON object với key 'html' chứa chuỗi HTML. KHÔNG có text ngoài JSON."
    )

    user_prompt = f"""
Chuyển đoạn plain text sau sang HTML văn bản pháp lý. Quy tắc format:
- Tiêu đề văn bản → <h1>
- Tên phần/chương → <h2>
- "Điều X. ..." → <h3><strong>Điều X. ...</strong></h3>
- Đoạn văn thường → <p>
- Danh sách có thứ tự (a) b) hoặc 1. 2.) → <ol><li>...</li></ol>
- Danh sách không thứ tự (dấu - hoặc •) → <ul><li>...</li></ul>
- TUYỆT ĐỐI giữ nguyên toàn bộ nội dung, số liệu, tên riêng.

[PLAIN TEXT CẦN FORMAT]
{plain_text}

Trả về: {{"html": "..."}}
"""

    try:
        response = await get_gemini_client().aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.0,
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {"html": {"type": "string"}},
                    "required": ["html"]
                }
            )
        )
        raw = response.text or ""
        result = json.loads(raw.strip())
        return result.get("html", plain_text.replace("\n", "<br/>"))
    except Exception:
        # Fallback: basic newline → <br/>
        return plain_text.replace("\n\n", "</p><p>").replace("\n", "<br/>")


def _resolve_internal_doc(db, task):
    """Xác định văn bản nội bộ (bản cũ) liên quan tới một task.

    Ưu tiên `task.impacted_internal_doc` (khớp theo title). Nếu task không nêu
    rõ (phase 2 không cung cấp field này), thì SEMANTIC SEARCH trong
    internal_collection bằng nội dung task để tìm văn bản cũ phù hợp nhất.

    Trả về (Document | None). Nếu tìm thấy qua search, backfill luôn
    `task.impacted_internal_doc = doc.title` để bước approve → upsert KB dùng
    đúng tên văn bản.
    """
    from app.core.enums import KbType  # noqa: PLC0415
    from app.models.document import Document
    import importlib
    qs = importlib.import_module("app.services.qdrant_service")

    # 1. Nếu task đã nêu rõ văn bản bị ảnh hưởng → tra theo title.
    title = (getattr(task, "impacted_internal_doc", None) or "").strip()
    if title:
        doc = db.query(Document).filter(
            Document.title == title,
            Document.kb_type == KbType.INTERNAL.value,
        ).first()
        if doc:
            return doc

    # 2. Ngược lại → semantic search internal_collection bằng nội dung task.
    query = " ".join(filter(None, [
        str(getattr(task, "task_name", "") or ""),
        str(getattr(task, "action_required", "") or ""),
    ])).strip()
    if not query:
        return None

    try:
        hits = qs.search_chunks(query, KbType.INTERNAL.collection_name, top_k=5)
    except Exception as e:
        import logging
        logging.error(f"Internal KB search failed: {e}")
        return None

    if not hits:
        return None

    best_doc_id = hits[0].get("document_id")
    if best_doc_id is None:
        return None

    doc = db.query(Document).filter(Document.id == best_doc_id).first()
    if doc:
        # Backfill để downstream (FE grouping / approve upsert) có tên văn bản.
        try:
            task.impacted_internal_doc = doc.title
        except Exception:
            pass
    return doc


def _format_internal_doc_html_sync(doc) -> str | None:
    """Phần đồng bộ: fetch chunks của văn bản nội bộ. Trả về plain text hoặc None."""
    from app.core.enums import KbType  # noqa: PLC0415
    import importlib
    qs = importlib.import_module("app.services.qdrant_service")

    chunks = qs.fetch_doc_chunks(
        doc.id, limit=1000, collection_name=KbType.INTERNAL.collection_name
    )
    if not chunks:
        return None

    # Sort chunks by chunk_id if possible (e.g., chunk_0, chunk_1...)
    try:
        chunks.sort(key=lambda c: int(c["chunk_id"].split("_")[-1]) if "_" in c["chunk_id"] else 0)
    except Exception:
        pass

    return "\n\n".join([c.get("text", "") for c in chunks])


async def get_old_document_from_qdrant(task) -> str:
    """Truy xuất và format văn bản cũ từ Qdrant thành HTML.

    Nếu task chưa có `impacted_internal_doc`, hàm sẽ tự search internal KB để
    tìm văn bản cũ phù hợp.
    """
    from app.core.db import SessionLocal

    db = SessionLocal()
    try:
        doc = _resolve_internal_doc(db, task)
        if not doc:
            return "<p><em>Không tìm thấy dữ liệu quy định cũ trong Knowledge Base.</em></p>"
        plain = _format_internal_doc_html_sync(doc)
    finally:
        db.close()

    if not plain:
        return "<p><em>Không tìm thấy nội dung chi tiết của quy định cũ.</em></p>"

    return await _format_plain_text_to_html(plain)


# ĐÃ ĐỔI TÊN HÀM Ở ĐÂY
async def generate_remediation_html(task, mode: str, old_doc: str, refinement_prompt: str = None) -> str:
    """
    Sinh nội dung dưới định dạng HTML (cho document sửa đổi hoặc thông cáo đào tạo).
    Với document mode, trả về JSON chứa modified_document_html và comments.
    Với announcement mode, trả về JSON chứa announcement.
    """
    import json
    
    if mode == "document":
        system_instruction = """
        Bạn là một trợ lý AI chuyên biên soạn văn bản quy chế cho Ngân hàng.
        Công việc của bạn là sinh ra văn bản dưới dạng JSON có chứa HTML đã sửa đổi kèm theo các comment giải thích.
        TUYỆT ĐỐI KHÔNG DÙNG MARKDOWN (```, #, *, -) trong output.
        TRẢ VỀ LÀ JSON OBJECT HOÀN CHỈNH, KHÔNG CÓ TEXT KHÁC NGOÀI JSON.
        """

        user_prompt = f"""
        [THÔNG TIN YÊU CẦU]
        - Tên Task: {task.task_name}
        - Phòng ban thực hiện: {task.target_department}
        - Hành động yêu cầu: {task.action_required}
        - Văn bản nội bộ bị ảnh hưởng: {task.impacted_internal_doc}

        [VĂN BẢN NỘI BỘ GỐC CẦN SỬA ĐỔI]
        {old_doc}

        Nhiệm vụ: Tái tạo TOÀN BỘ văn bản trên thành bản HTML sửa đổi, áp dụng yêu cầu thay đổi nêu trên.

        [QUY TẮC BẮT BUỘC VỀ FORMAT HTML]:
        1. PHẢI tái tạo TOÀN BỘ nội dung văn bản gốc — không được bỏ sót bất kỳ điều, khoản, mục nào.
        2. Giữ nguyên cấu trúc phân cấp của văn bản gốc:
           - Tiêu đề văn bản → <h1>
           - Tên phần/chương → <h2>
           - Tên điều → <h3><strong>Điều X. ...</strong></h3>
           - Nội dung điều khoản → <p>
           - Danh sách có thứ tự (a, b, c hoặc 1, 2, 3) → <ol><li>...</li></ol>
           - Danh sách không thứ tự → <ul><li>...</li></ul>
           - TUYỆT ĐỐI không dùng dấu gạch đầu dòng (-) trong thẻ <p> — nếu là danh sách thì phải dùng <ul> hoặc <ol>
        3. Đối với các thay đổi:
           - Nội dung BỊ XÓA: bọc trong <del>...</del>
           - Nội dung THÊM MỚI hoặc SỬA ĐỔI: bọc trong <ins>...</ins>
           - Các thay đổi đáng chú ý cần comment: bọc thêm trong <mark data-id="comment_1">...</mark>
        4. Số liệu, thời hạn, tên đơn vị phải chính xác theo văn bản gốc và yêu cầu sửa đổi.
        5. Văn phong trang trọng, pháp lý — giữ nguyên từ ngữ gốc trừ phần cần sửa.

        [YÊU CẦU ĐẦU RA JSON]:
        {{
          "modified_document_html": "Toàn bộ HTML văn bản đã sửa đổi theo quy tắc trên",
          "comments": [
            {{
              "id": "comment_1",
              "reason": "Giải thích ngắn gọn tại sao thay đổi này cần thiết",
              "task_name": "{task.task_name}"
            }}
          ]
        }}
        """
    else: # mode == "announcement"
        system_instruction = """
        Bạn là một trợ lý AI chuyên biên soạn thông cáo đào tạo cho Ngân hàng.
        Công việc là sinh ra HTML thông cáo đào tạo chuyên nghiệp, không dùng Markdown.
        TRẢ VỀ JSON OBJECT với key "announcement" chứa HTML, KHÔNG CÓ TEXT KHÁC NGOÀI JSON.
        """

        user_prompt = f"""
        [THÔNG TIN YÊU CẦU]
        - Tên Task: {task.task_name}
        - Đối tượng nhận: Toàn bộ nhân viên, đặc biệt là {task.target_department}.
        - Nội dung thay đổi: {task.action_required}

        Dựa vào các thông tin trên, hãy sinh ra "Thông cáo đào tạo / thông báo nội bộ".
        
        [YÊU CẦU ĐẦU RA JSON]:
        Bạn PHẢI trả về một JSON object hoàn toàn hợp lệ (KHÔNG CÓ markdown hay text bên ngoài):
        {{
          "announcement": "Toàn bộ nội dung thông cáo dưới dạng HTML sử dụng các thẻ <h1>, <h2>, <h3>, <p>, <ul>, <li>..."
        }}

        Ghi rõ: Kênh gửi (ví dụ: Email nội bộ), Đối tượng nhận, Tiêu đề, và Nội dung chính.
        Văn phong chuyên nghiệp, rõ ràng.
        """

    if refinement_prompt:
        user_prompt += f"\n\n[YÊU CẦU TINH CHỈNH TỪ NGƯỜI DÙNG]\n{refinement_prompt}\nHãy sinh lại toàn bộ JSON dựa trên yêu cầu tinh chỉnh này. TUYỆT ĐỐI CHỈ TRẢ VỀ JSON, KHÔNG CÓ EXPLANATION HAY TEXT KHÁC."
    
    try:
        from google.genai import types
        
        # Schema cho document mode
        if mode == "document":
            response_schema = {
                "type": "object",
                "properties": {
                    "modified_document_html": {
                        "type": "string",
                        "description": "HTML content of modified document"
                    },
                    "comments": {
                        "type": "array",
                        "description": "Array of comments explaining changes",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "reason": {"type": "string"},
                                "task_name": {"type": "string"}
                            }
                        }
                    }
                },
                "required": ["modified_document_html", "comments"]
            }
        else:  # announcement mode
            response_schema = {
                "type": "object",
                "properties": {
                    "announcement": {
                        "type": "string",
                        "description": "HTML content of announcement"
                    }
                },
                "required": ["announcement"]
            }
        
        response = await get_gemini_client().aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.3,
                response_mime_type="application/json",
                response_schema=response_schema
            )
        )
        
        text = response.text.strip()
        result = json.loads(text)
        return json.dumps(result, ensure_ascii=False)
        
    except json.JSONDecodeError as e:
        import logging
        logging.error(f"JSON parse error in generate_remediation_html: {e}, text: {text[:500] if 'text' in locals() else 'N/A'}")
        if mode == "document":
            return json.dumps({
                "modified_document_html": f"<p style='color: red;'>Lỗi sinh văn bản AI (JSON parse): {str(e)}</p>",
                "comments": []
            }, ensure_ascii=False)
        else:
            return json.dumps({
                "announcement": f"<p style='color: red;'>Lỗi sinh văn bản AI (JSON parse): {str(e)}</p>"
            }, ensure_ascii=False)
    except Exception as e:
        import logging
        logging.error(f"LLM generation error in generate_remediation_html: {e}")
        if mode == "document":
            return json.dumps({
                "modified_document_html": f"<p style='color: red;'>Lỗi sinh văn bản AI: {str(e)}</p>",
                "comments": []
            }, ensure_ascii=False)
        else:
            return json.dumps({
                "announcement": f"<p style='color: red;'>Lỗi sinh văn bản AI: {str(e)}</p>"
            }, ensure_ascii=False)


async def get_old_document_from_qdrant_group(tasks: list) -> str:
    """Truy xuất và format văn bản cũ từ Qdrant cho nhóm task thành HTML.

    Cả nhóm chia sẻ chung 1 văn bản nội bộ. Nếu chưa task nào nêu rõ
    `impacted_internal_doc`, search internal KB bằng nội dung gộp của nhóm.
    Văn bản tìm được sẽ backfill cho TẤT CẢ task trong nhóm.
    """
    from app.core.db import SessionLocal

    if not tasks:
        return "<p><em>Không có tác vụ nào để truy xuất quy định cũ.</em></p>"

    db = SessionLocal()
    try:
        # Dùng task đầu tiên (đã được gộp theo cùng văn bản) làm đại diện resolve.
        doc = _resolve_internal_doc(db, tasks[0])
        if not doc:
            return "<p><em>Không tìm thấy dữ liệu quy định cũ trong Knowledge Base.</em></p>"

        # Backfill title cho mọi task còn lại trong nhóm.
        for t in tasks[1:]:
            try:
                t.impacted_internal_doc = doc.title
            except Exception:
                pass

        plain = _format_internal_doc_html_sync(doc)
    finally:
        db.close()

    if not plain:
        return "<p><em>Không tìm thấy nội dung chi tiết của quy định cũ.</em></p>"

    return await _format_plain_text_to_html(plain)


# ĐÃ ĐỔI TÊN HÀM Ở ĐÂY
async def generate_remediation_html_group(tasks: list, mode: str, old_doc: str, refinement_prompt: str = None) -> str:
    """
    Sinh nội dung dưới định dạng HTML cho một nhóm các task cùng tác động lên 1 văn bản.
    """
    import json
    
    if not tasks:
        return json.dumps({
            "modified_document_html": "<p>Không có tác vụ nào được chọn.</p>",
            "comments": []
        }, ensure_ascii=False)

    if mode == "document":
        task_info_list = []
        for i, t in enumerate(tasks, 1):
            task_info_list.append(f"""
        [TASK {i}]
        - Tên Task: {t.task_name}
        - Phòng ban thực hiện: {t.target_department}
        - Hành động yêu cầu sửa đổi: {t.action_required}
            """)
        tasks_info = "\n".join(task_info_list)

        system_instruction = """
        Bạn là một trợ lý AI chuyên biên soạn văn bản quy chế cho Ngân hàng.
        Công việc của bạn là sinh ra văn bản dưới dạng JSON có chứa HTML đã sửa đổi kèm theo các comment giải thích.
        TUYỆT ĐỐI KHÔNG DÙNG MARKDOWN (```, #, *, -) trong output.
        TRẢ VỀ LÀ JSON OBJECT HOÀN CHỈNH, KHÔNG CÓ TEXT KHÁC NGOÀI JSON.
        """

        user_prompt = f"""
        [THÔNG TIN CÁC YÊU CẦU SỬA ĐỔI]
        {tasks_info}

        - Văn bản nội bộ bị ảnh hưởng chung: {tasks[0].impacted_internal_doc}

        [VĂN BẢN NỘI BỘ GỐC CẦN SỬA ĐỔI]
        {old_doc}

        Nhiệm vụ: Tái tạo TOÀN BỘ văn bản trên thành bản HTML sửa đổi, áp dụng tất cả các yêu cầu thay đổi nêu trên.

        [QUY TẮC BẮT BUỘC VỀ FORMAT HTML]:
        1. PHẢI tái tạo TOÀN BỘ nội dung văn bản gốc — không được bỏ sót bất kỳ điều, khoản, mục nào.
        2. Giữ nguyên cấu trúc phân cấp của văn bản gốc:
           - Tiêu đề văn bản → <h1>
           - Tên phần/chương → <h2>
           - Tên điều → <h3><strong>Điều X. ...</strong></h3>
           - Nội dung điều khoản → <p>
           - Danh sách có thứ tự (a, b, c hoặc 1, 2, 3) → <ol><li>...</li></ol>
           - Danh sách không thứ tự → <ul><li>...</li></ul>
           - TUYỆT ĐỐI không dùng dấu gạch đầu dòng (-) trong thẻ <p> — nếu là danh sách thì phải dùng <ul> hoặc <ol>
        3. Đối với các thay đổi:
           - Nội dung BỊ XÓA: bọc trong <del>...</del>
           - Nội dung THÊM MỚI hoặc SỬA ĐỔI: bọc trong <ins>...</ins>
           - Các thay đổi ĐÁng chú ý cần comment: bọc thêm trong <mark data-id="comment_1">...</mark> (tăng số ID theo thứ tự)
        4. Số liệu, thời hạn, tên đơn vị phải chính xác theo văn bản gốc và yêu cầu sửa đổi.
        5. Văn phong trang trọng, pháp lý — giữ nguyên từ ngữ gốc trừ phần cần sửa.

        [YÊU CẦU ĐẦU RA JSON]:
        {{
          "modified_document_html": "Toàn bộ HTML văn bản đã sửa đổi theo quy tắc trên",
          "comments": [
            {{
              "id": "comment_1",
              "reason": "Giải thích ngắn gọn tại sao thay đổi này cần thiết",
              "task_name": "Tên Task liên quan"
            }}
          ]
        }}
        """
    else: # mode == "announcement"
        task_info_list = []
        for i, t in enumerate(tasks, 1):
            task_info_list.append(f"- Thay đổi {i}: {t.action_required} ({t.task_name})")
        changes_info = "\n".join(task_info_list)

        system_instruction = """
        Bạn là một trợ lý AI chuyên biên soạn thông cáo đào tạo cho Ngân hàng.
        Công việc là sinh ra HTML thông cáo đào tạo chuyên nghiệp, không dùng Markdown.
        TRẢ VỀ JSON OBJECT với key "announcement" chứa HTML, KHÔNG CÓ TEXT KHÁC NGOÀI JSON.
        """

        user_prompt = f"""
        [DANH SÁCH THAY ĐỔI]
        {changes_info}
        - Đối tượng nhận: Toàn bộ nhân viên, đặc biệt là các phòng ban: {', '.join(list(set([t.target_department for t in tasks])))}.

        Dựa vào danh sách thông tin trên, hãy sinh ra "Thông cáo đào tạo / thông báo nội bộ" chung cho toàn bộ các thay đổi này.
        
        [YÊU CẦU ĐẦU RA JSON]:
        Bạn PHẢI trả về một JSON object hoàn toàn hợp lệ (KHÔNG CÓ markdown hay text bên ngoài):
        {{
          "announcement": "Toàn bộ nội dung thông cáo dưới dạng HTML sử dụng các thẻ <h1>, <h2>, <h3>, <p>, <ul>, <li>..."
        }}

        Bạn phải viết theo đúng FORMAT MẪU DƯỚI ĐÂY:
        
        [FORMAT MẪU BẮT BUỘC - VIẾT TRONG HTML]
        <h1>THÔNG CÁO ĐÀO TẠO NỘI BỘ</h1>
        <p style="font-size: 0.9em; color: #666;">(Mẫu tài liệu truyền thông dùng cho hệ thống Portal/Email để phổ biến quy trình mới)</p>

        <p><strong>NGÂN HÀNG TMCP SÀI GÒN - HÀ NỘI (SHB) KHỐI TUÂN THỦ & QUẢN TRỊ RỦI RO</strong></p>
        <p>Số: [SỰ TỰ ĐỘNG] <br/>
        Hà Nội, ngày [NGÀY HIỆN TẠI]</p>

        <h2>THÔNG CÁO ĐÀO TẠO</h2>
        <p><strong>V/v [Chủ đề chung của đợt đào tạo]</strong></p>

        <p>Kính gửi: [Các khối/phòng ban liên quan]</p>

        <h3>1. Mục đích và Căn cứ thay đổi</h3>
        <p>[Mô tả mục đích và căn cứ dựa vào danh sách thay đổi...]</p>

        <h3>2. Các nội dung quy trình mới cốt lõi CBNV cần ghi nhớ</h3>
        <ul>
        <li>[Điểm thay đổi 1]</li>
        <li>[Điểm thay đổi 2]</li>
        </ul>

        <h3>3. Kế hoạch đào tạo và Kiểm tra năng lực</h3>
        <p>[Chi tiết kế hoạch đào tạo...]</p>

        <h3>4. Tổ chức thực hiện và Chế tài áp dụng</h3>
        <p>[Trách nhiệm của các khối và chế tài...]</p>
        
        <p><strong>TRƯỞNG KHỐI TUÂN THỦ & QUẢN TRỊ RỦI RO</strong><br/>
        (Đã ký)</p>
        """

    if refinement_prompt:
        user_prompt += f"\n\n[YÊU CẦU TINH CHỈNH TỪ NGƯỜI DÙNG]\n{refinement_prompt}\nHãy sinh lại toàn bộ JSON dựa trên yêu cầu tinh chỉnh này. TUYỆT ĐỐI CHỈ TRẢ VỀ JSON, KHÔNG CÓ EXPLANATION HAY TEXT KHÁC."

    try:
        from google.genai import types
        
        # Sử dụng response_schema để buộc JSON format
        response_schema = {
            "type": "object",
            "properties": {
                "modified_document_html" if mode == "document" else "announcement": {
                    "type": "string",
                    "description": "HTML content"
                },
                "comments": {
                    "type": "array",
                    "description": "Array of comments (only for document mode)",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "reason": {"type": "string"},
                            "task_name": {"type": "string"}
                        }
                    }
                } if mode == "document" else None
            },
            "required": ["modified_document_html"] if mode == "document" else ["announcement"]
        }
        
        # Lọc out None values từ schema
        if mode == "announcement":
            response_schema["properties"].pop("comments", None)
        
        response = await get_gemini_client().aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.3,
                response_mime_type="application/json",
                response_schema=response_schema
            )
        )
        
        text = response.text.strip()
        # Đảm bảo response là JSON hợp lệ
        result = json.loads(text)
        return json.dumps(result, ensure_ascii=False)
        
    except json.JSONDecodeError as e:
        import logging
        logging.error(f"JSON parse error: {e}, text: {text[:500]}")
        # Fallback: trả về JSON error response
        return json.dumps({
            "modified_document_html" if mode == "document" else "announcement": f"<p style='color: red;'>Lỗi sinh văn bản AI (JSON parse): {str(e)}</p>",
            "comments": [] if mode == "document" else None
        }, ensure_ascii=False)
    except Exception as e:
        import logging
        logging.error(f"LLM generation error: {e}")
        return json.dumps({
            "modified_document_html" if mode == "document" else "announcement": f"<p style='color: red;'>Lỗi sinh văn bản AI: {str(e)}</p>",
            "comments": [] if mode == "document" else None
        }, ensure_ascii=False)
