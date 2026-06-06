import os
from google import genai

from app.core.config import settings
from app.core.gemini_client import get_gemini_client

async def get_old_document_from_qdrant(task) -> str:
    """Truy xuất văn bản cũ từ Qdrant."""
    from app.services.qdrant_service import search_chunks
    from app.core.enums import KbType
    
    query = f"{task.impacted_internal_doc} {task.action_required} {task.task_name}"
    chunks = search_chunks(query, collection_name=KbType.INTERNAL.collection_name, top_k=3)
    
    if chunks:
        # Gộp các chunk lại
        return "\n\n".join([chunk.get("text", "") for chunk in chunks])
    return "Không tìm thấy dữ liệu quy định cũ trong Knowledge Base."


# ĐÃ ĐỔI TÊN HÀM Ở ĐÂY
async def generate_remediation_html(task, mode: str, old_doc: str, refinement_prompt: str = None) -> str:
    """
    Sinh nội dung dưới định dạng HTML (cho document sửa đổi hoặc thông cáo đào tạo).
    """
    
    system_instruction = """
    Bạn là một trợ lý AI thông minh cho Ngân hàng.
    Nhiệm vụ của bạn là sinh ra văn bản dưới định dạng HTML (Sử dụng các thẻ <h1>, <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <ins>, <del>).
    TUYỆT ĐỐI KHÔNG SỬ DỤNG MARKDOWN.
    TRẢ VỀ RAW HTML STRINGS, KHÔNG BAO BỌC TRONG ```html.
    """

    if mode == "document":
        user_prompt = f"""
        [THÔNG TIN YÊU CẦU]
        - Tên Task: {task.task_name}
        - Phòng ban thực hiện: {task.target_department}
        - Hành động yêu cầu: {task.action_required}
        - Văn bản nội bộ bị ảnh hưởng: {task.impacted_internal_doc}

        [QUY ĐỊNH NỘI BỘ CŨ (THAM KHẢO)]
        {old_doc}

        Dựa vào các thông tin trên, hãy sinh ra "Văn bản quy chế (Sửa đổi)".
        Các quy tắc:
        - Văn bản phải trang trọng, chính xác.
        - ĐỐI VỚI CÁC ĐOẠN BỊ XÓA so với quy định cũ, bao bọc trong thẻ <del>nội dung bị xóa</del>.
        - ĐỐI VỚI CÁC ĐOẠN THÊM MỚI, bao bọc trong thẻ <ins>nội dung thêm mới</ins>.
        """
    else: # mode == "announcement"
        user_prompt = f"""
        [THÔNG TIN YÊU CẦU]
        - Tên Task: {task.task_name}
        - Đối tượng nhận: Toàn bộ nhân viên, đặc biệt là {task.target_department}.
        - Nội dung thay đổi: {task.action_required}

        Dựa vào các thông tin trên, hãy sinh ra "Thông cáo đào tạo / thông báo nội bộ".
        Ghi rõ Kênh gửi (ví dụ: Email nội bộ), Đối tượng nhận, Tiêu đề, và Nội dung chính.
        Văn phong chuyên nghiệp, rõ ràng.
        """

    if refinement_prompt:
        user_prompt += f"\n\n[YÊU CẦU TINH CHỈNH TỪ NGƯỜI DÙNG]\n{refinement_prompt}\nHãy sinh lại bản HTML dựa trên yêu cầu tinh chỉnh này."
    
    try:
        from google.genai import types
        response = await get_gemini_client().aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.4
            )
        )
        # Clean potential markdown wrappers
        text = response.text.strip()
        if text.startswith("```html"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()
    except Exception as e:
        return f"<p style='color: red;'>Lỗi sinh văn bản AI: {str(e)}</p>"


async def get_old_document_from_qdrant_group(tasks: list) -> str:
    """Truy xuất văn bản cũ từ Qdrant cho một nhóm các task cùng tác động 1 văn bản."""
    from app.services.qdrant_service import search_chunks
    from app.core.enums import KbType
    
    if not tasks:
        return "Không có tác vụ nào để truy xuất quy định cũ."
        
    doc_name = tasks[0].impacted_internal_doc or ""
    actions = " ".join([t.action_required for t in tasks])
    query = f"{doc_name} {actions}"
    
    chunks = search_chunks(query, collection_name=KbType.INTERNAL.collection_name, top_k=4)
    if chunks:
        return "\n\n".join([chunk.get("text", "") for chunk in chunks])
    return "Không tìm thấy dữ liệu quy định cũ trong Knowledge Base."


# ĐÃ ĐỔI TÊN HÀM Ở ĐÂY
async def generate_remediation_html_group(tasks: list, mode: str, old_doc: str, refinement_prompt: str = None) -> str:
    """
    Sinh nội dung dưới định dạng HTML cho một nhóm các task cùng tác động lên 1 văn bản.
    """
    if not tasks:
        return "<p>Không có tác vụ nào được chọn.</p>"

    system_instruction = """
    Bạn là một trợ lý AI thông minh cho Ngân hàng.
    """

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

        user_prompt = f"""
        [THÔNG TIN CÁC YÊU CẦU SỬA ĐỔI]
        {tasks_info}

        - Văn bản nội bộ bị ảnh hưởng chung: {tasks[0].impacted_internal_doc}

        [QUY ĐỊNH NỘI BỘ CŨ (THAM KHẢO)]
        {old_doc}

        Dựa vào danh sách các nhiệm vụ sửa đổi trên, hãy sinh ra MỘT "Văn bản quy chế (Sửa đổi)" duy nhất áp dụng tất cả các thay đổi này vào văn bản quy định cũ.
        
        [YÊU CẦU ĐẦU RA JSON BẮT BUỘC]:
        Bạn PHẢI trả về duy nhất một chuỗi JSON hợp lệ theo cấu trúc sau, TUYỆT ĐỐI KHÔNG chứa Markdown (như ```json) hay text nào khác ngoài JSON:
        {{
          "modified_document_html": "Toàn bộ HTML của văn bản đã được sửa đổi (Dùng <h1>, <h2>, <p>...). QUAN TRỌNG: Với các đoạn nội dung mới thêm vào hoặc bị sửa đổi, hãy bọc chúng trong thẻ <mark data-id='ID_CỦA_COMMENT'>nội dung</mark> để tôi có thể làm highlight.",
          "comments": [
            {{
              "id": "1", // Phải khớp với data-id trong thẻ mark ở trên
              "reason": "Lý do thay đổi này là gì (giải thích ngắn gọn)",
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

        user_prompt = f"""
        [DANH SÁCH THAY ĐỔI]
        {changes_info}
        - Đối tượng nhận: Toàn bộ nhân viên, đặc biệt là các phòng ban: {', '.join(list(set([t.target_department for t in tasks])))}.

        Dựa vào danh sách thông tin trên, hãy sinh ra "Thông cáo đào tạo / thông báo nội bộ" chung cho toàn bộ các thay đổi này.
        TRẢ VỀ RAW HTML STRINGS, KHÔNG BAO BỌC TRONG ```html.

        Bạn phải viết theo đúng FORMAT MẪU DƯỚI ĐÂY (dùng các thẻ HTML phù hợp <h1>, <h2>, <p>...):

        [FORMAT MẪU BẮT BUỘC]
        THÔNG CÁO ĐÀO TẠO NỘI BỘ
        (Mẫu tài liệu truyền thông dùng cho hệ thống Portal/Email để phổ biến quy trình mới)

        NGÂN HÀNG TMCP SÀI GÒN - HÀ NỘI (SHB) KHỐI TUÂN THỦ & QUẢN TRỊ RỦI RO
        Số: ... 
        Hà Nội, ngày ...

        THÔNG CÁO ĐÀO TẠO
        V/v [Chủ đề chung của đợt đào tạo]

        Kính gửi: [Các khối/phòng ban liên quan]

        1. Mục đích và Căn cứ thay đổi
        [Mô tả mục đích và căn cứ dựa vào danh sách thay đổi...]

        2. Các nội dung quy trình mới cốt lõi CBNV cần ghi nhớ
        [Liệt kê chi tiết các điểm thay đổi quan trọng phân theo từng khối dựa vào danh sách thay đổi...]

        3. Kế hoạch đào tạo và Kiểm tra năng lực
        [Sinh ra chi tiết kế hoạch đào tạo...]

        4. Tổ chức thực hiện và Chế tài áp dụng
        [Sinh ra trách nhiệm của các khối và chế tài...]
        
        TRƯỞNG KHỐI TUÂN THỦ & QUẢN TRỊ RỦI RO (Đã ký)
        """

    if refinement_prompt:
        user_prompt += f"\n\n[YÊU CẦU TINH CHỈNH TỪ NGƯỜI DÙNG]\n{refinement_prompt}\nHãy sinh lại bản HTML dựa trên yêu cầu tinh chỉnh này."

    try:
        from google.genai import types
        response = await get_gemini_client().aio.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.4
            )
        )
        text = response.text.strip()
        if text.startswith("```html"):
            text = text[7:]
        if text.endswith("```"):
            text = text[:-3]
        return text.strip()
    except Exception as e:
        return f"<p style='color: red;'>Lỗi sinh văn bản AI: {str(e)}</p>"