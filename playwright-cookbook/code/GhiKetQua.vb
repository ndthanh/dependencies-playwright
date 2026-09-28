__LOGGING__
Dim expectedCode As String = "PASS"
For Each row As System.Data.DataRow In book.Tables("expected_results").Rows
 If CStr(row("scenario_id")) = scenarioId Then expectedCode = CStr(row("expected_result"))
Next
Dim actual As String = If(passed, "PASS", errorCode)
Dim item As System.Data.DataRow = outcomes.NewRow()
item("scenario") = scenarioId
item("data") = If(data.ContainsKey("dataset_id"), data("dataset_id"), "")
item("expected") = expectedCode
item("actual") = actual
item("passed") = (actual = expectedCode).ToString()
item("detail") = errorMessage
item("round") = If(data.ContainsKey("round"), data("round"), "")
item("invocation") = data("__invocation")
item("case_id") = If(data.ContainsKey("case_id"), data("case_id"), "")
item("duration_ms") = data("__duration_ms")
item("attempts") = data("__attempts")
item("retries") = data("__retries")
item("skipped_steps") = data("__skipped")
outcomes.Rows.Add(item)
Dim snapshot As New System.Collections.Generic.List(Of Object)()
For Each outcome As System.Data.DataRow In outcomes.Rows
 Dim record As New System.Collections.Generic.Dictionary(Of String, Object)()
 For Each column As System.Data.DataColumn In outcomes.Columns
  record(column.ColumnName) = safeText(CStr(outcome(column)))
 Next
 snapshot.Add(record)
Next
System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "outcomes-progress.json"), logJson.Serialize(snapshot), New System.Text.UTF8Encoding(False))
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "scenario_evaluated"}, {"state", If(actual = expectedCode, "Passed", "Failed")}, {"severity", If(actual = expectedCode, "Info", "Error")}, {"scenario", scenarioId}, {"invocation", data("__invocation")}, {"data", item("data")}, {"caseId", item("case_id")}, {"round", item("round")}, {"expected", expectedCode}, {"actual", actual}, {"error", errorMessage}})
