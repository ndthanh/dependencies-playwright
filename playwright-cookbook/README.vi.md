# Playwright cookbook cho akaBot

Phiên bản 0.4.0 chuẩn hóa log, báo cáo và retry native akaBot. Tên sheet/cột dùng tiếng Anh, snake_case trong `scenarios.xlsx`; workbook 0.3.1 vẫn dùng được. Workbook tiếng Việt của 0.3.0 cần chuyển tên cột/sheet. Không triển khai Python orchestrator.

Bot đọc action, selector và dữ liệu từ **một file `scenarios.xlsx`**. akaBot gọi các XAML con, điều phối `For Each`, `If`, `Try Catch` và `Finally`. Mã VB nằm trực tiếp trong `Invoke Code`; không có thư viện runtime tự viết hoặc `BranchLab.Runtime.dll`.

Thiết kế bước tiếp theo nằm ở `contracts/THIET_KE_V1.md`, cùng Step/ActionRequest/ActionResult/BotContext JSON Schema. Đây là **v1 draft**, chưa được runtime 0.3 sử dụng; Python orchestrator chưa được triển khai. Tài liệu phân biệt hai adapter dùng chung semantics với một shared worker và chỉ rõ ảnh hưởng tới việc truyền Playwright object trong akaBot.

## Chạy bằng CMD

Cần Windows, Node.js 22+, Google Chrome và akaBot Studio/BotExecutor. Project dùng `RCA.Activities.Core 2.2.0`, `Microsoft.Playwright 1.63.0` và các dependency trong `project.json`. Các file `.cmd` gọi Node hoặc BotExecutor, không gọi PowerShell. Không cần `npm install` để chạy bot hoặc web.

Sau khi giải nén, mở **CMD** trong thư mục có `project.json`:

```bat
cd /d "D:\playwright-cookbook"
verify-package.cmd
init.cmd
restore-dependencies.cmd
```

`verify-package.cmd` dành cho bản ZIP, chạy trước init vì init sẽ cập nhật đường dẫn trong project. Nếu lấy source bằng Git, bỏ qua bước verify. Kết quả kiểm thử bản phát hành nằm trong `verification.json`.

Mở `project.json` bằng akaBot Studio để resolve dependency; sau đó đóng phiên chạy Studio trước khi dùng BotExecutor. Nếu máy không có Internet, đưa các `.nupkg` đã chuẩn bị vào một thư mục rồi chạy:

```bat
restore-dependencies.cmd --offline-feed "D:\nuget-offline"
```

Chạy toàn bộ: 13 kịch bản độc lập và luồng 6 chi nhánh, tối đa 5 vòng kiểm tra:

```bat
run-full.cmd
```

Chạy **một mã kịch bản** trong sheet `scenarios`:

```bat
run-scenario.cmd dang_nhap
run-scenario.cmd dang_nhap --data mac_dinh
run-scenario.cmd download_cham
run-scenario.cmd cua_so_iframe
```

Hai lệnh trên tự mở web nếu chưa chạy, chờ web sẵn sàng, chạy BotExecutor, xuất report và dừng web do chính lệnh đã mở. Nếu web đã được mở riêng, lệnh giữ nguyên server đó.

Mở web riêng để thử tay hoặc chạy từ Studio:

```bat
init-web.cmd
```

Địa chỉ mặc định: `http://127.0.0.1:8798`. Giữ cửa sổ CMD này mở; Ctrl+C để dừng. Nếu đổi port:

```bat
init-web.cmd --port 8800
run-full.cmd --port 8800
```

Chạy bot với website lab đã có trên máy khác:

```bat
run-full.cmd --url http://name-may-chu:8798
```

Server đi kèm mặc định chỉ bind localhost. Muốn phục vụ qua mạng nội bộ, cấu hình bind và mạng cho máy chủ riêng; không cần đổi XAML.

## Video, ảnh và tốc độ

Mặc định browser **hiện cửa sổ**, quay video, chụp từng bước, chụp khi lỗi và chụp bước cuối. Tùy chọn `0` là tắt, `1` là bật:

```bat
run-full.cmd --video 1 --screenshots 1 --last-screenshot 1 --slowmo 200
run-scenario.cmd nhap_lieu --video 0 --screenshots 0 --last-screenshot 1
run-scenario.cmd dang_nhap --video 0 --screenshots 0 --last-screenshot 0 --error-screenshot 0
run-full.cmd --headless --slowmo 0
```

Video là vùng nội dung browser, định dạng `.webm`, 1280 × 800. Mỗi tab có video riêng. `DongTrinhDuyet.xaml` đóng context trong `Finally` để hoàn tất video. Tắt cưỡng bức BotExecutor có thể làm mất phần cuối video.

FFmpeg được đóng gói tại đúng đường dẫn tính từ thư mục có `project.json`:

```text
dependencies\ffmpeg-1011\ffmpeg-win64.exe
```

`KhoiTaoTrinhDuyet.xaml` đặt `PLAYWRIGHT_BROWSERS_PATH` tới `<projectRoot>\dependencies` **trước khi tạo Playwright**. Bot sử dụng Chrome đã cài trên máy (`Channel=chrome`). Không phụ thuộc FFmpeg trong `%LOCALAPPDATA%` hay PATH. `init.cmd` kiểm tra SHA-256 của binary; giấy phép đi kèm trong cùng thư mục.

## XAML độc lập và tái sử dụng

| File | Vai trò |
|---|---|
| `Main.xaml` | Chọn full hoặc một kịch bản, quản lý phiên và xuất report |
| `workflows/DocExcel.xaml` | Đọc XLSX thành DataSet, kiểm tra cấu trúc và các mã tham chiếu |
| `workflows/KhoiTaoTrinhDuyet.xaml` | Tạo Playwright, Browser, Context, Page |
| `workflows/ChayKichBan.xaml` | Chạy một mã kịch bản trên Page hiện có |
| `workflows/ExecuteStep.xaml` | Chạy đúng một attempt; không tự retry action |
| `workflows/ChupAnh.xaml` | Chụp Page đang dùng vào đường dẫn chỉ định |
| `workflows/DongTrinhDuyet.xaml` | Ảnh cuối, hoàn tất video, giải phóng phiên |
| `workflows/BaoCao.xaml` | Tạo results.json và report.html |
| `workflows/ChiNhanh.xaml` | Các vòng lặp nghiệp vụ và nhánh trạng thái bằng activity native |

Các ví dụ có cùng argument đầu vào với `Main.xaml` và có thể chọn làm MainWorkflow trong Studio:

```text
examples\01_DangNhap.xaml
examples\02_NhapLieu.xaml
examples\03_DocBang.xaml
examples\04_Upload.xaml
examples\05_Download.xaml
examples\06_ChoVaThuLai.xaml
examples\07_NhieuChiNhanh.xaml
examples\08_CuaSoIframe.xaml
```

Chạy trực tiếp một file ví dụ bằng CMD:

```bat
run-full.cmd --workflow examples\04_Upload.xaml
run-full.cmd --workflow examples\07_NhieuChiNhanh.xaml
```

Để tích hợp vào project khác:

1. Copy các XAML cần dùng trong `workflows`, giữ hoặc sửa đường dẫn `Invoke Workflow File` theo project đích.
2. Copy workbook, fixture và thư mục `dependencies/ffmpeg-1011`; thêm các dependency từ `project.json` vào project đích.
3. Truyền `projectRoot` là đường dẫn tuyệt đối tới thư mục gốc project đích. Các XAML thành phần không hardcode đường dẫn máy.
4. Gọi `DocExcel` và `KhoiTaoTrinhDuyet` một lần. Giữ các object trong biến workflow.
5. Gọi `ChayKichBan` nhiều lần trên cùng `Page`. `page` là `In/Out`: mở tab mới có thể trả về Page mới. `data` là `Dictionary(Of String,String)`; action `read_text` thêm kết quả vào dictionary.
6. Gọi `DongTrinhDuyet` trong `Finally`. Không đóng browser bên trong từng kịch bản nếu còn cần dùng tiếp.

Các kiểu object: `Microsoft.Playwright.IPlaywright`, `IBrowser`, `IBrowserContext`, `IPage`. Chúng chỉ truyền giữa các workflow trong cùng lần chạy/tiến trình, không serialize sang BotExecutor khác.

Argument chính của driver: `projectRoot`, `workbookPath`, `selectedScenario`, `selectedData`, `baseUrl`, `recordVideo`, `screenshotEach`, `screenshotLast`, `screenshotOnError`, `headless`, `slowMoMs`. `KhoiTaoTrinhDuyet` trả bốn object; `ChayKichBan` trả `passed`, `errorCode`, `errorMessage`.

## Quy ước workbook

Tên sheet và tên cột dùng tiếng Anh, viết thường, snake_case:

| Sheet | Dữ liệu |
|---|---|
| `instructions` | Hướng dẫn nhanh |
| `settings` | `base_url`, `max_rounds` |
| `scenarios` | Mã, tên, bộ dữ liệu mặc định, `run_full` 0/1 |
| `steps` | Một dòng cho một thao tác web |
| `elements` | Tên dễ nhớ và selector |
| `data` | Các bộ dữ liệu, tài khoản giả lập, file upload |
| `expected_results` | PASS hoặc lỗi dự kiến cho mỗi kịch bản |

`steps`: `scenario_id`, `step_order`, `step_name`, `action`, `element`, `value`, `success_condition`, `failure_condition`, `retry_condition`, `timeout_ms`, `max_retries`.

Ví dụ `${username}` lấy từ cột `username` của dòng được chọn. `${base_url}` và `${run_id}` do runner truyền. Selector iframe viết `#demo-frame >>> #frame-name`.

Điều kiện gồm `element_name|visible`, `hidden`, `enabled`, `text|description`, `contains|description`, `value|value`, `count|so_luong`. `text` so sánh chính xác sau khi trim. Condition có thể chứa `${column_name}`.

`ChayKichBan.xaml` dùng **ForEach → While → ExecuteStep → If → Delay** của akaBot. Chỉ thử lại nếu thấy **`retry_condition`**, tối đa `max_retries` lần ngoài lần đầu (Excel cho phép 0–5). Delay tăng 300, 600, 1200, 2400, 4800 ms. Hết ngân sách giữ mã `RETRYABLE`, thêm thông báo `Retry budget exhausted`, ghi các bước còn lại là `Skipped`. Không retry toàn kịch bản hoặc toàn hồ sơ tự động.

`failure_condition`, timeout, tín hiệu mâu thuẫn và lỗi kỹ thuật dừng kịch bản ngay. Người viết Excel chỉ nên khai báo retry cho thao tác có thể lặp an toàn hoặc có idempotency key. Upload chi nhánh dùng mã hồ sơ và run ID để server chống trùng trong cùng run; chạy lại cả bot tạo run ID mới, không phải cơ chế resume hồ sơ cũ. Các kịch bản độc lập trong full suite tiếp tục để thu đủ kết quả kiểm thử; luồng chi nhánh dừng khi gặp lỗi ngoài dự kiến, giữ checkpoint đã hoàn thành.

`download` chờ sự kiện download và chờ ghi file xong; timeout áp dụng riêng cho từng giai đoạn. `value` của download có thể chứa chuỗi phải có trong file. `read_table` lưu bảng JSON trong downloads; `read_text` lưu nội dung vào biến có tên trong `value`.

Các action được hỗ trợ: `navigate`, `click`, `fill`, `select`, `check`, `press`, `hover`, `double_click`, `upload`, `download`, `read_text`, `read_table`, `popup`, `close_tab`, `dialog`, `wait`, `assert`. Với `check`, giá trị là `true` hoặc `false`; `dialog` là `accept` hoặc `dismiss`.

Các case sai mật khẩu, lỗi tải trang, timeout và tín hiệu mâu thuẫn là **negative tests**. Report đánh giá theo sheet `expected_results`; thấy lỗi dự kiến thì case kiểm thử vẫn đạt. Mã `cn_*` là kịch bản thành phần có tiền điều kiện; chạy luồng `chi_nhanh` hoặc ví dụ `07` để có session và mã hồ sơ. `run-scenario.cmd chi_nhanh` là bí danh gọi toàn bộ workflow này, không phải một dòng của sheet `scenarios`.

Các cấu hình CMD override argument driver; `base_url` trong Excel được dùng khi chạy Studio và argument `baseUrl` để trống. Trong CMD, URL mặc định là localhost:8798 để launcher quản lý server.

## Log và report

Mỗi lần chạy có thư mục riêng `results/<run_id>/`:

| File | Mục đích |
|---|---|
| `run.json` | Thời điểm bắt đầu UTC, version, hash workbook, cờ chụp/quay và kịch bản chọn |
| `events.jsonl` | Log chuẩn schema 1.0; nguồn chính để đối chiếu tiến trình |
| `run.log` | Bản sao JSONL để đọc/tìm kiếm; cùng eventId |
| `executor.log` | Log host akaBot, biên dịch/resolve dependency; chứa `COOKBOOK_EVENT` để nối hai lớp |
| `current.json` | Snapshot cập nhật nguyên tử khi có thể, dành cho highlight; lỗi cập nhật chỉ cảnh báo |
| `outcomes-progress.json`, `branches-progress.json` | Checkpoint kết quả đã hoàn thành; không tự resume |
| `results.json`, `report.html` | Kết quả máy đọc và báo cáo cho người dùng |
| `artifacts.json` | Danh mục file, loại, dung lượng, SHA-256, eventId liên quan |
| `screenshots/`, `videos/`, `downloads/` | Bằng chứng và đầu ra của lần chạy |

Event có `runId`, `eventId`, `scenario`, `invocation`, `data`, `caseId`, `round`, `step`, `attempt`, `maxAttempts`, UTC time, `durationMs`, severity, code/error và đường dẫn artifact. Lifecycle, bắt đầu/kết thúc attempt, retry, skipped, lỗi capture và kết quả so với kỳ vọng đều là event. `durationMs` tính riêng attempt và gồm thời gian chụp ảnh; không cộng dồn attempt trước. `runElapsedMs` là thời gian từ lúc bot bắt đầu, không phải timecode chính xác của video. Schema runtime nằm ở `contracts/event.schema.json`; các schema action còn lại vẫn là bản thiết kế.

Report phân biệt rõ:

- **Execution**: luồng chạy hoàn tất hay gặp lỗi/abort.
- **Test**: có khớp `expected_results` không; negative test đúng kỳ vọng vẫn Passed.
- **Business**: hoàn tất, còn chờ/chưa xử lý, hoặc hoàn tất với từ chối/hủy. Không dùng Test Passed để kết luận mọi hồ sơ đã duyệt.
- **Artifacts**: ảnh/video/file đầu ra có đầy đủ bằng chứng theo yêu cầu hay bị thiếu.
- **Observability** trong JSON: Degraded nếu có cảnh báo ghi snapshot/capture. Cảnh báo và nguyên nhân hiện trong HTML.

Timeline lọc theo trạng thái hoặc tìm invocation/hồ sơ/vòng; mỗi attempt có ảnh riêng. Ảnh lỗi vẫn được chụp khi `--screenshots 0` nhưng `--error-screenshot 1`. Chỉ gắn link sau khi lưu được ảnh. Lỗi capture không chạy lại action và không làm test thành Failed; report đánh dấu artifact Incomplete. `screenshotLast` chạy trước khi đóng context trong Finally; mỗi tab có video riêng và liên kết tới các event tương ứng. Tắt cưỡng bức có thể để lại video chưa hoàn tất; báo cáo fallback ghi rõ điều này. Kiểm tra file/hashes không thay thế kiểm tra khả năng giải mã video.

Logger che giá trị từ các cột có tên chứa password/secret/token/credential trong workbook; không log toàn bộ input dictionary. Output của bước thất bại không được ghi vào data. Ảnh/video và file download vẫn có thể chứa nội dung nhạy cảm đang hiển thị; cơ chế che text log không che pixel. Đây là lab dùng tài khoản giả lập.

CMD trả exit code khác 0 khi kết quả không đạt, khi không có `results.json`, hoặc BotExecutor trả lỗi. Nếu chỉ thấy execution started/ended, xem `executor.log`, mở project trong Studio và resolve dependency. Exit code 0 của BotExecutor đơn lẻ không đủ xác nhận bot thành công.

Launcher giới hạn mỗi lần chạy 900 giây để tránh treo vô hạn. Có thể đổi bằng `--run-timeout 1800` (giây). Khi quá hạn, launcher dừng cây tiến trình BotExecutor của chính lần chạy đó; video có thể chưa hoàn tất. Không chạy đồng thời hai executor trong cùng thư mục cookbook.

Sau khi đã tạo thư mục run, nếu BotExecutor không load/compile được workflow hoặc bị watchdog dừng, launcher vẫn tạo `results.json` và `report.html` dạng Incomplete, giữ checkpoint và last event. Nếu cả launcher bị kill hoặc mất điện, không có tiến trình nào còn sống để tạo báo cáo cuối; cần kiểm tra thư mục run và lock thủ công. Không tự xóa lock khi chưa xác nhận executor cũ đã dừng.

Tổng hợp lịch sử trên máy đang giữ các thư mục results:

```bat
report-history.cmd --days 1
report-history.cmd --days 7
report-history.cmd --days 30
verify-run.cmd "results\RUN_ID"
```

Mở `results\history-1d.html`, `history-7d.html`, `history-30d.html`. Cửa sổ thời gian tính theo UTC startedAt của run, đếm từng run; không cộng hồ sơ trùng qua các lần chạy. Đây là báo cáo tổng hợp theo yêu cầu, chưa phải dịch vụ giám sát realtime/alert hay tự thu log từ nhiều máy. Chưa có chính sách tự xóa dữ liệu; người vận hành quản lý retention và quyền truy cập thư mục results.

`verify-run.cmd` kiểm tra correlation/count, cấu trúc event cốt lõi, SHA-256 artifacts, link HTML và rò rỉ mật khẩu của fixture mẫu; không thay cho việc xem UI hoặc giải mã video. Kiểm thử dành cho developer:

```bat
node scripts\test-reporting.mjs
node scripts\build-xaml.mjs --qa
node scripts\test-observability.mjs
```

Lệnh cuối chạy BotExecutor thật cho tám tình huống lỗi/gián đoạn, mở Chrome headful. Fault injection chỉ nằm trong workflow QA sinh vào `results\qa`, không có trong Main sản xuất. `code/SharedLogging.vb` được generator nhúng vào Invoke Code; không tạo DLL.

## Sửa code

Có thể sửa trực tiếp `Invoke Code` trong Studio, hoặc sửa file tương ứng dưới `code/` rồi chạy:

```bat
rebuild-xaml.cmd
init.cmd
```

Lệnh rebuild tái tạo Main, examples và workflows, nên sẽ ghi đè các chỉnh sửa trực tiếp trong XAML. Chọn một nguồn chỉnh sửa cho mỗi lần thay đổi. Việc sửa action/selector/dữ liệu trong Excel không cần rebuild.

`scripts/build-workbook.mjs` và `scenarios.mjs` là nguồn tạo workbook mẫu bằng Artifact Tool, không phải dependency khi chạy bot. Không chạy lại builder nếu muốn giữ các chỉnh sửa Excel bằng tay.
