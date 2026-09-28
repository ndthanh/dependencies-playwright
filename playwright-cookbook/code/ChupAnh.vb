System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(filePath))
page.ScreenshotAsync(New Microsoft.Playwright.PageScreenshotOptions With {.Path = filePath, .FullPage = True}).GetAwaiter().GetResult()
