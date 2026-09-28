' Persist only business outputs; never persist the password column.
__LOGGING__
Dim branchCheckpoint As New System.Collections.Generic.List(Of Object)()
For Each branchRow As System.Data.DataRow In book.Tables("data").Rows
 If Not CStr(branchRow("dataset_id")).StartsWith("cn") Then Continue For
 Dim branchRecord As New System.Collections.Generic.Dictionary(Of String, Object)()
 For Each branchKey As String In New String() {"dataset_id", "case_id", "document_id", "status", "rejection_reason", "round"}
  branchRecord(branchKey) = safeText(System.Convert.ToString(branchRow(branchKey)))
 Next
 branchCheckpoint.Add(branchRecord)
Next
Dim checkpointJson As New System.Web.Script.Serialization.JavaScriptSerializer()
System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "branches-progress.json"), checkpointJson.Serialize(branchCheckpoint), New System.Text.UTF8Encoding(False))
