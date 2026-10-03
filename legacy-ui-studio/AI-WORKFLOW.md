# Dùng selector đã inspect để nhờ AI viết workflow

Copy selector ở menu chuột phải, lưu mỗi selector vào một file JSON. Đưa các selector và phần hợp đồng bên dưới cho AI; yêu cầu giữ nguyên target, chỉ thêm hành động và wait theo nghiệp vụ.

## Prompt mẫu

> Viết `flow.json` cho Python Legacy UI Studio dựa trên các file selector tôi cung cấp. Không tự tạo AutomationId, HWND, RuntimeId hoặc đoán tọa độ. UI legacy cố định; dùng selector đã inspect. Mỗi action làm đúng một việc. Dùng `set_value` cho ValuePattern, `invoke` cho InvokePattern; chỉ dùng chuột/phím khi tôi chỉ định. Chèn wait có timeout để xác nhận kết quả sau thao tác. Không retry nút Save/Submit khi chưa kiểm tra kết quả.

## File selector

```json
{
  "schema_version": 1,
  "backend": "uia",
  "tree_view": "raw",
  "root": {"name": "Legacy Pane Lab", "process_name": "PaneDemo.exe"},
  "steps": [
    {"axis": "descendant", "match": {"name": "Customer form", "class_name": "LegacyForm"}},
    {"axis": "child", "child_index": 1, "match": {"control_type": "Pane", "class_name": "LegacyField"}}
  ]
}
```

`child_index` chọn trong toàn bộ direct children. `match_index` lọc theo `match` trước rồi mới chọn. Không dùng cả hai trong một step. Không có index nghĩa là phải match duy nhất. `name_regex` và `class_name_regex` được hỗ trợ. Tránh match chính xác `name` của status text nếu nó thay đổi theo kết quả; ưu tiên AutomationId khi thực tế có sẵn, hoặc index/class.

## `flow.json` cho CLI

Đường dẫn selector tính từ thư mục chứa flow:

```json
{
  "actions": [
    {"action": "wait", "selector": "selectors/customer_name.json", "condition": "enabled", "wait_seconds": 10, "poll_seconds": 0.2},
    {"action": "set_value", "selector": "selectors/customer_name.json", "value": "Cong ty Minh An"},
    {"action": "invoke", "selector": "selectors/save_button.json"},
    {"action": "wait", "selector": "selectors/result.json", "condition": "name_contains", "value": "SAVED", "wait_seconds": 10, "poll_seconds": 0.2}
  ]
}
```

Các action bổ sung:

```json
{"action":"click","selector":"button.json"}
{"action":"key","selector":"input.json","value":"Ctrl+A"}
{"action":"type_text","selector":"input.json","value":"new text"}
{"action":"sleep","seconds":1.5}
{"action":"highlight","selector":"input.json"}
```

Wait conditions: `exists`, `absent`, `enabled`, `visible`, `value` (equals), `name` (equals), `name_contains`.

Chạy: `.venv\Scripts\python.exe -m legacy_ui --timeout 120 replay --flow flow.json --out run.json`.

## Mở workflow AI trong web GUI

Web project dùng `workflow.json` với `target` là tên selector, không có `.json`, thay cho `selector` là đường dẫn. Đặt selector vào `projects/default/selectors/<target>.json`, đặt `workflow.json` trong `projects/default`, rồi khởi động lại agent. Export project cung cấp sẵn cả hai định dạng.

```json
{"schema_version":1,"actions":[{"action":"set_value","target":"customer_name","value":"Cong ty Minh An"}]}
```

Thư viện Python có thể gọi `legacy_ui.core.resolve` và `legacy_ui.playback.perform` trực tiếp; CLI phù hợp khi cần giới hạn thời gian cho cả COM worker process.

## Activities v0.2: fill, send keys, Pane offset, MSAA, Win32

Không cần LLM để dùng công cụ: workflow do người dùng viết hoặc cấu hình bằng web GUI được thực thi hoàn toàn local. Các trường bên dưới dùng chung cho CLI và GUI; GUI thay `selector` bằng `target`.

```json
{"action":"fill","selector":"input.json","value":"Mã Việt 123","activation":"focus","clear_first":true,"allow_descendant_focus":true,"verify_value":true}
{"action":"fill","selector":"panel.json","value":"Nhập nối tiếp","activation":"click","clear_first":false,"position":{"mode":"relative_pixels","x":142,"y":86}}
{"action":"send_keys","selector":"input.json","value":"Ctrl+A; Backspace; Enter","activation":"focus"}
{"action":"click","selector":"panel.json","position":{"mode":"relative_ratio","x":0.5,"y":0.25}}
{"action":"legacy_set_value","selector":"input.json","value":"MSAA text"}
{"action":"legacy_default","selector":"button.json"}
```

`fill` mặc định focus + xóa trước; chỉ gửi text một lần. `activation: click` dùng tâm target, `position` hoặc `image_anchor`. Focus có thể là target hoặc descendant; `allow_descendant_focus:false` yêu cầu chính target. Kiểm tra foreground và focus trước khi gửi phím; khi focus rời target sẽ dừng. `verify_value:true` yêu cầu `clear_first:true` và ValuePattern đọc được trên input đang focus; kiểm tra khả năng đọc trước khi sửa text. Nếu không verify, chèn wait kiểm tra kết quả nghiệp vụ. `settle_seconds` mặc định 0.1, tối đa 5.

`send_keys` nhận `value` là các chord phân cách bởi `;`, hoặc `keys` là list `['Ctrl+A','Backspace']`. Hỗ trợ Ctrl/Alt/Shift, A–Z, 0–9, F1–F24, Enter, Tab, Escape, Backspace, Delete, Home, End, arrows, Space, PageUp/PageDown, Insert. Dùng `type_text`/`fill` cho text literal. Nếu Tab chuyển sang control khác, đặt target là Pane chung hoặc tách activity tới selector mới.

Pixel offset tính từ góc trên trái rectangle màn hình hiện tại. Có thể thêm `recorded_size:[width,height]` để dừng khi kích thước khác lúc inspect. Ratio dùng 0–1. Không dùng HWND/RuntimeId làm identity.

Image anchor nằm trong activity: `image_anchor:{template_png:"<PNG base64>",threshold:0.92,offset:[x,y]}`. Offset tính từ góc trên trái ảnh mốc, có thể nằm ngoài ảnh mốc nhưng phải trong Pane. Export từ GUI để lấy dữ liệu ảnh. Không tự bịa ảnh/base64. Chỉ match trong Pane đã resolve; không match hoặc nhiều match thì dừng.

Win32 selector dùng `backend:"win32",tree_view:"native"`. Inspect bằng view Win32 HWND; class/control ID duy nhất được ưu tiên, index dùng khi thiếu ID. `set_value` chỉ gửi WM_SETTEXT tới standard Edit và xác nhận text; `invoke` chỉ gửi BM_CLICK tới standard Button. Message có thể không chạy validation giống bàn phím; chọn `fill` khi cần sự kiện nhập liệu thật. MSAA activities dùng UIA selector có LegacyIAccessiblePattern.

```python
from legacy_ui.api import run

run("input.json", "fill", value="Mã Việt 123", clear_first=True, verify_value=True)
run("panel.json", "fill", value="Nội dung", activation="click",
    position={"mode": "relative_pixels", "x": 142, "y": 86})
run("input.json", "send_keys", value="Ctrl+A; Backspace")
```

Chạy Python trực tiếp: `python -m legacy_ui studio`. Cài dependencies trước bằng `python -m pip install -r requirements.txt`; image anchors cần `requirements-vision.txt`. Không cần PowerShell hoặc đóng gói executable.
