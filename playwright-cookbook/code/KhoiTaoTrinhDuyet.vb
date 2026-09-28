' Call once per session. Pass these four objects to other workflows in this process.
__LOGGING__
Dim dependencies As String = System.IO.Path.Combine(projectRoot, "dependencies")
Dim ffmpeg As String = System.IO.Path.Combine(dependencies, "ffmpeg-1011", "ffmpeg-win64.exe")
If recordVideo AndAlso Not System.IO.File.Exists(ffmpeg) Then Throw New System.IO.FileNotFoundException("Missing project FFmpeg", ffmpeg)
System.Environment.SetEnvironmentVariable("PLAYWRIGHT_BROWSERS_PATH", dependencies)
System.IO.Directory.CreateDirectory(System.IO.Path.Combine(runDirectory, "videos"))
playwright = Microsoft.Playwright.Playwright.CreateAsync().GetAwaiter().GetResult()
browser = playwright.Chromium.LaunchAsync(New Microsoft.Playwright.BrowserTypeLaunchOptions With {.Channel = "chrome", .Headless = headless, .SlowMo = slowMoMs, .Timeout = 30000}).GetAwaiter().GetResult()
Dim options As New Microsoft.Playwright.BrowserNewContextOptions With {.AcceptDownloads = True, .ViewportSize = New Microsoft.Playwright.ViewportSize With {.Width = 1280, .Height = 800}}
If recordVideo Then
 options.RecordVideoDir = System.IO.Path.Combine(runDirectory, "videos")
 options.RecordVideoSize = New Microsoft.Playwright.RecordVideoSize With {.Width = 1280, .Height = 800}
End If
context = browser.NewContextAsync(options).GetAwaiter().GetResult()
page = context.NewPageAsync().GetAwaiter().GetResult()
page.SetDefaultTimeout(10000)
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "browser_started"}, {"state", "Running"}, {"recordVideo", recordVideo}, {"headless", headless}, {"slowMoMs", slowMoMs}, {"ffmpeg", ffmpeg}, {"browserVersion", browser.Version}})
