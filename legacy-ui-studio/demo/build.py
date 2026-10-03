"""Optional WPF fixture for development only; the agent runs entirely as Python."""
from pathlib import Path
import subprocess
import os
root=Path(__file__).resolve().parent
framework=Path(os.environ.get('WINDIR','C:/Windows'))/'Microsoft.NET/Framework64/v4.0.30319'
refs=['PresentationCore.dll','PresentationFramework.dll','WindowsBase.dll','UIAutomationTypes.dll','UIAutomationProvider.dll']
subprocess.run([str(framework/'csc.exe'),'/nologo','/target:winexe','/r:'+str(framework/'System.Xaml.dll'),
    '/out:'+str(root/'PaneDemo.exe'),*['/r:'+str(framework/'WPF'/x) for x in refs],str(root/'PaneDemo.cs')],check=True)
