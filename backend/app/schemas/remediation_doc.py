from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class RemediationDocResponse(BaseModel):
    """
    [Mục đích]: Định dạng dữ liệu trả về (Output) cho thông tin của một Văn bản Khắc phục (Sửa đổi/Đào tạo) đã được sinh ra.
    
    [Các trường dữ liệu trả về]:
    - id, task_id: Định danh của document và task tương ứng.
    - content: Nội dung văn bản sinh ra (định dạng JSON string chứa HTML/Markdown).
    - product_approved, cd_approved: Trạng thái chữ ký duyệt của 2 khối.
    - status: DRAFT, PENDING, hoặc APPROVED.
    - created_at, updated_at: Thời gian tạo/cập nhật.
    
    [Sử dụng ở đâu]: Làm output cho các API GET, POST sinh văn bản, PUT update và POST approve.
    """
    id: int
    task_id: int
    content: Optional[str] = None
    product_approved: bool
    cd_approved: bool
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ActionPlanTaskResponse(BaseModel):
    """
    [Mục đích]: Định dạng dữ liệu trả về (Output) cho thông tin chi tiết của một Task (Đầu việc) trong Kế hoạch.
    
    [Các trường dữ liệu trả về]:
    - action_plan_id, task_code, task_name, target_department, action_required: Thông tin gốc của Task.
    - impacted_internal_doc: Tên quy chế/văn bản nội bộ bị ảnh hưởng.
    - output_type: VĂN_BẢN_SỬA_ĐỔI hoặc VĂN_BẢN_ĐÀO_TẠO_NỘI_BỘ.
    - document: ĐÂY LÀ ĐIỂM ĂN TIỀN -> Lồng luôn dữ liệu `RemediationDocResponse` (Văn bản AI đã sinh) vào bên trong Task nếu có.
    """
    id: int
    action_plan_id: int
    task_code: str
    task_name: str
    target_department: str
    action_required: str
    impacted_internal_doc: Optional[str] = None
    output_type: str
    # ĐÃ ĐỔI TÊN Ở ĐÂY: Phase3DocumentResponse -> RemediationDocResponse
    document: Optional[RemediationDocResponse] = None

    class Config:
        from_attributes = True


class ActionPlanResponse(BaseModel):
    """
    [Mục đích]: Định dạng dữ liệu trả về (Output) ở tầng cao nhất, đại diện cho một Kế hoạch hành động tổng thể.
    
    [Các trường dữ liệu trả về]:
    - plan_code, law_id, law_title...: Thông tin tổng quan của plan.
    - tasks: Trả về một Mảng (List) các `ActionPlanTaskResponse` đã lồng ở trên.
    
    [Sử dụng ở đâu]: Là Output cho API `GET /remediation/action-plans`. FE chỉ cần gọi 1 API này là lấy được cả cây dữ liệu (Plan -> Tasks -> Documents).
    """
    id: int
    plan_code: str
    law_id: Optional[str] = None
    law_title: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    ceo_approved_at: Optional[datetime] = None
    tasks: List[ActionPlanTaskResponse] = []

    class Config:
        from_attributes = True


class DocumentGenerateRequest(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) từ Frontend gửi lên khi yêu cầu AI sinh văn bản cho 1 Task.
    
    [Các tham số truyền vào (Body JSON)]:
    - task_id (int): Bắt buộc. ID của task cần sinh văn bản.
    - refinement_prompt (str, Optional): Lời nhắc/Yêu cầu sửa chữa thêm từ Sếp nhập vào ô Chat (Ví dụ: "Viết ngắn lại").
    - generation_type (str): "document" (Văn bản pháp chế) hoặc "announcement" (Bản tin đào tạo).
    """
    task_id: int
    refinement_prompt: Optional[str] = None
    generation_type: str = "document" # "document" or "announcement"


class RemediationDocUpdate(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) khi Chuyên viên tự sửa text bằng tay trên giao diện (Không xài AI).
    
    [Các tham số truyền vào (Body JSON)]:
    - content (str): Bắt buộc. Chuỗi nội dung mới nhất sau khi user đã sửa xong.
    """
    # ĐÃ ĐỔI TÊN Ở ĐÂY: Phase3DocumentUpdate -> RemediationDocUpdate
    content: str


class ApprovalRequest(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) khi User bấm nút Phê duyệt trên giao diện.
    
    [Các tham số truyền vào (Body JSON)]:
    - role (str): Bắt buộc. Xác định ai là người đang duyệt, chỉ nhận "product" (Khối Sản phẩm) hoặc "cd" (Khối Tuân thủ).
    """
    role: str  # "product" or "cd"


class GroupDocumentGenerateRequest(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) từ Frontend để gọi AI sinh GỘP một văn bản chung cho nhiều Task cùng lúc.
    
    [Các tham số truyền vào (Body JSON)]:
    - task_ids (List[int]): Mảng chứa các ID của các task cần gộp (vd: [1, 2, 3]).
    - refinement_prompt (str, Optional): Yêu cầu tinh chỉnh thêm từ người dùng.
    - generation_type (str): Loại văn bản cần sinh ("document" hoặc "announcement").
    """
    task_ids: List[int]
    refinement_prompt: Optional[str] = None
    generation_type: str = "document"