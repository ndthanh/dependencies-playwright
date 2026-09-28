# akaBot + Playwright — dependency feed và bot mẫu

Branch `codex/portable-branch-lab` bổ sung bot demo chạy theo Excel, web server local và gói ZIP chuyển sang máy khác. Các workflow và dependency cũ ở thư mục gốc vẫn được giữ nguyên.

- **[Tải ZIP bản 0.2.1](releases/akabot-branch-lab-v0.2.1.zip)** — chọn Download raw file trên GitHub.
- **[Hướng dẫn bằng CMD](browser-branch-lab/README.vi.md)** — toàn bộ script khởi động dùng CMD + Node.js, không gọi PowerShell.
- [Source bot và web server](browser-branch-lab/).
- [SHA-256 của ZIP](releases/akabot-branch-lab-v0.2.1.zip.sha256).
- [Bằng chứng kiểm thử bản chuyển máy](releases/portable-verification.json).

## Chạy nhanh

```bat
git clone --branch codex/portable-branch-lab https://github.com/ndthanh/dependencies-playwright.git
cd /d dependencies-playwright\browser-branch-lab
verify-package.cmd
init.cmd
start-web.cmd
```

Giữ cửa sổ CMD chạy server; mở cửa sổ CMD thứ hai tại cùng thư mục:

```bat
run-bot.cmd
```

Máy cần akaBot đã kích hoạt, .NET Framework 4.8, Chrome, Node.js 22+ và dependency của project. Nếu init báo thiếu package, xem phần restore/offline trong hướng dẫn trước khi chạy bot. ZIP chứa source, DLL framework và Excel mẫu, không chứa bộ cài vendor hoặc gói Playwright khoảng 204 MB.

Bot dùng If / For Each native của akaBot; một workbook chứa 5 kịch bản, 9 sheet. Demo upload hồ sơ của 6 chi nhánh rồi kiểm tra 5 vòng. Kết quả chuẩn: 2 Đã duyệt, 2 Từ chối có lý do, 1 Đã hủy, 1 Chờ duyệt. Log và HTML report được tạo trong thư mục Results của mỗi máy.

`Dependencies-Without-Playwright` là feed offline có sẵn trong repo; không cần thêm tất cả package thành dependency trực tiếp của project. Giữ danh sách đã kiểm chứng trong project.json.
