from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class DraftVersionResponse(BaseModel):
    """Thông tin một bản nháp đã lưu."""
    id: int
    remediation_doc_id: int
    content: Optional[str] = None
    saved_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RemediationDocResponse(BaseModel):
    """
    [Mục đích]: Định dạng dữ liệu trả về (Output) cho thông tin của một Văn bản Khắc phục (Sửa đổi/Đào tạo) đã được sinh ra.
    
    [Các trường dữ liệu trả về]:
    - id, plan_id, task_id: Định danh của document và task tương ứng.
    - content: Nội dung văn bản sinh ra (định dạng JSON string chứa HTML/Markdown).
    - product_approved, cd_approved: Trạng thái chữ ký duyệt của 2 khối.
    - status: DRAFT, PENDING, hoặc APPROVED.
    - created_at, updated_at: Thời gian tạo/cập nhật.
    
    [Sử dụng ở đâu]: Làm output cho các API GET, POST sinh văn bản, PUT update và POST approve.
    """
    id: int
    plan_id: str
    task_id: str
    content: Optional[str] = None
    product_approved: bool
    cd_approved: bool
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentGenerateRequest(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) từ Frontend gửi lên khi yêu cầu AI sinh văn bản cho 1 Task.
    
    [Các tham số truyền vào (Body JSON)]:
    - plan_id (str): Bắt buộc. ID của action plan.
    - task_id (str): Bắt buộc. ID của task cần sinh văn bản.
    - refinement_prompt (str, Optional): Lời nhắc/Yêu cầu sửa chữa thêm từ Sếp nhập vào ô Chat (Ví dụ: "Viết ngắn lại").
    - generation_type (str): "document" (Văn bản pháp chế) hoặc "announcement" (Bản tin đào tạo).
    """
    plan_id: str
    task_id: str
    refinement_prompt: Optional[str] = None
    generation_type: str = "document"


class RemediationDocUpdate(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) khi Chuyên viên tự sửa text bằng tay trên giao diện (Không xài AI).
    
    [Các tham số truyền vào (Body JSON)]:
    - content (str): Bắt buộc. Chuỗi nội dung mới nhất sau khi user đã sửa xong.
    """
    content: str


class ApprovalRequest(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) khi User bấm nút Phê duyệt trên giao diện.
    
    [Các tham số truyền vào (Body JSON)]:
    - role (str): Bắt buộc. Xác định ai là người đang duyệt, chỉ nhận "product" (Khối Sản phẩm) hoặc "cd" (Khối Tuân thủ).
    """
    role: str  # "product" or "cd"


class GroupDocumentGenerateTask(BaseModel):
    plan_id: str
    task_id: str


class GroupDocumentGenerateRequest(BaseModel):
    """
    [Mục đích]: Nhận dữ liệu đầu vào (Input) từ Frontend để gọi AI sinh GỘP một văn bản chung cho nhiều Task cùng lúc.
    
    [Các tham số truyền vào (Body JSON)]:
    - tasks (List[GroupDocumentGenerateTask]): Mảng chứa thông tin plan_id và task_id của các task cần gộp.
    - refinement_prompt (str, Optional): Yêu cầu tinh chỉnh thêm từ người dùng.
    - generation_type (str): Loại văn bản cần sinh ("document" hoặc "announcement").
    """
    tasks: List[GroupDocumentGenerateTask]
    refinement_prompt: Optional[str] = None
    generation_type: str = "document"


class SaveDraftRequest(BaseModel):
    """Nhận content khi user ấn nút Lưu bản nháp."""
    content: str
    saved_by: Optional[str] = None