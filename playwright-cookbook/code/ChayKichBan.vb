' Prepare only. Native ForEach / While / If / Delay in ChayKichBan.xaml own control flow.
__LOGGING__
Dim chosen As New System.Collections.Generic.List(Of System.Data.DataRow)()
For Each row As System.Data.DataRow In book.Tables("steps").Rows
 If CStr(row("scenario_id")) = scenarioId Then chosen.Add(row)
Next
chosen.Sort(Function(a As System.Data.DataRow, b As System.Data.DataRow) Integer.Parse(CStr(a("step_order"))).CompareTo(Integer.Parse(CStr(b("step_order")))))
If chosen.Count = 0 Then Throw New Exception("No steps for scenario: " & scenarioId)
steps = chosen
invocation = Guid.NewGuid().ToString("N")
data("__invocation") = invocation
data("__started_at") = DateTime.UtcNow.ToString("o")
data("__attempts") = "0" : data("__retries") = "0" : data("__skipped") = "0"
passed = True : errorCode = "" : errorMessage = ""
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "scenario_started"}, {"state", "Running"}, {"scenario", scenarioId}, {"invocation", invocation}, {"data", If(data.ContainsKey("dataset_id"), data("dataset_id"), "")}, {"caseId", If(data.ContainsKey("case_id"), data("case_id"), "")}, {"round", If(data.ContainsKey("round"), data("round"), "")}})
