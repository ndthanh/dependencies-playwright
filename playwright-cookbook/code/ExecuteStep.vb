Dim activePage As Microsoft.Playwright.IPage = page
' The workbook is the source of actions and selectors. No business loops in this file.
Dim serializer As New System.Web.Script.Serialization.JavaScriptSerializer()
__LOGGING__
Dim resolved As New System.Collections.Generic.Dictionary(Of String, String)(data)
resolved("base_url") = baseUrl.TrimEnd("/"c)
resolved("run_id") = System.IO.Path.GetFileName(runDirectory)
Dim render As Func(Of String, String) = Function(text As String)
 Return System.Text.RegularExpressions.Regex.Replace(text, "\$\{([^}]+)\}", Function(m As System.Text.RegularExpressions.Match)
  If Not resolved.ContainsKey(m.Groups(1).Value) Then Throw New Exception("Missing input: " & m.Groups(1).Value)
  Return resolved(m.Groups(1).Value)
 End Function)
End Function
Dim selector As Func(Of String, String) = Function(key As String)
 If key = "" Then Return ""
 For Each element As System.Data.DataRow In book.Tables("elements").Rows
  If CStr(element("name")) = key Then Return render(CStr(element("selector")))
 Next
 Throw New Exception("Unknown element: " & key)
End Function
Dim locate As Func(Of String, Microsoft.Playwright.ILocator) = Function(key As String)
 Dim target As String = selector(key)
 If target.Contains(" >>> ") Then
  Dim parts As String() = target.Split(New String() {" >>> "}, StringSplitOptions.None)
  Return activePage.FrameLocator(parts(0)).Locator(parts(1))
 End If
 Return activePage.Locator(target)
End Function
Dim matches As Func(Of String, Boolean) = Function(condition As String)
 If condition = "" Then Return False
 Dim parts As String() = render(condition).Split(New Char() {"|"c}, 3)
 Dim target As Microsoft.Playwright.ILocator = locate(parts(0))
 If parts.Length = 1 Then Return target.IsVisibleAsync().GetAwaiter().GetResult()
 Select Case parts(1)
  Case "visible" : Return target.IsVisibleAsync().GetAwaiter().GetResult()
  Case "hidden" : Return Not target.IsVisibleAsync().GetAwaiter().GetResult()
  Case "text" : Return target.IsVisibleAsync().GetAwaiter().GetResult() AndAlso target.InnerTextAsync().GetAwaiter().GetResult().Trim() = parts(2)
  Case "contains" : Return target.IsVisibleAsync().GetAwaiter().GetResult() AndAlso target.InnerTextAsync().GetAwaiter().GetResult().Contains(parts(2))
  Case "value" : Return target.InputValueAsync().GetAwaiter().GetResult() = parts(2)
  Case "enabled" : Return target.IsEnabledAsync().GetAwaiter().GetResult()
  Case "count" : Return target.CountAsync().GetAwaiter().GetResult() = Integer.Parse(parts(2))
  Case Else : Throw New Exception("Unknown condition: " & parts(1))
 End Select
End Function

Dim stepId As String = CStr(stepRow("step_order")), action As String = CStr(stepRow("action"))
Dim timeout As Integer = Integer.Parse(CStr(stepRow("timeout_ms")))
Dim watch As System.Diagnostics.Stopwatch = System.Diagnostics.Stopwatch.StartNew()
Dim stepError As String = "", stepCode As String = "", imageName As String = "", videoName As String = ""
Dim produced As New System.Collections.Generic.List(Of String)()
Dim pendingOutputs As New System.Collections.Generic.Dictionary(Of String, String)()
Dim done As Boolean = False
Dim emit As Action(Of String, String, String, String, String) = Sub(state As String, eventType As String, severity As String, code As String, detail As String)
 Dim logOutputs As New System.Collections.Generic.Dictionary(Of String, String)()
 If done Then
  For Each pair As System.Collections.Generic.KeyValuePair(Of String, String) In pendingOutputs
   logOutputs(pair.Key) = If(System.Text.RegularExpressions.Regex.IsMatch(pair.Key, "password|secret|token|credential", System.Text.RegularExpressions.RegexOptions.IgnoreCase), "[REDACTED]", pair.Value)
  Next
 End If
 logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", eventType}, {"severity", severity}, {"scenario", scenarioId}, {"invocation", invocation}, {"data", If(data.ContainsKey("dataset_id"), data("dataset_id"), "")}, {"caseId", If(data.ContainsKey("case_id"), data("case_id"), "")}, {"round", If(data.ContainsKey("round"), data("round"), "")}, {"step", stepId}, {"name", CStr(stepRow("step_name"))}, {"action", action}, {"state", state}, {"attempt", attempt}, {"maxAttempts", Integer.Parse(CStr(stepRow("max_retries"))) + 1}, {"durationMs", watch.ElapsedMilliseconds}, {"code", code}, {"error", detail}, {"screenshot", imageName}, {"video", videoName}, {"artifacts", produced.ToArray()}, {"outputs", logOutputs}})
End Sub
Try
 If activePage.Video IsNot Nothing Then videoName = "videos/" & System.IO.Path.GetFileName(activePage.Video.PathAsync().GetAwaiter().GetResult())
Catch ex As Exception
 emit("Warning", "artifact_warning", "Warning", "VIDEO_REFERENCE_FAILED", safeText(ex.Message))
End Try
emit("Running", "step_attempt_started", "Info", "", "")
  Try
   activePage.SetDefaultTimeout(timeout)
   Dim key As String = CStr(stepRow("element")), value As String = render(CStr(stepRow("value")))
   Select Case action
    Case "navigate"
     activePage.GotoAsync(value, New Microsoft.Playwright.PageGotoOptions With {.Timeout = timeout, .WaitUntil = Microsoft.Playwright.WaitUntilState.DOMContentLoaded}).GetAwaiter().GetResult()
    Case "click" : locate(key).ClickAsync().GetAwaiter().GetResult()
    Case "fill" : locate(key).FillAsync(value).GetAwaiter().GetResult()
    Case "select" : locate(key).SelectOptionAsync(value).GetAwaiter().GetResult()
    Case "check" : locate(key).SetCheckedAsync(Boolean.Parse(value)).GetAwaiter().GetResult()
    Case "press" : locate(key).PressAsync(value).GetAwaiter().GetResult()
    Case "hover" : locate(key).HoverAsync().GetAwaiter().GetResult()
    Case "double_click" : locate(key).DblClickAsync().GetAwaiter().GetResult()
    Case "upload"
     Dim uploadPath As String = System.IO.Path.GetFullPath(System.IO.Path.Combine(projectRoot, value))
     If Not System.IO.File.Exists(uploadPath) Then Throw New System.IO.FileNotFoundException("Upload fixture missing", uploadPath)
     locate(key).SetInputFilesAsync(uploadPath).GetAwaiter().GetResult()
    Case "download"
     Dim download As Microsoft.Playwright.IDownload = activePage.RunAndWaitForDownloadAsync(Function() locate(key).ClickAsync(), New Microsoft.Playwright.PageRunAndWaitForDownloadOptions With {.Timeout = timeout}).GetAwaiter().GetResult()
     Dim downloadPath As String = System.IO.Path.Combine(runDirectory, "downloads", invocation & "-" & System.IO.Path.GetFileName(download.SuggestedFilename))
     Dim saveTask As System.Threading.Tasks.Task = download.SaveAsAsync(downloadPath)
     If Not CType(saveTask, System.IAsyncResult).AsyncWaitHandle.WaitOne(timeout) Then
      download.CancelAsync().GetAwaiter().GetResult()
      Throw New System.TimeoutException("Download transfer timeout")
     End If
     saveTask.GetAwaiter().GetResult()
     If New System.IO.FileInfo(downloadPath).Length = 0 Then Throw New Exception("Empty download")
     If value <> "" AndAlso Not System.IO.File.ReadAllText(downloadPath).Contains(value) Then Throw New Exception("Downloaded content mismatch")
     resolved("download_path") = downloadPath
     produced.Add("downloads/" & System.IO.Path.GetFileName(downloadPath))
    Case "read_text"
     resolved(value) = locate(key).InnerTextAsync().GetAwaiter().GetResult().Trim()
     pendingOutputs(value) = resolved(value)
    Case "read_table"
     Dim rows As New System.Collections.Generic.List(Of Object)()
     Dim rowLocators As System.Collections.Generic.IReadOnlyList(Of Microsoft.Playwright.ILocator) = locate(key).Locator("tr").AllAsync().GetAwaiter().GetResult()
     For Each tableRow As Microsoft.Playwright.ILocator In rowLocators
      rows.Add(tableRow.Locator("th,td").AllTextContentsAsync().GetAwaiter().GetResult())
     Next
     Dim tableFile As String = "downloads/" & invocation & "-" & stepId & "-table.json"
     System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, tableFile), serializer.Serialize(rows), New System.Text.UTF8Encoding(False))
     produced.Add(tableFile)
    Case "popup"
     activePage = activePage.RunAndWaitForPopupAsync(Function() locate(key).ClickAsync(), New Microsoft.Playwright.PageRunAndWaitForPopupOptions With {.Timeout = timeout}).GetAwaiter().GetResult()
     videoName = If(activePage.Video Is Nothing, "", "videos/" & System.IO.Path.GetFileName(activePage.Video.PathAsync().GetAwaiter().GetResult()))
     activePage.WaitForLoadStateAsync(Microsoft.Playwright.LoadState.DOMContentLoaded).GetAwaiter().GetResult()
    Case "close_tab"
     If activePage.Context.Pages.Count <= 1 Then Throw New Exception("Cannot close the only tab")
     Dim parent As Microsoft.Playwright.IPage = activePage.Context.Pages(0)
     activePage.CloseAsync().GetAwaiter().GetResult()
     activePage = parent
     videoName = If(activePage.Video Is Nothing, "", "videos/" & System.IO.Path.GetFileName(activePage.Video.PathAsync().GetAwaiter().GetResult()))
    Case "dialog"
     Dim handler As EventHandler(Of Microsoft.Playwright.IDialog) = Async Sub(sender As Object, dialog As Microsoft.Playwright.IDialog)
      If value = "accept" Then
       Await dialog.AcceptAsync()
      Else
       Await dialog.DismissAsync()
      End If
     End Sub
     AddHandler activePage.Dialog, handler
     Try
      locate(key).ClickAsync().GetAwaiter().GetResult()
     Finally
      RemoveHandler activePage.Dialog, handler
     End Try
    Case "wait", "assert"
     ' Condition polling below handles these actions.
    Case Else : Throw New Exception("Unsupported action: " & action)
   End Select
   Dim success As String = CStr(stepRow("success_condition")), failure As String = CStr(stepRow("failure_condition")), retryCondition As String = CStr(stepRow("retry_condition"))
   If success <> "" OrElse failure <> "" OrElse retryCondition <> "" Then
    Dim deadline As DateTime = DateTime.UtcNow.AddMilliseconds(timeout)
    Do
     Dim good As Boolean = matches(success), bad As Boolean = matches(failure), retryable As Boolean = matches(retryCondition)
     If good AndAlso (bad OrElse retryable) Then stepCode = "CONFLICT" : Throw New Exception("Conflicting success and failure signals")
     If bad Then stepCode = "BUSINESS_ERROR" : Throw New Exception("Failure signal: " & failure)
     If retryable Then stepCode = "RETRYABLE" : Throw New Exception("Retry signal: " & retryCondition)
     If good OrElse success = "" Then Exit Do
     If DateTime.UtcNow >= deadline Then stepCode = "TIMEOUT" : Throw New System.TimeoutException("Success condition timed out: " & success)
     System.Threading.Thread.Sleep(100)
    Loop
   End If
   For Each pair As System.Collections.Generic.KeyValuePair(Of String, String) In pendingOutputs
    data(pair.Key) = pair.Value
   Next
   If resolved.ContainsKey("download_path") Then data("download_path") = resolved("download_path")
   done = True
  Catch ex As Exception
   stepError = safeText(ex.Message)
   If stepCode = "" Then stepCode = If(TypeOf ex Is System.TimeoutException, "TIMEOUT", "TECHNICAL_ERROR")
  End Try
  If screenshotEach OrElse (Not done AndAlso screenshotOnError) Then
   Try
    imageName = "screenshots/" & invocation & "-" & stepId & "-" & attempt.ToString() & ".png"
    activePage.ScreenshotAsync(New Microsoft.Playwright.PageScreenshotOptions With {.Path = System.IO.Path.Combine(runDirectory, imageName), .FullPage = True, .Timeout = 5000}).GetAwaiter().GetResult()
   Catch captureEx As Exception
    imageName = ""
    emit("Warning", "artifact_warning", "Warning", "SCREENSHOT_FAILED", safeText(captureEx.Message))
   End Try
  End If

If done Then
 emit("Passed", "step_attempt_finished", "Info", "PASS", "")
Else
 emit("Failed", "step_attempt_finished", "Error", stepCode, stepError)
End If
passed = done : errorCode = stepCode : errorMessage = stepError
page = activePage
