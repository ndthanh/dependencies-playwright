# Legacy UI Studio

Web GUI local để inspect UI của ứng dụng Windows cũ, thử tương tác và lấy selector JSON để viết workflow Python. v0.2 hỗ trợ UIA, Win32 HWND, LegacyIAccessible/MSAA, Pane + offset và ảnh mốc. Không dùng LLM, không cần akaBot, Playwright hoặc PowerShell để chạy.

## Chạy

1. Windows 10/11, Python 3.10+ bản đầy đủ có Tcl/Tk. Đã kiểm thử core trên Python 3.12.
2. Giải nén ZIP, chạy **`python start.py`** (hoặc `start.cmd`). Lần đầu tạo `.venv` và tải `comtypes`. Không tạo executable cho agent.
3. Browser mở web GUI local ở `127.0.0.1:8765`. Giữ cửa sổ server chạy.
4. Mở ứng dụng cần inspect, chọn ứng dụng trong dropdown rồi **Inspect tree**.

Không cần Node.js, build frontend hoặc cài dependency của repo Playwright. Nếu port đã dùng, chạy `python start.py --port 8766`. Muốn dùng ảnh mốc: `python start.py --vision` cài thêm Pillow và OpenCV. Các thư viện này có native DLL/.pyd, không gọi chương trình OCR/executable riêng.

Nếu dùng Python environment đã được cấp sẵn, không cần launcher/venv:

```bat
python -m pip install -r requirements.txt
python -m legacy_ui studio --port 8765
```

Image anchors: cài `python -m pip install -r requirements-vision.txt` trong cùng environment.

## Luồng inspect → AI

Chuột phải lên một node trong tree:

| Menu | Hành vi |
|---|---|
| **Highlight** | Resolve selector trên cây hiện tại, đưa window ra trước nếu Windows cho phép, vẽ viền element |
| **Test fill…** | Focus/click, tùy chọn xóa trước; hoặc ValuePattern/Win32/MSAA |
| **Test click…** | Chọn `InvokePattern` hoặc click chuột tại rectangle hiện tại |
| **Copy selector** | Copy JSON đầy đủ vào clipboard, đưa cho AI viết workflow |
| **Test send keys…** | Focus/click rồi gửi chuỗi phím tới target hoặc input bên trong |

Menu cũng mở bằng Shift+F10 trên node đang focus. Các test thực thi ngay trên ứng dụng thật một lần; không tự động thử lại thao tác.

`Name`/`AutomationId` rỗng không ngăn cản tương tác nếu node có patterns phù hợp. Hai input cùng class và cùng loại `Pane` được phân biệt bằng `child_index` dưới parent. Index tính từ 0 theo thứ tự provider, không sort theo tọa độ. Selector luôn giữ `tree_view` (`raw` hoặc `control`).

Có thể dùng **Pick in 3s**: sau khi đã dump tree, bấm nút rồi trỏ vào control trong app. Nếu trúng node con như `ScrollViewer`, chọn parent tương ứng trong tree. Snapshot chỉ đại diện giao diện đang mở; inspect lại sau khi chuyển màn hình.

**Save selector** lưu vào project local; **Export project** tải ZIP gồm các selector, `workflow.json` cho web GUI và `flow.json` cho CLI. Selector JSON có thể chỉnh trực tiếp. Mặc định dùng index và thuộc tính, không bắt buộc kiểm tra số sibling hay kiểm thử đổi layout.

Xem **[AI-WORKFLOW.md](AI-WORKFLOW.md)** để đưa schema hoạt động cho AI. `examples/` có selector thực tế của demo và flow chạy được.

## Atomic activities và wait

- `set_value`: writable ValuePattern; đọc lại để xác nhận giá trị.
- `fill`: focus hoặc click vào input/Pane, xác nhận focus trên target hoặc descendant. `clear_first` xóa bằng Ctrl+A + Backspace; bỏ chọn để nhập nối tiếp. `verify_value` tùy chọn, yêu cầu ValuePattern đọc được và xóa trước. Không tự retry text.
- `send_keys`: ví dụ `Ctrl+A; Backspace; Enter`, F1–F24, arrows, PageUp/Down… Mỗi chord được gửi theo thứ tự; dừng khi focus rời target. Với Tab sang input khác, chọn Pane chung hoặc tạo activity tiếp theo với target mới.
- `legacy_set_value` / `legacy_default`: SetValue hoặc DefaultAction qua LegacyIAccessiblePattern; không có pattern thì báo lỗi.
- `invoke`: InvokePattern; gửi đúng một lần.
- `click`: activate window, kiểm tra điểm click thuộc element rồi gửi chuột.
- `type_text`: focus đúng element, gõ Unicode; không tự xóa text cũ.
- `key`: ví dụ `Ctrl+A`, `Enter`, `Tab`.
- `wait`: `exists`, `absent`, `enabled`, `visible`, `value`, `name`, `name_contains`; có `wait_seconds` và `poll_seconds`.
- `sleep`: delay cố định theo `seconds`.
- `highlight`: kiểm tra selector và vẽ viền.

## Win32, Pane offset và ảnh mốc

Chọn **Win32 HWND** trong TREE VIEW để inspect cây cửa sổ native. Properties hiển thị class/control ID. Selector ưu tiên class + control ID duy nhất, còn thiếu ID thì dùng index. Không lưu HWND làm identity. `set_value` dùng WM_SETTEXT với standard Edit; `invoke` dùng BM_CLICK với standard Button. Nếu app cần validation theo bàn phím, dùng `fill`.

Với Pane không expose control con, chọn **Click target / point**, rồi **Pixel offset** hoặc **Relative ratio**. X/Y tính từ góc trên trái Pane; ratio từ 0–1. Activity `Highlight` có thể dùng cùng cấu hình để vẽ vị trí click. CLI cho phép `recorded_size` để kiểm tra kích thước Pane trước khi click.

Chọn **Image anchor + offset → Capture & choose image anchor**. Sau 3 giây agent activate cửa sổ đích và chụp vùng target. Kéo rectangle quanh nhãn/icon đặc trưng, rồi click trên ảnh tại điểm cần tương tác; mặc định dùng tâm ảnh mốc. **Use anchor**, sau đó Add/Update activity. Ảnh mốc và offset được lưu trong activity và ZIP export. Match chỉ trong target đã resolve; không thấy hoặc nhiều match thì dừng. Giữ Pane hiển thị, không bị che; DPI/theme/hover khác có thể ảnh hưởng match.

Web GUI có **Try this activity**, **Run selected**, **Run all** và **Stop after step**. Stop dừng trước bước tiếp theo; không ngắt một action/COM call đang chạy. Muốn dừng sớm khi wait, đặt timeout ngắn.

Lưu ý: `Invoke` thành công nghĩa là đã gọi action, không tự chứng minh nghiệp vụ hoàn tất. Chèn `wait` để kiểm tra trạng thái ứng dụng. Nếu timeout sau một thao tác ghi dữ liệu, kiểm tra kết quả trước khi chạy lại.

## CLI

Sau khi chạy `start.cmd` lần đầu:

```bat
.venv\Scripts\python.exe -m legacy_ui windows
.venv\Scripts\python.exe -m legacy_ui dump --hwnd 123456 --view raw --out artifacts\screen
.venv\Scripts\python.exe -m legacy_ui generate --snapshot artifacts\screen.json --node n16 --out input.json
.venv\Scripts\python.exe -m legacy_ui resolve --selector input.json --highlight
.venv\Scripts\python.exe -m legacy_ui replay --flow examples\flow.json --out artifacts\run.json
```

`--hwnd` lấy từ lệnh `windows`, không dùng HWND trong ví dụ như một giá trị cố định. RuntimeId/HWND chỉ hỗ trợ inspect, không được ghi vào selector lâu dài.

COM chạy trong worker process. CLI có `--timeout` toàn lệnh, mặc định 45 giây; flow dài dùng `python -m legacy_ui --timeout 300 replay ...`. Khi worker bị timeout, kết quả action có thể chưa xác định; công cụ không tự replay lại.

## Demo và kiểm thử

Fixture phát triển tùy chọn: `demo\start-demo.cmd` dùng Python để compile và mở **Legacy Pane Lab** bằng .NET Framework. Demo có đúng một parent `Customer form` với 2 input và 2 nút trực tiếp; cả bốn có ControlType `Pane`, Name và AutomationId rỗng. Fixture này tạo executable để kiểm thử trên máy phát triển; máy đích chỉ chạy agent Python, không cần chạy demo. `python demo/native_fixture.py` là fixture Win32 chạy bằng Python, không cần compile.

```bat
.venv\Scripts\python.exe -m unittest discover -s tests -v
.venv\Scripts\python.exe -m legacy_ui replay --flow examples\flow.json --out artifacts\run.json
```

Nếu có FFmpeg trên PATH: `python demo\record_replay.py` ghi cửa sổ demo thật và chạy flow mẫu. Script kiểm tra đoạn đen/đóng băng dài trước khi báo hoàn tất. Trong phiên remote kiểm thử, quay toàn màn hình báo Access denied, còn quay window trả về frame cũ/đen; vì vậy không phát hành các clip đó. Replay đã được xác nhận bằng dữ liệu UIA và JSON report độc lập với video.

## Giới hạn hiện tại

- MSAA hiện dùng bridge LegacyIAccessiblePattern trong UIA; chưa có cây MSAA trực tiếp, Java Access Bridge, OCR hoặc recorder tự ghi chuột/phím. Control không có node riêng dùng Pane offset/ảnh mốc.
- Tương tác chuột/phím, ảnh mốc và pick cần desktop tương tác và foreground. Nếu Windows từ chối activate/cursor access, UI sẽ báo lỗi. v0.2 đã kiểm thử trực tiếp fill tiếng Việt, append, send keys, Pane offset, MSAA, Win32 và image-anchor click kèm kiểm tra kết quả; xem `docs/upgrade-live-report.json`.
- Không đổi mức quyền của target. App chạy elevated có thể cần chạy agent ở cùng mức quyền.
- Không đọc/ghi control password. Dump không thu nội dung Value; workflow/log vẫn có thể chứa text do bạn nhập.
- Cây được dump theo best effort, không phải snapshot nguyên tử; có node/depth budget và danh sách lỗi.
- Không có retry nghiệp vụ, branching/variables hay tích hợp gọi AI. AI tạo JSON; core thực thi các atomic activity.

Server chỉ bind loopback, kiểm tra session token và Origin/Host. Session token nằm trong `projects/.../connection.json` và URL lúc launch; không đưa file này vào repo. `projects/`, snapshots và run logs mặc định nằm trong `.gitignore`.
