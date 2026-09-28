Dim loadXml As Func(Of System.IO.Compression.ZipArchive, String, System.Xml.XmlDocument) = Function(archive As System.IO.Compression.ZipArchive, name As String)
    Dim entry As System.IO.Compression.ZipArchiveEntry = archive.GetEntry(name)
    If entry Is Nothing Then Throw New System.IO.InvalidDataException("Missing XLSX part: " & name)
    Dim doc As New System.Xml.XmlDocument()
    doc.XmlResolver = Nothing
    Dim settings As New System.Xml.XmlReaderSettings()
    settings.DtdProcessing = System.Xml.DtdProcessing.Prohibit
    settings.XmlResolver = Nothing
    Using stream As System.IO.Stream = entry.Open()
        Using reader As System.Xml.XmlReader = System.Xml.XmlReader.Create(stream, settings)
            doc.Load(reader)
        End Using
    End Using
    Return doc
End Function
Dim columnNumber As Func(Of String, Integer) = Function(address As String)
    Dim value As Integer = 0
    For Each ch As Char In address
        If ch < "A"c OrElse ch > "Z"c Then Exit For
        value = value * 26 + AscW(ch) - AscW("A"c) + 1
    Next
    Return value
End Function
Dim readSheet As Func(Of String, String, System.Collections.Generic.List(Of System.Collections.Generic.Dictionary(Of String, String))) =
    Function(filePath As String, wantedSheet As String)
        Dim output As New System.Collections.Generic.List(Of System.Collections.Generic.Dictionary(Of String, String))()
        Using archive As System.IO.Compression.ZipArchive = System.IO.Compression.ZipFile.OpenRead(filePath)
            Dim sharedStrings As New System.Collections.Generic.List(Of String)()
            Dim sharedEntry As System.IO.Compression.ZipArchiveEntry = archive.GetEntry("xl/sharedStrings.xml")
            If sharedEntry IsNot Nothing Then
                Dim sharedDoc As System.Xml.XmlDocument = loadXml(archive, "xl/sharedStrings.xml")
                For Each si As System.Xml.XmlNode In sharedDoc.SelectNodes("//*[local-name()='si']")
                    Dim text As New System.Text.StringBuilder()
                    For Each part As System.Xml.XmlNode In si.SelectNodes(".//*[local-name()='t']")
                        text.Append(part.InnerText)
                    Next
                    sharedStrings.Add(text.ToString())
                Next
            End If
            Dim workbook As System.Xml.XmlDocument = loadXml(archive, "xl/workbook.xml")
            Dim rels As System.Xml.XmlDocument = loadXml(archive, "xl/_rels/workbook.xml.rels")
            Dim sheetNode As System.Xml.XmlElement = Nothing
            For Each node As System.Xml.XmlElement In workbook.SelectNodes("//*[local-name()='sheet']")
                If node.GetAttribute("name") = wantedSheet Then sheetNode = node : Exit For
            Next
            If sheetNode Is Nothing Then Throw New System.IO.InvalidDataException("Missing sheet: " & wantedSheet)
            Dim rid As String = sheetNode.GetAttribute("id", "http://schemas.openxmlformats.org/officeDocument/2006/relationships")
            Dim relNode As System.Xml.XmlElement = Nothing
            For Each node As System.Xml.XmlElement In rels.SelectNodes("//*[local-name()='Relationship']")
                If node.GetAttribute("Id") = rid Then relNode = node : Exit For
            Next
            If relNode Is Nothing Then Throw New System.IO.InvalidDataException("Missing relationship for sheet: " & wantedSheet)
            Dim partName As String = relNode.GetAttribute("Target").Replace("\", "/")
            If partName.StartsWith("/") Then partName = partName.Substring(1)
            If Not partName.StartsWith("xl/") Then partName = "xl/" & partName
            Dim doc As System.Xml.XmlDocument = loadXml(archive, partName)
            Dim headers As New System.Collections.Generic.Dictionary(Of Integer, String)()
            Dim foundHeader As Boolean = False
            For Each row As System.Xml.XmlElement In doc.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")
                Dim cells As New System.Collections.Generic.Dictionary(Of Integer, String)()
                For Each node As System.Xml.XmlNode In row.ChildNodes
                    If Not TypeOf node Is System.Xml.XmlElement Then Continue For
                    Dim cell As System.Xml.XmlElement = CType(node, System.Xml.XmlElement)
                    Dim col As Integer = columnNumber(cell.GetAttribute("r"))
                    If col < 1 Then Continue For
                    Dim valueNode As System.Xml.XmlNode = cell.SelectSingleNode("*[local-name()='v']")
                    Dim value As String = If(valueNode Is Nothing, "", valueNode.InnerText)
                    If cell.GetAttribute("t") = "s" AndAlso value <> "" Then value = sharedStrings(Integer.Parse(value))
                    If cell.GetAttribute("t") = "b" Then value = If(value = "1", "1", "0")
                    If cell.GetAttribute("t") = "inlineStr" Then
                        Dim text As New System.Text.StringBuilder()
                        For Each part As System.Xml.XmlNode In cell.SelectNodes(".//*[local-name()='t']")
                            text.Append(part.InnerText)
                        Next
                        value = text.ToString()
                    End If
                    cells(col) = value
                Next
                If Not foundHeader Then
                    Dim first As String = If(cells.ContainsKey(1), cells(1), "")
                    If first = "scenario_id" OrElse first = "dataset_id" OrElse first = "name" OrElse first = "topic" Then
                        For Each pair As System.Collections.Generic.KeyValuePair(Of Integer, String) In cells
                            headers(pair.Key) = pair.Value
                        Next
                        foundHeader = True
                    End If
                Else
                    If cells.Count = 0 OrElse Not cells.Values.Any(Function(v) Not String.IsNullOrWhiteSpace(v)) Then Continue For
                    Dim record As New System.Collections.Generic.Dictionary(Of String, String)(System.StringComparer.Ordinal)
                    For Each pair As System.Collections.Generic.KeyValuePair(Of Integer, String) In headers
                        record(pair.Value) = If(cells.ContainsKey(pair.Key), cells(pair.Key), "")
                    Next
                    output.Add(record)
                End If
            Next
            If Not foundHeader Then Throw New System.IO.InvalidDataException(wantedSheet & ": header not found")
        End Using
        Return output
    End Function

book = New System.Data.DataSet("Cookbook")
For Each name As String In New String() {"settings", "scenarios", "steps", "elements", "data", "expected_results"}
 Dim records As System.Collections.Generic.List(Of System.Collections.Generic.Dictionary(Of String, String)) = readSheet(workbookPath, name)
 If records.Count = 0 Then Throw New Exception("Empty sheet: " & name)
 Dim table As New System.Data.DataTable(name)
 For Each key As String In records(0).Keys
  table.Columns.Add(key, GetType(String))
 Next
 For Each record As System.Collections.Generic.Dictionary(Of String, String) In records
  Dim row As System.Data.DataRow = table.NewRow()
  For Each key As String In record.Keys
   row(key) = record(key)
  Next
  table.Rows.Add(row)
 Next
 book.Tables.Add(table)
Next

' Reject ambiguous workbooks before opening a browser.
Dim keySheets As New System.Collections.Generic.Dictionary(Of String, String) From {{"settings", "name"}, {"scenarios", "scenario_id"}, {"elements", "name"}, {"data", "dataset_id"}, {"expected_results", "scenario_id"}}
For Each entry As System.Collections.Generic.KeyValuePair(Of String, String) In keySheets
 Dim keys As New System.Collections.Generic.HashSet(Of String)(StringComparer.Ordinal)
 For Each row As System.Data.DataRow In book.Tables(entry.Key).Rows
  Dim key As String = CStr(row(entry.Value))
  If String.IsNullOrWhiteSpace(key) OrElse Not keys.Add(key) Then Throw New Exception("Empty or duplicate key in " & entry.Key & ": " & key)
 Next
Next
Dim scenarioKeys As New System.Collections.Generic.HashSet(Of String)()
Dim elementKeys As New System.Collections.Generic.HashSet(Of String)()
Dim dataKeys As New System.Collections.Generic.HashSet(Of String)()
For Each row As System.Data.DataRow In book.Tables("data").Rows
 dataKeys.Add(CStr(row("dataset_id")))
Next
For Each row As System.Data.DataRow In book.Tables("scenarios").Rows
 scenarioKeys.Add(CStr(row("scenario_id")))
 If Not dataKeys.Contains(CStr(row("dataset_id"))) Then Throw New Exception("Unknown dataset for " & CStr(row("scenario_id")))
 If CStr(row("run_full")) <> "0" AndAlso CStr(row("run_full")) <> "1" Then Throw New Exception("run_full must be 0 or 1")
Next
For Each row As System.Data.DataRow In book.Tables("elements").Rows
 elementKeys.Add(CStr(row("name")))
 If String.IsNullOrWhiteSpace(CStr(row("selector"))) Then Throw New Exception("Empty selector: " & CStr(row("name")))
Next
Dim actions As New System.Collections.Generic.HashSet(Of String)(New String() {"navigate", "click", "fill", "select", "check", "press", "hover", "double_click", "upload", "download", "read_text", "read_table", "popup", "close_tab", "dialog", "wait", "assert"})
Dim orders As New System.Collections.Generic.HashSet(Of String)()
Dim used As New System.Collections.Generic.HashSet(Of String)()
For Each row As System.Data.DataRow In book.Tables("steps").Rows
 Dim id As String = CStr(row("scenario_id")), number As Integer = 0
 If Not scenarioKeys.Contains(id) Then Throw New Exception("Unknown scenario in steps: " & id)
 If Not Integer.TryParse(CStr(row("step_order")), number) OrElse number < 1 OrElse Not orders.Add(id & "/" & number.ToString()) Then Throw New Exception("Invalid or duplicate step number: " & id)
 used.Add(id)
 If Not actions.Contains(CStr(row("action"))) Then Throw New Exception("Unknown action: " & CStr(row("action")))
 If Not Integer.TryParse(CStr(row("timeout_ms")), number) OrElse number < 100 OrElse number > 300000 Then Throw New Exception("timeout_ms must be 100..300000: " & id)
 If Not Integer.TryParse(CStr(row("max_retries")), number) OrElse number < 0 OrElse number > 5 Then Throw New Exception("max_retries must be 0..5: " & id)
 If number > 0 AndAlso CStr(row("retry_condition")) = "" Then Throw New Exception("Retry requires retry_condition: " & id)
 Dim key As String = CStr(row("element"))
 If key <> "" AndAlso Not elementKeys.Contains(key) Then Throw New Exception("Unknown element: " & key)
 For Each column As String In New String() {"success_condition", "failure_condition", "retry_condition"}
  Dim value As String = CStr(row(column))
  If value <> "" AndAlso Not elementKeys.Contains(value.Split("|"c)(0)) Then Throw New Exception("Unknown condition element: " & value)
 Next
Next
For Each id As String In scenarioKeys
 If Not used.Contains(id) Then Throw New Exception("Scenario has no steps: " & id)
Next
Dim expectedKeys As New System.Collections.Generic.HashSet(Of String)()
For Each row As System.Data.DataRow In book.Tables("expected_results").Rows
 Dim id As String = CStr(row("scenario_id")), code As String = CStr(row("expected_result"))
 If Not scenarioKeys.Contains(id) Then Throw New Exception("Unknown scenario in expected_results: " & id)
 If Not New String() {"PASS", "BUSINESS_ERROR", "TIMEOUT", "CONFLICT"}.Contains(code) Then Throw New Exception("Invalid expected outcome: " & code)
 expectedKeys.Add(id)
Next
If Not expectedKeys.SetEquals(scenarioKeys) Then Throw New Exception("Every scenario requires a expected_results row")
