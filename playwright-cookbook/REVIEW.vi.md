# Rà soát logger và báo cáo — 0.4.0

## Kết luận

Luồng full là một lần chạy bot có nhiều scenario invocation. Log cần nối được run → invocation → hồ sơ/vòng → bước → attempt → bằng chứng. `events.jsonl` hiện dùng một schema versioned cho các lớp này; log akaBot có cùng eventId qua `COOKBOOK_EVENT`. Retry web nằm trong activity native, không nằm trong ExecuteStep và không tự phát sinh do lỗi capture hoặc snapshot.

## Những điểm đã sửa

- Tách ExecuteStep một attempt, native ForEach/While/If/Delay điều phối retry có giới hạn và backoff. Timeout/lỗi nghiệp vụ/lỗi kỹ thuật không tự retry.
- Ghi lifecycle, attempt bắt đầu/kết thúc, retry scheduled, skipped, outcome so với kỳ vọng và warning. Dùng UTC, duration riêng mỗi attempt, invocation ID và round/case ID.
- Mỗi attempt có ảnh riêng; chỉ xuất link sau khi lưu thành công. Chụp lỗi độc lập với cờ chụp mọi bước. Lỗi ảnh chỉ làm artifacts Incomplete.
- Video mỗi tab được liên kết với event; đóng context trong Finally trước browser. Artifacts có dung lượng, SHA-256 và eventIds. Hash/file tồn tại không bảo đảm media giải mã được, nên kiểm tra decode riêng.
- Tách Execution/Test/Business/Artifacts/Observability. Negative test đạt không có nghĩa nghiệp vụ hoàn tất. Hồ sơ chờ duyệt, bị từ chối/hủy, chưa upload và lý do từ chối được thể hiện riêng.
- Checkpoint outcome/branch, report fallback khi executor không load workflow hoặc bị watchdog dừng. Trường hợp cả launcher bị kill/mất điện vẫn cần phục hồi thủ công.
- Snapshot `current.json` là tiện ích; lỗi khóa file chỉ cảnh báo. Lỗi này đã xảy ra thực tế trong lượt full và được tái hiện bằng QA giữ file handle.
- Che text secret từ workbook trong log/report, trì hoãn ghi output đến sau khi postcondition đạt. Không tuyên bố che dữ liệu nhạy cảm trong pixel video/ảnh hay file download.
- Báo cáo lịch sử 1/7/30 ngày và script kiểm tra correlation, artifacts, HTML links.

## Bằng chứng kiểm thử

Chi tiết run IDs và kết quả máy đọc nằm trong `verification.json`.

- Full BotExecutor headful đã chạy 90 invocation, 334 attempt (331 bước kết thúc + 3 retry), 335 ảnh, 2 video, 2 file đầu ra. 5 lỗi được mong đợi; không có lỗi ngoài dự kiến. Cả 2 video WebM giải mã hết bằng FFmpeg, các hashes/link/correlation được đối chiếu.
- 6 chi nhánh, tối đa 5 vòng: 2 đã duyệt, 2 từ chối kèm lý do, 1 đã hủy, 1 còn chờ duyệt. Business phải là Incomplete dù Test Passed.
- 8 ca BotExecutor thực tế: hết retry (3 attempt, delay 300/600 ms, 3 bước skipped); ảnh lỗi; secret trong lỗi; current.json bị khóa; sai tài khoản ngoài kỳ vọng; mã scenario không tồn tại; workflow không load được; watchdog timeout. Tất cả assertion của bộ kiểm thử đạt.
- Unit checks: cửa sổ 24h/7d/30d, checkpoint khi gián đoạn, event cuối bị cắt, HTML escaping.
- Sau các chỉnh sửa cuối về warning/checkpoint/output, một workflow QA không mở browser đã biên dịch và chạy các Invoke Code mới qua BotExecutor: lỗi TECHNICAL_ERROR do Page Nothing có chủ đích, không retry, 3 bước skipped, 6 hồ sơ chưa upload được ghi đúng. Đây là kiểm tra compilation/error path, không thay cho full browser regression.

## Giới hạn kiểm thử của bản bàn giao

Full thành công ở trên được chạy trước các chỉnh sửa cuối về output log/checkpoint và phân loại warning. Hai lượt kiểm thử browser cuối gặp `OutOfMemoryException` ngay khi Playwright tạo tab. Windows báo CommittedBytes khoảng 136.46 GB / CommitLimit 136.95 GB, dù còn khoảng 21 GB RAM vật lý. Không tự chỉnh pagefile, restart máy hoặc tắt ứng dụng của người dùng.

Vì vậy **chưa đánh dấu full browser regression của source cuối cùng là đạt**. Sau khi giải phóng commit memory, chạy `run-full.cmd`, `verify-run.cmd "results\RUN_ID"` và bộ kiểm thử lỗi theo README. Source cuối đã qua syntax checks, báo cáo unit checks, code compilation/error path và kiểm tra đóng gói.

## Chưa triển khai

Python orchestrator; normalizer/schema action v1 dùng ở runtime; cross-host conformance; highlight Excel trực tiếp; resume tự động; monitoring tập trung/alerts/retention tự động. Các phần này không được suy ra là đã có từ báo cáo HTML lịch sử.
