$ErrorActionPreference = 'Stop'
$framework = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$refs = @('PresentationCore.dll','PresentationFramework.dll','WindowsBase.dll','UIAutomationTypes.dll','UIAutomationProvider.dll') | ForEach-Object { '/r:' + (Join-Path "$framework\WPF" $_) }
& "$framework\csc.exe" /nologo /target:winexe "/r:$framework\System.Xaml.dll" "/out:$PSScriptRoot\PaneDemo.exe" $refs "$PSScriptRoot\PaneDemo.cs"
if ($LASTEXITCODE -ne 0) { throw 'Demo compilation failed' }
