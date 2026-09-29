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
