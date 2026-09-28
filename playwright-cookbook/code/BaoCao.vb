__LOGGING__
Dim metadata As New System.Collections.Generic.Dictionary(Of String, Object)()
Dim metadataFile As String = System.IO.Path.Combine(runDirectory, "run.json")
If System.IO.File.Exists(metadataFile) Then metadata = logJson.Deserialize(Of System.Collections.Generic.Dictionary(Of String, Object))(System.IO.File.ReadAllText(metadataFile))
Dim plannedBranchFlow As Boolean = metadata.ContainsKey("scenario") AndAlso (System.Convert.ToString(metadata("scenario")) = "" OrElse System.Convert.ToString(metadata("scenario")) = "chi_nhanh")
Dim records As New System.Collections.Generic.List(Of Object)()
Dim failed As Integer = 0, expectedFailures As Integer = 0
For Each row As System.Data.DataRow In outcomes.Rows
 Dim record As New System.Collections.Generic.Dictionary(Of String, Object)()
 For Each col As System.Data.DataColumn In outcomes.Columns
  record(col.ColumnName) = safeText(CStr(row(col)))
 Next
 records.Add(record)
 If CStr(row("passed")) <> "True" Then failed += 1
 If CStr(row("passed")) = "True" AndAlso CStr(row("actual")) <> "PASS" Then expectedFailures += 1
Next
If fatalError <> "" Then failed += 1
If cleanupError <> "" Then failed += 1
Dim branches As New System.Collections.Generic.List(Of Object)()
Dim businessCounts As New System.Collections.Generic.Dictionary(Of String, Integer) From {{"approved", 0}, {"rejected", 0}, {"canceled", 0}, {"pending", 0}, {"notProcessed", 0}, {"unknown", 0}}
If book IsNot Nothing AndAlso book.Tables.Contains("data") AndAlso (plannedBranchFlow OrElse book.Tables("data").Columns.Contains("document_id")) Then
 For Each row As System.Data.DataRow In book.Tables("data").Rows
  If Not CStr(row("dataset_id")).StartsWith("cn") Then Continue For
  Dim branch As New System.Collections.Generic.Dictionary(Of String, Object)()
  For Each name As String In New String() {"dataset_id", "case_id", "username", "document_id", "status", "rejection_reason", "round"}
   branch(name) = If(row.Table.Columns.Contains(name), safeText(System.Convert.ToString(row(name))), "")
  Next
  Dim bucket As String = "unknown"
  Select Case CStr(branch("status"))
   Case "Đã duyệt" : bucket = "approved"
   Case "Từ chối" : bucket = "rejected"
   Case "Đã hủy" : bucket = "canceled"
   Case "Chờ duyệt" : bucket = "pending"
   Case "" : bucket = "notProcessed" : branch("status") = "Chưa hoàn tất upload"
  End Select
  branch("businessCategory") = bucket
  businessCounts(bucket) += 1
  branches.Add(branch)
 Next
End If
Dim events As New System.Collections.Generic.List(Of System.Collections.Generic.Dictionary(Of String, Object))()
Dim warnings As New System.Collections.Generic.List(Of String)()
Dim artifactWarningCount As Integer = 0
If cleanupError <> "" Then warnings.Add("Cleanup/video finalization did not complete: " & safeText(cleanupError)) : artifactWarningCount += 1
Dim eventFile As String = System.IO.Path.Combine(runDirectory, "events.jsonl")
If System.IO.File.Exists(eventFile) Then
 For Each line As String In System.IO.File.ReadAllLines(eventFile)
  Try
   Dim entry As System.Collections.Generic.Dictionary(Of String, Object) = logJson.Deserialize(Of System.Collections.Generic.Dictionary(Of String, Object))(line)
   events.Add(entry)
   If CStr(entry("eventType")) = "artifact_warning" OrElse CStr(entry("eventType")) = "telemetry_warning" Then warnings.Add(CStr(entry("error")))
   If CStr(entry("eventType")) = "artifact_warning" Then artifactWarningCount += 1
  Catch ex As Exception
   warnings.Add("Unreadable event record; inspect events.jsonl")
  End Try
 Next
End If
Dim artifacts As New System.Collections.Generic.List(Of Object)()
Dim artifactPaths As New System.Collections.Generic.HashSet(Of String)(StringComparer.OrdinalIgnoreCase)
For Each folder As String In New String() {"screenshots", "videos", "downloads"}
 Dim directory As String = System.IO.Path.Combine(runDirectory, folder)
 If Not System.IO.Directory.Exists(directory) Then Continue For
 For Each file As String In System.IO.Directory.GetFiles(directory)
  Dim relative As String = folder & "/" & System.IO.Path.GetFileName(file), length As Long = New System.IO.FileInfo(file).Length
  If length = 0 Then warnings.Add("Empty artifact: " & relative) : artifactWarningCount += 1 : Continue For
  Dim checksum As String
  Using hasher As System.Security.Cryptography.SHA256 = System.Security.Cryptography.SHA256.Create()
   Using stream As System.IO.FileStream = System.IO.File.OpenRead(file)
    checksum = BitConverter.ToString(hasher.ComputeHash(stream)).Replace("-", "").ToLowerInvariant()
   End Using
  End Using
  artifactPaths.Add(relative)
  Dim related As New System.Collections.Generic.List(Of String)()
  For Each entry As System.Collections.Generic.Dictionary(Of String, Object) In events
   Dim match As Boolean = CStr(entry("screenshot")) = relative OrElse CStr(entry("video")) = relative
   For Each produced As Object In CType(entry("artifacts"), System.Collections.IEnumerable)
    If CStr(produced) = relative Then match = True
   Next
   If match Then related.Add(CStr(entry("eventId")))
  Next
  artifacts.Add(New System.Collections.Generic.Dictionary(Of String, Object) From {{"path", relative}, {"kind", folder}, {"bytes", length}, {"sha256", checksum}, {"eventIds", related}})
 Next
Next
Dim retries As Integer = 0, attempts As Integer = 0, skipped As Integer = 0
For Each entry As System.Collections.Generic.Dictionary(Of String, Object) In events
 Select Case CStr(entry("eventType"))
  Case "retry_scheduled" : retries += 1
  Case "step_attempt_finished" : attempts += 1
  Case "step_skipped" : skipped += 1
 End Select
 For Each key As String In New String() {"screenshot", "video"}
  Dim relative As String = CStr(entry(key))
  If relative <> "" AndAlso Not artifactPaths.Contains(relative) AndAlso Not warnings.Contains("Missing artifact: " & relative) Then
   warnings.Add("Missing artifact: " & relative) : artifactWarningCount += 1
  End If
 Next
Next
Dim startedAt As String = System.IO.File.ReadAllText(System.IO.Path.Combine(runDirectory, "started.txt"))
Dim duration As Long = CLng((DateTime.UtcNow - DateTime.Parse(startedAt, Nothing, System.Globalization.DateTimeStyles.RoundtripKind)).TotalMilliseconds)
allPassed = failed = 0 AndAlso records.Count > 0
Dim executionStatus As String = If(allPassed, "Completed", "Failed"), businessStatus As String = "NotApplicable"
If plannedBranchFlow AndAlso branches.Count = 0 AndAlso Not allPassed Then businessStatus = "Unknown"
If branches.Count > 0 Then businessStatus = If(businessCounts("pending") + businessCounts("notProcessed") + businessCounts("unknown") > 0, "Incomplete", If(businessCounts("rejected") + businessCounts("canceled") > 0, "CompletedWithBusinessExceptions", "Completed"))
Dim summary As New System.Collections.Generic.Dictionary(Of String, Object) From {{"scenarios", records.Count}, {"unexpectedFailures", failed}, {"expectedFailures", expectedFailures}, {"attempts", attempts}, {"retries", retries}, {"skippedSteps", skipped}, {"warnings", warnings.Count}}
Dim result As New System.Collections.Generic.Dictionary(Of String, Object) From {{"schemaVersion", "1.0"}, {"runId", System.IO.Path.GetFileName(runDirectory)}, {"startedAtUtc", startedAt}, {"finishedAtUtc", DateTime.UtcNow.ToString("o")}, {"durationMs", duration}, {"executionStatus", executionStatus}, {"testStatus", If(allPassed, "Passed", "Failed")}, {"businessStatus", businessStatus}, {"artifactStatus", If(artifactWarningCount = 0, "Complete", "Incomplete")}, {"observabilityStatus", If(warnings.Count = 0, "Complete", "Degraded")}, {"passed", allPassed}, {"failures", failed}, {"fatalError", safeText(fatalError)}, {"cleanupError", safeText(cleanupError)}, {"summary", summary}, {"businessSummary", businessCounts}, {"warnings", warnings}, {"configuration", metadata}, {"outcomes", records}, {"branches", branches}, {"artifacts", artifacts}}
System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "artifacts.json"), logJson.Serialize(artifacts), New System.Text.UTF8Encoding(False))
System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "results.json"), logJson.Serialize(result), New System.Text.UTF8Encoding(False))
Dim encode As Func(Of String, String) = Function(value As String) System.Web.HttpUtility.HtmlEncode(safeText(value))
Dim html As New System.Text.StringBuilder("<!doctype html><html lang='vi'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>Bot run report</title><style>body{font:15px Segoe UI,sans-serif;color:#18324c;max-width:1600px;margin:24px auto;padding:20px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border-bottom:1px solid #dbe3ec;padding:8px;text-align:left;vertical-align:top}th{background:#19334c;color:white}tr[data-state=Failed],.fail{background:#ffe5e5}tr[data-state=Retry],.warn{background:#fff3cd}.cards{display:flex;gap:16px;flex-wrap:wrap}.card{border:1px solid #bdccdc;padding:16px;border-radius:8px}video{max-width:100%;width:640px}img{width:140px}a{color:#2458ac}pre{white-space:pre-wrap;overflow-wrap:anywhere}small{color:#506070}details{margin:16px 0}select,input{padding:8px}td{overflow-wrap:anywhere}</style><h1>Playwright cookbook · Bot run report</h1>")
html.Append("<p>Run: " & encode(System.IO.Path.GetFileName(runDirectory)) & "<br>UTC: " & encode(startedAt) & " · Duration: " & (duration / 1000.0).ToString("F1") & " s</p><div class='cards'>")
For Each card As String In New String() {"Execution: " & executionStatus, "Test: " & If(allPassed, "Passed", "Failed"), "Business: " & businessStatus, "Artifacts: " & CStr(result("artifactStatus")), "Retries: " & retries.ToString(), "Unexpected failures: " & failed.ToString()}
 html.Append("<div class='card'>" & encode(card) & "</div>")
Next
html.Append("</div><p>Test Passed = khớp expected_results; không đồng nghĩa tất cả hồ sơ đã duyệt. " & expectedFailures.ToString() & " lỗi có chủ đích; " & skipped.ToString() & " bước bị bỏ qua.</p><pre class='fail'>" & encode(fatalError & Environment.NewLine & cleanupError) & "</pre>")
For Each warning As String In warnings
 html.Append("<p class='warn'>" & encode(warning) & "</p>")
Next
' Generic tables use encoded cells only. No raw workbook text in HTML.
Dim table As Action(Of String, System.Collections.IEnumerable, String()) = Sub(title As String, items As System.Collections.IEnumerable, columns As String())
 html.Append("<h2>" & encode(title) & "</h2><table><tr>")
 For Each col As String In columns
  html.Append("<th>" & encode(col) & "</th>")
 Next
 html.Append("</tr>")
 For Each item As System.Collections.Generic.Dictionary(Of String, Object) In items
  html.Append("<tr>")
  For Each col As String In columns
   html.Append("<td>" & If(item.ContainsKey(col), encode(System.Convert.ToString(item(col))), "") & "</td>")
  Next
  html.Append("</tr>")
 Next
 html.Append("</table>")
End Sub
html.Append("<h2>Nghiệp vụ</h2><pre>" & encode(logJson.Serialize(businessCounts)) & "</pre>")
table("Hồ sơ chi nhánh", branches, New String() {"dataset_id", "case_id", "document_id", "status", "rejection_reason", "round"})
table("Kịch bản · invocation nối với timeline", records, New String() {"invocation", "scenario", "data", "case_id", "round", "expected", "actual", "passed", "duration_ms", "attempts", "retries", "skipped_steps", "detail"})
html.Append("<h2>Timeline từng attempt</h2><p>t+ tính từ lúc bot bắt đầu; không phải timecode chính xác của video. durationMs tính riêng từng attempt, gồm thao tác, chờ và chụp ảnh.</p><input id='q' placeholder='Tìm scenario / case / invocation'><select id='state'><option value=''>Tất cả</option><option>Failed</option><option>Retry</option><option>Skipped</option><option>Passed</option></select><table id='timeline'><tr><th>t+ / invocation</th><th>Kịch bản / bước</th><th>Dữ liệu / hồ sơ / vòng</th><th>Trạng thái / attempt</th><th>ms</th><th>Ảnh / video</th><th>Mã / lỗi</th></tr>")
For Each entry As System.Collections.Generic.Dictionary(Of String, Object) In events
 Dim kind As String = CStr(entry("eventType"))
 If kind <> "step_attempt_finished" AndAlso kind <> "retry_scheduled" AndAlso kind <> "step_skipped" Then Continue For
 html.Append("<tr data-state='" & encode(CStr(entry("state"))) & "'><td>" & CStr(entry("runElapsedMs")) & " ms<br><small>" & encode(CStr(entry("invocation"))) & "</small></td><td>" & encode(CStr(entry("scenario")) & " / " & CStr(entry("step")) & " " & CStr(entry("name"))) & "</td><td>" & encode(CStr(entry("data")) & " / " & CStr(entry("caseId")) & " / " & CStr(entry("round"))) & "</td><td>" & encode(CStr(entry("state"))) & " " & CStr(entry("attempt")) & "/" & CStr(entry("maxAttempts")) & "</td><td>" & CStr(entry("durationMs")) & "</td><td>")
 Dim image As String = CStr(entry("screenshot")), video As String = CStr(entry("video"))
 If artifactPaths.Contains(image) Then html.Append("<a href='" & encode(image) & "'><img loading='lazy' alt='Step screenshot' src='" & encode(image) & "'></a>")
 If artifactPaths.Contains(video) Then html.Append("<br><a href='" & encode(video) & "'>Video tab</a>")
 html.Append("</td><td>" & encode(CStr(entry("code")) & " " & CStr(entry("error"))) & "</td></tr>")
Next
html.Append("</table><h2>Video và artifacts</h2><p>Video ghi nội dung từng tab. Ảnh/video có thể chứa dữ liệu đang hiển thị trên web.</p>")
For Each artifact As System.Collections.Generic.Dictionary(Of String, Object) In artifacts
 Dim relative As String = CStr(artifact("path"))
 If CStr(artifact("kind")) = "screenshots" AndAlso relative <> "screenshots/last.png" Then Continue For
 html.Append("<p><a href='" & encode(relative) & "'>" & encode(relative) & "</a> · " & CStr(artifact("bytes")) & " bytes</p>")
 If CStr(artifact("kind")) = "videos" Then html.Append("<video controls preload='metadata' src='" & encode(relative) & "'></video>")
Next
html.Append("<details><summary>Cấu hình / workbook hash</summary><pre>" & encode(logJson.Serialize(metadata)) & "</pre></details><p>")
For Each name As String In New String() {"executor.log", "run.log", "events.jsonl", "results.json", "artifacts.json", "fatal.log"}
 If System.IO.File.Exists(System.IO.Path.Combine(runDirectory, name)) Then html.Append("<a href='" & name & "'>" & name & "</a> · ")
Next
html.Append("</p><script>const q=document.getElementById('q'),s=document.getElementById('state');function filter(){for(const r of document.querySelectorAll('#timeline tr[data-state]'))r.hidden=!(r.textContent.toLowerCase().includes(q.value.toLowerCase())&&(!s.value||r.dataset.state===s.value))}q.oninput=filter;s.onchange=filter;</script></html>")
System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "report.html"), html.ToString(), New System.Text.UTF8Encoding(False))
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "run_finished"}, {"state", executionStatus}, {"severity", If(allPassed, "Info", "Error")}, {"testStatus", result("testStatus")}, {"businessStatus", businessStatus}, {"artifactStatus", result("artifactStatus")}, {"durationMs", duration}})
