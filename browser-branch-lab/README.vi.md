# akaBot Branch Lab — bản chuyển máy, dùng CMD

Bản 0.2.1. Bot dùng **If / For Each native của akaBot**, gọi Playwright .NET theo kịch bản trong một file Excel. Demo có 6 chi nhánh, upload xong toàn bộ rồi kiểm tra 5 vòng. Tất cả tài khoản và file mẫu là giả lập.

**Các lệnh dưới đây chạy trong Command Prompt (`cmd.exe`). Không dùng PowerShell.** Script `.cmd` gọi Node.js trực tiếp. Web server không cần `npm install`, không cần Python, Codex hoặc Excel đang mở.

## 1. Chuẩn bị máy

- Windows 64-bit, akaBot Studio/BotExecutor đã cài và kích hoạt. Phiên bản đã kiểm chứng: Community 2.2.0.7, RCA.Activities.Core 2.2.0.
- .NET Framework 4.8 hoặc mới hơn trong nhánh 4.x.
- Google Chrome cài ở vị trí tiêu chuẩn.
- Node.js 22 trở lên. Bản đóng gói được kiểm tra với Node 24.11.1.
- Dependency của bot đúng phiên bản trong `AkaBotBranchLab\project.json`. ZIP chứa DLL framework do chúng ta viết, **không chứa bộ cài akaBot/Chrome/Node hay toàn bộ NuGet packages**.

Microsoft.Playwright 1.63.0 có gói khoảng 204 MB, nên không nhét vào ZIP source hoặc commit Git. `restore-dependencies.cmd` có thể tải gói này và các dependency Microsoft từ NuGet, kiểm tra SHA-256 trước khi dùng. Thư mục `Dependencies-Without-Playwright` ở repository chứa các gói offline còn lại.

## 2. Lấy code hoặc giải nén ZIP

Nếu dùng Git:

```bat
git clone --branch codex/portable-branch-lab https://github.com/ndthanh/dependencies-playwright.git
cd /d dependencies-playwright\browser-branch-lab
```

Nếu tải ZIP trong thư mục `releases` của branch, giải nén trước, rồi mở CMD tại thư mục `akabot-branch-lab` chứa các file `.cmd`. Ví dụ:

```bat
cd /d C:\akaBotLabs\akabot-branch-lab
node --version
verify-package.cmd
init.cmd
```

`verify-package.cmd` kiểm tra file theo manifest đi cùng ZIP; dùng trước `init.cmd` vì init sẽ đổi đường dẫn trong project. Với bản Git chưa đóng gói, dùng `make-zip.cmd` nếu muốn tạo ZIP và manifest mới.

`init.cmd` cấu hình đường dẫn cho nơi vừa giải nén, rồi kiểm tra điều kiện chạy. Không tạo lại các activity trong Main.xaml. Sau này chuyển thư mục thì chạy init lại. Khi dùng Studio, chạy init trước khi mở project.

Nếu Node chưa nằm trong PATH nhưng đã có Node portable, chỉ rõ trong cửa sổ CMD hiện tại:

```bat
set "LAB_NODE=D:\tools\node\node.exe"
init.cmd
```

Nếu BotExecutor cài khác vị trí chuẩn:

```bat
set "AKABOT_EXECUTOR=D:\akaBot\BotExecutor.exe"
init.cmd
```

## 3. Nếu thiếu dependency

Với bản clone repository, script tự tìm `..\Dependencies-Without-Playwright`:

```bat
restore-dependencies.cmd
```

Hoặc chỉ rõ một feed offline đã chuẩn bị. Có thể thêm `Microsoft.Playwright.1.63.0.nupkg` vào feed đó để không cần tải qua mạng:

```bat
restore-dependencies.cmd --offline-feed "D:\akaBotPackages"
```

Script đưa package vào `%LOCALAPPDATA%\akaBot\Packages`, giữ nguyên file có sẵn, không ghi đè package sai checksum. Nó không thay đổi cấu hình hệ thống hoặc nguồn NuGet của Studio. Các dependency bắc cầu vẫn do akaBot resolve; nếu chạy offline, thêm cả thư mục `Dependencies-Without-Playwright` làm package source trong Package Manager của Studio.

Mở `AkaBotBranchLab\project.json` bằng Studio, chờ resolve packages, rồi đóng Studio và chạy `init.cmd` lại. RCA.Activities.Core phải lấy từ akaBot hoặc feed của repository; script không tải gói đó từ nguồn ngoài.

Các checksum trong `dependencies.json` được lấy từ bộ package đã chạy thành công. Có thể kiểm tra những file package đang có bằng `restore-dependencies.cmd --verify-only`; chế độ này cần file `.nupkg`, không chỉ DLL đã giải nén.

## 4. Bật web server — cửa sổ CMD thứ nhất

```bat
cd /d C:\akaBotLabs\akabot-branch-lab
start-web.cmd
```

Giữ cửa sổ này mở. Truy cập **http://127.0.0.1:8789/branch**. Dừng bằng `Ctrl+C`.

Web lưu dữ liệu thật của lượt demo vào `BrowserPrimitiveLab\.branch-data`; đổi tài khoản hoặc reload không làm mất hồ sơ. Server chỉ lắng nghe trên máy đang chạy, chưa mở cho mạng LAN.

## 5. Chạy bot — cửa sổ CMD thứ hai

```bat
cd /d C:\akaBotLabs\akabot-branch-lab
run-bot.cmd
```

Chrome có cửa sổ được mở mặc định. Chờ khoảng một phút trên máy đã resolve đủ dependency. Bot tự đăng nhập, upload, đổi tài khoản và kiểm tra trạng thái; không cần nhập password thủ công. Đóng Studio khi chạy bằng BotExecutor để tránh Studio ghi đè project đang dùng.

Kết quả mong đợi: **2 Đã duyệt, 2 Từ chối có lý do, 1 Đã hủy, 1 Chờ duyệt; 0 lỗi kỹ thuật**. Có thêm một dòng tắt để kiểm tra nhánh bỏ qua. “Chờ duyệt” sau vòng 5 là chưa hoàn tất nghiệp vụ.

Nếu port 8789 đã được dùng, đổi ở cả hai lệnh:

```bat
start-web.cmd --port 8790
run-bot.cmd --url http://127.0.0.1:8790
```

Các tùy chọn khác:

```bat
run-bot.cmd --headless
run-bot.cmd --trace
run-bot.cmd --workbook "D:\du_lieu\Branch-Scenarios.xlsx"
run-bot.cmd --executor "D:\akaBot\BotExecutor.exe"
```

Trace tắt mặc định vì có thể chứa DOM/network và thông tin đã nhập. Chỉ bật với dữ liệu test được phép. Mỗi thư mục giải nén chạy một executor tại một thời điểm.

## 6. Sửa Excel và xem kết quả

Excel mẫu: `AkaBotBranchLab\outputs\branch-lab\Branch-Scenarios.xlsx`.

| Sheet | Nội dung |
|---|---|
| `du_lieu` | Hồ sơ, chi nhánh, account, credential_ref, file_path, enabled, fault_mode |
| `thong_tin` | Phiên bản schema, URL mặc định, seed, số vòng, khoảng nghỉ |
| `kich_ban` | Nhiều scenario trong một workbook |
| `buoc` | Actions theo scenario_id và thứ tự order |
| `doi_tuong` | Selector CSS |
| `dieu_kien` | Dấu hiệu quan sát trên web |
| `ket_qua` | Quy tắc continue / retry / fail |
| `tham_so` | Tài liệu về input và sensitive fields |
| `huong_dan` | Hướng dẫn sửa workbook |

Giữ nguyên tên bảng `tbl_<ten_sheet>` và tên cột. Chưa hỗ trợ công thức trong bảng cấu hình. File upload tương đối tính từ thư mục **AkaBotBranchLab**, kể cả khi workbook nằm nơi khác; có thể dùng đường dẫn tuyệt đối. Credential `demo:cn01`…`demo:cn06` dành cho lab. Muốn thử đăng nhập thủ công: tài khoản `cn01`…`cn06`, password `BranchDemo!01`…`BranchDemo!06`.

Sau khi chạy, CMD in đường dẫn `REPORT=...`. Mỗi run có thư mục riêng:

```text
AkaBotBranchLab\Results\<timestamp>-<run_id>\
  report.html
  results.json
  events.jsonl
  run.log
  artifacts\
```

Mở `report.html` để xem từng hồ sơ, lịch sử vòng kiểm tra, timeline và screenshot. `Results\dashboard.html` tổng hợp 24 giờ / 7 ngày / 30 ngày từ những lần đã chạy trên bản giải nén này. Không kèm báo cáo cũ của máy phát triển để tránh nhầm với kết quả của bạn.

## 7. Sửa code và build lại

- `AkaBotBranchLab\Main.xaml`: các If / For Each native.
- `AkaBotBranchLab\src\WorkbookPackage.cs`: đọc và kiểm tra Excel.
- `AkaBotBranchLab\src\BranchRuntime.cs`: Playwright runner, logs và reports.
- `BrowserPrimitiveLab\server.mjs`, `branch-api.mjs`, `branch-store-local.mjs`, `public\`: web server và giao diện lab.

Đã có sẵn `lib\BranchLab.Runtime.dll`. Chỉ cần build lại nếu sửa C#, khi đó máy cần thêm **.NET Framework 4.8 Developer Pack**:

```bat
rebuild-bot.cmd
```

Build này không ghi đè các activity đã sửa trong Studio. `tools\build-workflow.mjs` là generator nguồn: chạy trực tiếp bằng Node chỉ khi muốn tạo lại toàn bộ Main.xaml; thao tác đó sẽ thay thế các chỉnh sửa activity thủ công. Không cần generator hoặc npm để chạy Excel mẫu.

## 8. Xử lý lỗi thường gặp

| Dấu hiệu | Cách xử lý |
|---|---|
| `node is not recognized` | Cài Node hoặc đặt `LAB_NODE` như phần 2 |
| `Dependencies missing` / assembly not found | Restore feed, mở project bằng Studio để resolve, giữ nguyên phiên bản trong project.json |
| Không tìm thấy BotExecutor | Đặt `AKABOT_EXECUTOR` hoặc dùng `--executor` |
| `EADDRINUSE` | Đổi port ở cả start-web và run-bot |
| Không nạp được DLL tải từ Internet | Kiểm tra Properties của ZIP và tùy chọn Unblock trước khi giải nén, theo chính sách máy công ty |
| Máy chặn tải NuGet | Chuẩn bị feed offline trên máy được phép rồi chép sang |
| Bot báo lỗi | Xem `Results\executor-*.log`, `report.html`, `events.jsonl`; không tự upload lại nếu chưa biết server đã lưu hay chưa |

Nếu cửa sổ chỉ hiện vài dòng kiểu `Finished Resolve Start` rồi `Ended`, hãy chạy từ một CMD đã mở sẵn tại đúng thư mục `akabot-branch-lab`:

```bat
cd /d C:\akaBotLabs\akabot-branch-lab
run-bot.cmd
```

Launcher sẽ in `BotExecutor exit code`, đường dẫn log đầy đủ và 80 dòng cuối log khi BotExecutor kết thúc trước khi tạo `Results\<run_id>`. Nếu log báo lỗi resolve/compile, mở `AkaBotBranchLab\project.json` bằng akaBot Studio, resolve dependencies, đóng Studio, chạy lại `init.cmd`, rồi thử lại. Không mở hai BotExecutor cùng lúc trong cùng một thư mục giải nén.

Đây là PoC cho dữ liệu giả lập: chưa có resume, credential vault hay điều phối nhiều máy đồng thời. Gói này dùng lab local, không phụ thuộc website Sites trực tuyến.
