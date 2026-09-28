Dim logDirectory As String = runDirectory
' Embedded by build-xaml.mjs. No custom assembly or runtime dependency.
Dim logJson As New System.Web.Script.Serialization.JavaScriptSerializer()
logJson.MaxJsonLength = 16777216
Dim secretValues As New System.Collections.Generic.List(Of String)()
If logBook IsNot Nothing AndAlso logBook.Tables.Contains("data") Then
 For Each secretRow As System.Data.DataRow In logBook.Tables("data").Rows
  For Each secretColumn As System.Data.DataColumn In secretRow.Table.Columns
   If System.Text.RegularExpressions.Regex.IsMatch(secretColumn.ColumnName, "password|secret|token|credential", System.Text.RegularExpressions.RegexOptions.IgnoreCase) Then
    Dim secret As String = System.Convert.ToString(secretRow(secretColumn))
    If secret <> "" Then secretValues.Add(secret)
   End If
  Next
 Next
End If
secretValues.Sort(Function(a As String, b As String) b.Length.CompareTo(a.Length))
Dim safeText As Func(Of String, String) = Function(raw As String)
 Dim clean As String = If(raw, "")
 For Each secret As String In secretValues
  clean = clean.Replace(secret, "[REDACTED]")
 Next
 Return clean
End Function
Dim logEvent As Action(Of System.Collections.Generic.Dictionary(Of String, Object)) = Sub(entry As System.Collections.Generic.Dictionary(Of String, Object))
 Dim now As DateTime = DateTime.UtcNow
 Dim defaults As New System.Collections.Generic.Dictionary(Of String, Object) From {{"schemaVersion", "1.0"}, {"runId", System.IO.Path.GetFileName(logDirectory)}, {"bot", "PlaywrightCookbook"}, {"host", "akaBot"}, {"eventId", Guid.NewGuid().ToString("N")}, {"time", now.ToString("o")}, {"severity", "Info"}, {"scenario", ""}, {"invocation", ""}, {"data", ""}, {"caseId", ""}, {"round", ""}, {"step", ""}, {"name", ""}, {"action", ""}, {"state", ""}, {"attempt", 0}, {"maxAttempts", 0}, {"durationMs", 0}, {"code", ""}, {"error", ""}, {"screenshot", ""}, {"video", ""}, {"artifacts", New String() {}}}
 For Each pair As System.Collections.Generic.KeyValuePair(Of String, Object) In defaults
  If Not entry.ContainsKey(pair.Key) Then entry(pair.Key) = pair.Value
 Next
 Dim startFile As String = System.IO.Path.Combine(logDirectory, "started.txt")
 If System.IO.File.Exists(startFile) Then entry("runElapsedMs") = CLng((now - DateTime.Parse(System.IO.File.ReadAllText(startFile), Nothing, System.Globalization.DateTimeStyles.RoundtripKind)).TotalMilliseconds)
 Dim line As String = logJson.Serialize(entry)
 For Each secret As String In secretValues
  Dim encoded As String = logJson.Serialize(secret)
  line = line.Replace(encoded.Substring(1, encoded.Length - 2), "[REDACTED]")
 Next
 System.IO.File.AppendAllText(System.IO.Path.Combine(logDirectory, "events.jsonl"), line & Environment.NewLine, New System.Text.UTF8Encoding(False))
 System.IO.File.AppendAllText(System.IO.Path.Combine(logDirectory, "run.log"), line & Environment.NewLine, New System.Text.UTF8Encoding(False))
 System.Console.WriteLine("COOKBOOK_EVENT " & line)
 Dim current As String = System.IO.Path.Combine(logDirectory, "current.json"), temporary As String = current & ".tmp"
 ' Snapshot is a convenience for highlighting, not the source of truth.
 ' A sync client/reader may temporarily lock it; never repeat a web action for this.
 Try
  System.IO.File.WriteAllText(temporary, line, New System.Text.UTF8Encoding(False))
  If System.IO.File.Exists(current) Then
   System.IO.File.Replace(temporary, current, Nothing)
  Else
   System.IO.File.Move(temporary, current)
  End If
 Catch snapshotError As Exception
  Dim warning As New System.Collections.Generic.Dictionary(Of String, Object)(defaults)
  warning("eventId") = Guid.NewGuid().ToString("N")
  warning("eventType") = "telemetry_warning" : warning("severity") = "Warning" : warning("state") = "Warning"
  warning("code") = "CURRENT_SNAPSHOT_FAILED" : warning("error") = "current.json could not be updated; events.jsonl remains authoritative."
  If entry.ContainsKey("runElapsedMs") Then warning("runElapsedMs") = entry("runElapsedMs")
  Dim warningLine As String = logJson.Serialize(warning)
  System.IO.File.AppendAllText(System.IO.Path.Combine(logDirectory, "events.jsonl"), warningLine & Environment.NewLine, New System.Text.UTF8Encoding(False))
  System.IO.File.AppendAllText(System.IO.Path.Combine(logDirectory, "run.log"), warningLine & Environment.NewLine, New System.Text.UTF8Encoding(False))
  System.Console.WriteLine("COOKBOOK_EVENT " & warningLine)
 End Try
End Sub
