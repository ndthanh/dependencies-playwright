' Close the context before browser: Playwright finalizes every page video here.
__LOGGING__
Dim failures As New System.Collections.Generic.List(Of String)()
Try
 If screenshotLast AndAlso page IsNot Nothing AndAlso Not page.IsClosed Then
  page.ScreenshotAsync(New Microsoft.Playwright.PageScreenshotOptions With {.Path = System.IO.Path.Combine(runDirectory, "screenshots", "last.png"), .FullPage = True, .Timeout = 5000}).GetAwaiter().GetResult()
  logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "last_screenshot_saved"}, {"state", "Passed"}, {"screenshot", "screenshots/last.png"}})
 End If
Catch ex As Exception
 logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "artifact_warning"}, {"state", "Warning"}, {"severity", "Warning"}, {"code", "LAST_SCREENSHOT_FAILED"}, {"error", safeText(ex.Message)}})
End Try
Try
 If context IsNot Nothing Then context.CloseAsync().GetAwaiter().GetResult()
Catch ex As Exception
 failures.Add("Context close/video finalization: " & ex.Message)
End Try
Try
 If browser IsNot Nothing Then browser.CloseAsync().GetAwaiter().GetResult()
Catch ex As Exception
 failures.Add("Browser close: " & ex.Message)
End Try
Try
 If playwright IsNot Nothing Then playwright.Dispose()
Catch ex As Exception
 failures.Add("Playwright dispose: " & ex.Message)
End Try
cleanupError = safeText(String.Join(System.Environment.NewLine, failures))
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "browser_closed"}, {"state", If(cleanupError = "", "Passed", "Failed")}, {"severity", If(cleanupError = "", "Info", "Error")}, {"error", cleanupError}})
