# Step contract v1 — bản thiết kế để review

Trạng thái: **draft**, chưa phải định dạng runtime của cookbook 0.3. Cookbook hiện tại chạy Excel với akaBot/Playwright .NET bằng Invoke Code. Chưa có Python orchestrator, Step Normalizer v1 hoặc bộ conformance chung. Các JSON schema trong thư mục này mô tả giao diện kế tiếp, không ngụ ý rằng các tính năng đó đã được triển khai.

Kiểm tra schema bằng CMD (tùy chọn cho người phát triển, không cần để chạy bot): `python -m pip install -r contracts\requirements-test.txt`, sau đó `python contracts\test_schemas.py`. 18 fixture kiểm tra schema và các trường hợp không hợp lệ; đây chưa phải conformance qua hai host.

## Ranh giới ba tầng

1. **Definition và normalizer:** đọc Excel/JSON, kiểm tra schema, chuyển alias action/selector, resolve biến, tạo Step chuẩn. YAML chưa cần cho MVP.
2. **Orchestrator akaBot/Python:** quyết định flow, If/For, chọn dữ liệu, điều kiện bỏ qua, retry, cancellation, lịch sử và output binding. Không tự thao tác DOM.
3. **Action adapter:** thực hiện đúng **một attempt**, chọn locator, action, chờ postcondition, thu thập artifact và trả ActionResult. Không quyết định chạy bước/nhánh nghiệp vụ tiếp theo.

Hiện `ChayKichBan.xaml` còn chứa vòng lặp step, retry và Playwright dispatch trong cùng Invoke Code. Bước refactor kế tiếp là tách `ExecuteStep.xaml` cho một attempt; `ChayKichBan.xaml` giữ For Each/If/Try Catch và retry của host. Không thêm custom runtime DLL.

## Chung semantics và chung runtime là hai lựa chọn khác nhau

Playwright .NET object không thể truyền trực tiếp sang một tiến trình Python. Chỉ thống nhất tên action cũng chưa tạo ra một execution layer chung.

**Đề xuất cho giai đoạn debug hiện tại:** hai adapter mỏng (.NET Invoke Code, Python), một contract, một test corpus và một bộ so sánh semantics. Cách này giữ được `IPage`/`IBrowserContext` trong workflow akaBot như yêu cầu hiện tại. Đây là chung contract và hành vi, chưa phải chung một codebase adapter.

**Nếu yêu cầu bắt buộc chỉ có một implementation adapter:** chuyển Playwright sang worker dùng giao thức request/result; akaBot và Python cùng gọi worker. Worker sở hữu browser, page và ffmpeg; hai host giữ handle ID. Đổi lại akaBot không còn truyền `IPage` trực tiếp giữa activity, phải quản lý worker, cancellation, IPC và session lifecycle. Không đưa worker vào bản cookbook này trước khi chốt thay đổi đó.

## Step Schema

19 action MVP: Goto, Click, Fill, Clear, Select, Check, Uncheck, Press, WaitFor, WaitForURL, ExtractText, ExtractAttribute, Upload, Download, Screenshot, Evaluate, SwitchPage, ClosePage, Assert.

Step gồm `schemaVersion`, `stepId`, `action`, `target`, `value`, `timeoutMs`, `options`, `condition`, `success`, `failure`, `retrySignal`, `onFail`, `output`.

- `condition`: điều kiện host quyết định có chạy bước. False trả `Skipped`, không chạy Playwright, không ghi output.
- `success/failure/retrySignal`: các dấu hiệu của kết quả thao tác, do adapter theo dõi trong cùng deadline. Thành công và lỗi cùng hiện trả `SIGNAL_CONFLICT`.
- `output`: đường dẫn tương đối dưới `BotContext.outputs`, chỉ bind sau `Completed`.
- `onFail`: Stop/Continue/Retry; host giữ chính sách. Retry phải có maxAttempts, delayMs, totalTimeoutMs, retryOn và đánh giá replay.
- `maxAttempts` tính cả lần đầu. `timeoutMs` là ngân sách của **toàn bộ một attempt**, bao gồm locator, action và postcondition. Thu thập ảnh lỗi có ngân sách riêng tối đa 5 giây.
- Không IF/ELSE/FOR/GOTO trong Excel. `Goto` chỉ là navigate URL, không phải nhảy dòng.

MVP không dùng `eval()` cho Condition. Ví dụ `${balance}>0` được biểu diễn rõ:

```json
{"kind":"compare","left":"${outputs.balance}","operator":"gt","right":0}
```

Các toán tử chỉ là eq/ne/gt/gte/lt/lte/contains. Không gọi hàm, vòng lặp, access attribute đối tượng hệ thống hay JavaScript/Python tùy ý. `Evaluate` chỉ tham chiếu `options.scriptId` thuộc registry script đã viết trong source, không nhận source code trong ô Excel.

Không mặc định đợi `networkidle`: ứng dụng polling có thể không bao giờ idle. Ưu tiên dấu hiệu nghiệp vụ/DOM; navigation dùng domcontentloaded/load/commit theo action. Download phải chờ file hoàn tất, kiểm tra lỗi/size/hash nếu đã khai báo, không coi sự kiện bắt đầu tải là hoàn tất.

## Selector và fallback

Ưu tiên khi viết definition: role + accessible name, testId, label, text, CSS, XPath. Normalizer giữ **thứ tự đã khai báo**, không tự đổi thứ tự runtime. Structured selector được map sang GetByRole/GetByTestId/GetByLabel…; không coi chuỗi `role=button[name=...]` là CSS.

- Mỗi target có tối đa 5 selector; tất cả cùng biểu thị một mục tiêu nghiệp vụ.
- Fallback chỉ khi selector trước không tìm thấy phần tử; nhiều hơn một phần tử trả `AMBIGUOUS_TARGET` ngay.
- Nếu locator đã match nhưng click bị lỗi/timeout, không thử click selector tiếp theo: thao tác có thể đã gây side effect.
- Không nhân timeout với số selector. Dùng deadline chung và ghi `selectedSelectorIndex`.
- Locator được resolve lại theo DOM hiện tại; không giữ ElementHandle qua re-render.
- `frame` khai báo riêng; `pageId` là handle trong context.

## ActionRequest / ActionResult

ActionRequest chỉ chứa dữ liệu của một attempt đã resolve, requestId/stepId/attempt và context handle. Chính sách retry và output binding không đi vào adapter.

ActionResult luôn có `status`, `success`, `value`, `error`, `durationMs`, `selectedSelectorIndex`, `screenshot`, `artifacts`, `contextPatch`.

- Completed: success=true, error=null.
- Failed: success=false, error có code/message/retryable/phase/sideEffect.
- Skipped: success=false, error=null, value=null. Orchestrator phải kiểm tra status; không coi success=false của Skipped là lỗi.
- Đường dẫn artifact tương đối với run directory, không phụ thuộc đường dẫn máy.
- `retryable` chỉ là phân loại của adapter. Host chỉ retry nếu replay an toàn và chính sách cho phép. Timeout sau upload/submit là sideEffect=possible, không tự thử lại.
- Mỗi lần retry có requestId riêng; log không ghi giá trị credential. Idempotency key phải giữ nguyên qua retry.

## BotContext

Tách hai phần:

1. **Serializable state** (schema đi kèm): runId/sessionId/activePageId, variables, outputs, currentStep, artifacts, history, capture.
2. **Runtime registry** (chỉ trong host hoặc worker): sessionId → Browser/Context, pageId → Page. Không đưa browser object, file handle hay callback vào JSON.

Quy tắc biến chung:

- `${username}` là alias của `${variables.username}`; đường dẫn lồng nhau `${variables.customer.id}` được hỗ trợ.
- Kết quả luôn nằm dưới `${outputs.balance}`, `${outputs.download.filePath}`. Không thêm namespace `previous` phụ thuộc thứ tự nếu không được khai báo.
- Placeholder chiếm toàn bộ giá trị giữ kiểu JSON gốc. Chèn vào chuỗi chỉ chấp nhận scalar. Thiếu biến trả MISSING_VARIABLE; không tự thay bằng chuỗi rỗng.
- Chỉ truy cập property của JSON object bằng tên; không evaluation, method call, indexing biểu thức hay prototype access.
- Không ghi output nếu Failed/Skipped. Lịch sử kết quả luôn giữ attempt/requestId để đối chiếu.
- Init/close session và các cờ capture là lifecycle contract. Đóng context trước browser để hoàn tất video. Runtime registry phải phản ánh tab đã đóng.

## Mapping workbook hiện tại

| Cookbook 0.3 | Schema v1 |
|---|---|
| scenario_id + step_order | stepId ổn định, duy nhất trong flow |
| action | action enum chuẩn (navigate → Goto, read_text → ExtractText…) |
| element | target tra từ catalog selector |
| value | value hoặc options tùy action |
| timeout_ms | timeoutMs |
| success_condition / failure_condition / retry_condition | success / failure / retrySignal |
| max_retries | onFail.maxAttempts = max_retries + 1 |
| read_text + value | ExtractText + output |

Không thay workbook đang chạy ngay. Normalizer sẽ hỗ trợ import định dạng 0.3, báo các khác biệt timeout/retry thay vì âm thầm thay semantics. Các action ngoài 19 primitive như read_table/hover/double_click cần capability extension có version hoặc module; không bỏ case đang dùng.

## Pattern catalog và conformance

Mỗi fixture ghi: đầu vào, seed, điều kiện ban đầu, flow, output mong đợi, side effect mong đợi, lỗi/retry mong đợi và cách reset.

Catalog gồm Basic; Dynamic DOM (delay/spinner/modal/toast/re-render); Table (row action/pagination); Upload/download (chooser/delay/multiple); Navigation (redirect/SPA/tab/iframe); Authentication (timeout/logout); Validation/error; Async (10–30 giây/polling); Composite patterns.

Bản 0.3 đã có nhiều case basic, delay, modal, bảng tìm kiếm, upload/download chậm, tab/iframe và login/chi nhánh. Các case re-render, pagination, multi-download, session expiry, SPA và composite SearchAndSelect/DownloadReport chưa được triển khai đầy đủ; không đánh dấu catalog đạt chỉ vì có một control tương tự.

Chạy cùng flow trên hai host trong namespace dữ liệu tách biệt, cùng seed. So sánh status, error.code, giá trị/output đã chuẩn hóa, số attempt, selector index, chuyển tab/session và side effect trên server. Không yêu cầu durationMs/timestamp/runId/đường dẫn hoặc bytes screenshot/video giống hệt. File nội dung deterministic phải có cùng hash; media phải tồn tại, mở được, kích thước/duration nằm trong tiêu chí.

## Thứ tự thực hiện sau review

1. Chốt schema và semantics, có positive/negative validation fixtures.
2. Bản 0.4 đã tách `ExecuteStep.xaml` một attempt, `ChayKichBan.xaml` điều phối ForEach/While/If/Delay native. Normalizer 0.3 → schema action v1 chưa triển khai. Schema `event.schema.json` là log runtime đã dùng, khác với các schema action thiết kế.
3. Python host/adapter đang tạm hoãn theo yêu cầu người dùng; chỉ triển khai sau khi được yêu cầu tiếp tục.
4. Conformance trước với Login, UploadAndWait, DownloadReport; sau đó bổ sung pattern catalog.
5. Chỉ công bố v1 stable khi hai host qua cùng conformance suite và migration workbook được kiểm thử.
