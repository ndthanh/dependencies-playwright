import fs from 'node:fs';import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll('\r','').replaceAll('\n','&#10;');
const types={str:'x:String',bool:'x:Boolean',int:'x:Int32',obj:'x:Object',book:'sd:DataSet',table:'sd:DataTable',row:'sd:DataRow',data:'scg:Dictionary(x:String,x:String)',page:'pw:IPage',browser:'pw:IBrowser',context:'pw:IBrowserContext',playwright:'pw:IPlaywright',rows:'scg:IEnumerable(sd:DataRow)'};
const references=['mscorlib','System','System.Core','System.Data','System.Activities','Microsoft.VisualBasic','RCA.Activities.Core','Microsoft.Playwright','netstandard','Microsoft.Bcl.AsyncInterfaces','System.Threading.Tasks.Extensions','System.Text.Json','System.Xml','System.IO.Compression','System.IO.Compression.FileSystem','System.Web','System.Web.Extensions'];
const contracts={
 DocExcel:[['In','str','workbookPath'],['Out','book','book']],
 KhoiTaoTrinhDuyet:[['In','str','projectRoot'],['In','str','runDirectory'],['In','bool','recordVideo'],['In','bool','headless'],['In','int','slowMoMs'],['Out','playwright','playwright'],['Out','browser','browser'],['Out','context','context'],['Out','page','page']],
 ChayKichBan:[['InOut','page','page'],['In','book','book'],['In','str','scenarioId'],['In','data','data'],['In','str','projectRoot'],['In','str','runDirectory'],['In','str','baseUrl'],['In','bool','screenshotEach'],['In','bool','screenshotOnError'],['Out','bool','passed'],['Out','str','errorCode'],['Out','str','errorMessage']],
 ChupAnh:[['In','page','page'],['In','str','filePath']],
 DongTrinhDuyet:[['In','playwright','playwright'],['In','browser','browser'],['In','context','context'],['In','page','page'],['In','str','runDirectory'],['In','bool','screenshotLast'],['Out','str','cleanupError']],
 BaoCao:[['In','book','book'],['In','table','outcomes'],['In','str','runDirectory'],['In','str','fatalError'],['In','str','cleanupError'],['Out','bool','allPassed']]
};
const args=(contract,map={})=>contract.map(([dir,t,n])=>`<${dir}Argument x:TypeArguments="${types[t]}" x:Key="${n}">[${esc(map[n]??n)}]</${dir}Argument>`).join('');
const vars=items=>`<Sequence.Variables>${items.map(([t,n,val])=>`<Variable x:TypeArguments="${types[t]}" Name="${n}"${val===undefined?'':` Default="${esc(val)}"`}/>`).join('')}</Sequence.Variables>`;
const seq=(body,v=[])=>`<Sequence>${v.length?vars(v):''}${body}</Sequence>`;
function activity(name,body,contract=[],defaults={}){
 if(/^\d/.test(name))name='Example_'+name;
 return `<?xml version="1.0" encoding="utf-8"?>\n<Activity x:Class="${name}" xmlns="http://schemas.microsoft.com/netfx/2009/xaml/activities" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml" xmlns:this="clr-namespace:" xmlns:rac="clr-namespace:RCA.Activities.Core;assembly=RCA.Activities.Core" xmlns:pw="clr-namespace:Microsoft.Playwright;assembly=Microsoft.Playwright" xmlns:sd="clr-namespace:System.Data;assembly=System.Data" xmlns:s="clr-namespace:System;assembly=mscorlib" xmlns:scg="clr-namespace:System.Collections.Generic;assembly=mscorlib" xmlns:sco="clr-namespace:System.Collections.ObjectModel;assembly=mscorlib">
 <x:Members>${contract.map(([d,t,n])=>`<x:Property Name="${n}" Type="${d}Argument(${types[t]})"/>`).join('')}</x:Members>
 ${Object.entries(defaults).map(([n,value])=>`<this:${name}.${n}>${esc(value)}</this:${name}.${n}>`).join('')}
 <TextExpression.NamespacesForImplementation><sco:Collection x:TypeArguments="x:String">${['System','System.Linq','System.Data','Microsoft.VisualBasic','System.Collections.Generic','Microsoft.Playwright','RCA.Activities.Core'].map(n=>`<x:String>${n}</x:String>`).join('')}</sco:Collection></TextExpression.NamespacesForImplementation>
 <TextExpression.ReferencesForImplementation><sco:Collection x:TypeArguments="AssemblyReference">${references.map(r=>`<AssemblyReference>${r}</AssemblyReference>`).join('')}</sco:Collection></TextExpression.ReferencesForImplementation>
 ${body}</Activity>`.replace(/[ \t]+\r?\n/g,'\n');
}
const invokeCode=(label,code,contract,map={})=>{
 code=code.replace('__LOGGING__',`Dim logBook As System.Data.DataSet = ${contract.some(c=>c[2]==='book')?'book':'Nothing'}\n`+fs.readFileSync(path.join(root,'code/SharedLogging.vb'),'utf8'));
 return `<rac:InvokeCode DisplayName="${esc(label)}" ContinueOnError="False" Code="${esc(code)}"><rac:InvokeCode.Arguments>${args(contract,map)}</rac:InvokeCode.Arguments></rac:InvokeCode>`;
};
const call=(name,map={},contract=contracts[name],folder='workflows')=>`<rac:InvokeWorkflowFile DisplayName="${esc(name)}" WorkflowFileName="[System.IO.Path.Combine(projectRoot, &quot;${folder}&quot;, &quot;${name}.xaml&quot;)]" ContinueOnError="False"><rac:InvokeWorkflowFile.Arguments>${args(contract,map)}</rac:InvokeWorkflowFile.Arguments></rac:InvokeWorkflowFile>`;
const each=(t,n,values,body,label)=>`<ForEach x:TypeArguments="${types[t]}" Values="[${esc(values)}]" DisplayName="${esc(label)}"><ForEach.Body><ActivityAction x:TypeArguments="${types[t]}"><ActivityAction.Argument><DelegateInArgument x:TypeArguments="${types[t]}" Name="${n}"/></ActivityAction.Argument>${seq(body)}</ActivityAction></ForEach.Body></ForEach>`;
const condition=(expr,body,label,otherwise='')=>`<If Condition="[${esc(expr)}]" DisplayName="${esc(label)}"><If.Then>${seq(body)}</If.Then>${otherwise?`<If.Else>${seq(otherwise)}</If.Else>`:''}</If>`;
contracts.ExecuteStep=[...contracts.ChayKichBan,['In','row','stepRow'],['In','str','invocation'],['In','int','attempt']];
contracts.KhoiTaoTrinhDuyet.push(['In','book','book']);
contracts.DongTrinhDuyet.push(['In','book','book']);
for(const [name,contract] of Object.entries(contracts)){
 if(name==='ChayKichBan')continue;
 fs.writeFileSync(path.join(root,'workflows',name+'.xaml'),activity(name,seq(invokeCode(name,fs.readFileSync(path.join(root,'code',name+'.vb'),'utf8'),contract)),contract));
}
const stepPrepare=invokeCode('Prepare scenario',fs.readFileSync(path.join(root,'code/ChayKichBan.vb'),'utf8'),[...contracts.ChayKichBan,['Out','rows','steps'],['Out','str','invocation']]);
const attemptPrepare=invokeCode('Start step retry budget','attempt = 0\nretryPending = True\nattemptPassed = False',[['Out','int','attempt'],['Out','bool','retryPending'],['Out','bool','attemptPassed']]);
const nextAttempt=invokeCode('Next attempt','attempt += 1\ndata("__attempts") = (Integer.Parse(data("__attempts")) + 1).ToString()',[['InOut','int','attempt'],['In','data','data']]);
const retryDecision=invokeCode('Only retry explicit recoverable signal',`__LOGGING__
retryPending = Not attemptPassed AndAlso errorCode = "RETRYABLE" AndAlso attempt <= Integer.Parse(CStr(stepRow("max_retries")))
delayMs = CInt(Math.Min(5000, 300 * Math.Pow(2, attempt - 1)))
If retryPending Then
 data("__retries") = (Integer.Parse(data("__retries")) + 1).ToString()
 logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "retry_scheduled"}, {"severity", "Warning"}, {"state", "Retry"}, {"scenario", scenarioId}, {"invocation", invocation}, {"data", data("dataset_id")}, {"caseId", If(data.ContainsKey("case_id"), data("case_id"), "")}, {"round", If(data.ContainsKey("round"), data("round"), "")}, {"step", CStr(stepRow("step_order"))}, {"action", CStr(stepRow("action"))}, {"attempt", attempt}, {"maxAttempts", Integer.Parse(CStr(stepRow("max_retries"))) + 1}, {"retryDelayMs", delayMs}, {"code", errorCode}, {"error", errorMessage}})
ElseIf Not attemptPassed AndAlso errorCode = "RETRYABLE" Then
 errorMessage = "Retry budget exhausted after " & attempt.ToString() & " attempt(s). " & errorMessage
End If`,[['In','book','book'],['In','str','runDirectory'],['In','str','scenarioId'],['In','str','invocation'],['In','data','data'],['In','row','stepRow'],['In','bool','attemptPassed'],['In','int','attempt'],['In','str','errorCode'],['InOut','str','errorMessage'],['Out','bool','retryPending'],['Out','int','delayMs']]);
const skipped=invokeCode('Record skipped step',`__LOGGING__
data("__skipped") = (Integer.Parse(data("__skipped")) + 1).ToString()
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "step_skipped"}, {"state", "Skipped"}, {"scenario", scenarioId}, {"invocation", invocation}, {"data", data("dataset_id")}, {"caseId", If(data.ContainsKey("case_id"), data("case_id"), "")}, {"round", If(data.ContainsKey("round"), data("round"), "")}, {"step", CStr(stepRow("step_order"))}, {"name", CStr(stepRow("step_name"))}, {"code", "PREVIOUS_STEP_FAILED"}})`,[['In','book','book'],['In','str','runDirectory'],['In','str','scenarioId'],['In','str','invocation'],['In','data','data'],['In','row','stepRow']]);
const stepLoop=each('row','stepRow','steps',condition('passed',attemptPrepare+`<While Condition="[retryPending]" DisplayName="While: bounded step attempts"><While.Body>${seq(nextAttempt+call('ExecuteStep',{passed:'attemptPassed'})+retryDecision+condition('retryPending','<Delay Duration="[System.TimeSpan.FromMilliseconds(delayMs)]" DisplayName="Delay: exponential backoff"/>','If retry: native Delay'))}</While.Body></While>`+invokeCode('Propagate step outcome','passed = attemptPassed',[['In','bool','attemptPassed'],['Out','bool','passed']]),'If scenario can continue',skipped),'For Each: Excel step');
const scenarioEnd=invokeCode('Scenario finished',`__LOGGING__
data("__duration_ms") = CLng((DateTime.UtcNow - DateTime.Parse(data("__started_at"), Nothing, System.Globalization.DateTimeStyles.RoundtripKind)).TotalMilliseconds).ToString()
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "scenario_finished"}, {"state", If(passed, "Passed", "Failed")}, {"severity", If(passed, "Info", "Error")}, {"scenario", scenarioId}, {"invocation", invocation}, {"data", data("dataset_id")}, {"caseId", If(data.ContainsKey("case_id"), data("case_id"), "")}, {"round", If(data.ContainsKey("round"), data("round"), "")}, {"durationMs", Long.Parse(data("__duration_ms"))}, {"code", If(passed, "PASS", errorCode)}, {"error", errorMessage}})`,contracts.ChayKichBan.filter(c=>c[2]!=='page').map(([d,t,n])=>['In',t,n]).concat([['In','str','invocation']]));
fs.writeFileSync(path.join(root,'workflows/ChayKichBan.xaml'),activity('ChayKichBan',seq(stepPrepare+stepLoop+scenarioEnd,[['rows','steps'],['str','invocation'],['int','attempt'],['int','delayMs'],['bool','retryPending'],['bool','attemptPassed']]),contracts.ChayKichBan));
const resultContract=[['In','book','book'],['In','table','outcomes'],['In','str','scenarioId'],['In','data','data'],['In','str','runDirectory'],['In','bool','passed'],['In','str','errorCode'],['In','str','errorMessage']];
const record=(map={})=>invokeCode('Ghi kết quả so với mong đợi',fs.readFileSync(path.join(root,'code/GhiKetQua.vb'),'utf8'),resultContract,map);
const run=(id)=>call('ChayKichBan',id?{scenarioId:'"'+id+'"'}:{})+record(id?{scenarioId:'"'+id+'"'}:{});
const prepareData=invokeCode('Lấy dữ liệu Excel',`data = New System.Collections.Generic.Dictionary(Of String, String)()
For Each column As System.Data.DataColumn In dataRow.Table.Columns
 data(column.ColumnName) = System.Convert.ToString(dataRow(column))
Next`,[['In','row','dataRow'],['Out','data','data']]);
const syncData=invokeCode('Lưu đầu ra vào hồ sơ',`For Each key As String In New String() {"document_id", "status", "rejection_reason", "round"}
 If data.ContainsKey(key) Then dataRow(key) = data(key)
Next
${fs.readFileSync(path.join(root,'code/BranchCheckpoint.vb'),'utf8')}`, [['In','book','book'],['In','str','runDirectory'],['In','row','dataRow'],['In','data','data']]);
const checkPassed=condition('Not passed',`<Throw Exception="[New System.Exception(errorCode &amp; &quot;: &quot; &amp; errorMessage)]"/>`,'Dừng flow nếu lỗi ngoài dự kiến');
const branchContract=[['InOut','page','page'],['In','book','book'],['In','table','outcomes'],['In','str','projectRoot'],['In','str','runDirectory'],['In','str','baseUrl'],['In','bool','screenshotEach'],['In','bool','screenshotOnError']];
const branchPrepare=invokeCode('Chuẩn bị 6 chi nhánh và các vòng kiểm tra',`For Each col As String In New String() {"document_id", "status", "rejection_reason", "round"}
 If Not book.Tables("data").Columns.Contains(col) Then book.Tables("data").Columns.Add(col, GetType(String))
 For Each row As System.Data.DataRow In book.Tables("data").Rows
  If row.IsNull(col) Then row(col) = ""
 Next
Next
branchRows = book.Tables("data").Select("dataset_id LIKE 'cn%'")
Dim count As Integer = 5
For Each row As System.Data.DataRow In book.Tables("settings").Rows
 If CStr(row("name")) = "max_rounds" Then count = Integer.Parse(CStr(row("value")))
Next
rounds = System.Linq.Enumerable.Range(1, count)
${fs.readFileSync(path.join(root,'code/BranchCheckpoint.vb'),'utf8')}`, [['In','book','book'],['In','str','runDirectory'],['Out','rows','branchRows'],['Out','obj','rounds']]);
const setRound=invokeCode('Truyền số vòng kiểm tra',`data("round") = round.ToString()
data("rejection_reason") = ""`,[['In','data','data'],['In','int','round']]);
const branchBody=seq(branchPrepare+
 each('row','dataRow','branchRows',prepareData+run('cn_dang_nhap')+checkPassed+run('cn_tai_len')+checkPassed+syncData+run('cn_dang_xuat')+checkPassed,'For Each: upload tất cả chi nhánh')+
 each('int','round','CType(rounds, System.Collections.Generic.IEnumerable(Of Integer))',each('row','dataRow','branchRows',condition('CStr(dataRow("status")) = "Chờ duyệt"',prepareData+setRound+run('cn_dang_nhap')+checkPassed+run('cn_kiem_tra')+checkPassed+condition('data("status") = "Từ chối"',run('cn_ly_do')+checkPassed,'If Từ chối: trích xuất lý do')+syncData+run('cn_dang_xuat')+checkPassed,'If hồ sơ còn Chờ duyệt'),'For Each: kiểm tra chi nhánh'),'For Each: vòng kiểm tra'),
 [['rows','branchRows'],['obj','rounds'],['data','data'],['bool','passed'],['str','errorCode'],['str','errorMessage']]);
fs.writeFileSync(path.join(root,'workflows/ChiNhanh.xaml'),activity('ChiNhanh',branchBody,branchContract));
const inputContract=[['In','str','projectRoot'],['In','str','workbookPath'],['In','str','selectedScenario'],['In','str','selectedData'],['In','str','baseUrl'],['In','bool','recordVideo'],['In','bool','screenshotEach'],['In','bool','screenshotLast'],['In','bool','screenshotOnError'],['In','bool','headless'],['In','int','slowMoMs']];
const defaultArgs={projectRoot:'.',workbookPath:'',selectedScenario:'',selectedData:'',baseUrl:'',recordVideo:'True',screenshotEach:'True',screenshotLast:'True',screenshotOnError:'True',headless:'False',slowMoMs:'100'};
const mainVars=[['str','runDirectory'],['book','book'],['table','outcomes'],['rows','scenarioRows'],['data','data'],['row','dataRow'],['str','scenarioId'],['playwright','playwright'],['browser','browser'],['context','context'],['page','page'],['bool','passed'],['str','errorCode'],['str','errorMessage'],['str','fatalError',''],['str','cleanupError',''],['bool','allPassed']];
const prepare=invokeCode('Chuẩn bị lần chạy',`Dim envRoot As String = System.Environment.GetEnvironmentVariable("COOKBOOK_ROOT")
If Not String.IsNullOrWhiteSpace(envRoot) Then projectRoot = envRoot
projectRoot = System.IO.Path.GetFullPath(projectRoot)
Dim overrideValue As String = System.Environment.GetEnvironmentVariable("COOKBOOK_SCENARIO")
If overrideValue IsNot Nothing Then selectedScenario = overrideValue
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_DATA")
If overrideValue IsNot Nothing Then selectedData = overrideValue
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_URL")
If overrideValue IsNot Nothing Then baseUrl = overrideValue
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_WORKBOOK")
If overrideValue IsNot Nothing Then workbookPath = overrideValue
If String.IsNullOrWhiteSpace(workbookPath) Then workbookPath = System.IO.Path.Combine(projectRoot, "scenarios.xlsx")
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_VIDEO")
If overrideValue IsNot Nothing Then recordVideo = overrideValue = "1"
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_SCREENSHOTS")
If overrideValue IsNot Nothing Then screenshotEach = overrideValue = "1"
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_LAST")
If overrideValue IsNot Nothing Then screenshotLast = overrideValue = "1"
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_ERROR_SHOT")
If overrideValue IsNot Nothing Then screenshotOnError = overrideValue = "1"
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_HEADLESS")
If overrideValue IsNot Nothing Then headless = overrideValue = "1"
overrideValue = System.Environment.GetEnvironmentVariable("COOKBOOK_SLOWMO")
If overrideValue IsNot Nothing Then slowMoMs = Integer.Parse(overrideValue)
runDirectory = System.Environment.GetEnvironmentVariable("COOKBOOK_RUN_DIR")
If String.IsNullOrWhiteSpace(runDirectory) Then runDirectory = System.IO.Path.Combine(projectRoot, "results", DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") & "-" & Guid.NewGuid().ToString("N").Substring(0,8))
For Each folder As String In New String() {"screenshots", "videos", "downloads"}
 System.IO.Directory.CreateDirectory(System.IO.Path.Combine(runDirectory, folder))
Next
outcomes = New System.Data.DataTable("outcomes")
For Each key As String In New String() {"scenario", "data", "round", "expected", "actual", "passed", "detail", "invocation", "case_id", "duration_ms", "attempts", "retries", "skipped_steps"}
 outcomes.Columns.Add(key, GetType(String))
Next
System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "started.txt"), DateTime.UtcNow.ToString("o"))
__LOGGING__
Dim workbookHash As String = ""
If System.IO.File.Exists(workbookPath) Then
 Using hasher As System.Security.Cryptography.SHA256 = System.Security.Cryptography.SHA256.Create()
  workbookHash = BitConverter.ToString(hasher.ComputeHash(System.IO.File.ReadAllBytes(workbookPath))).Replace("-", "").ToLowerInvariant()
 End Using
End If
Dim metadata As New System.Collections.Generic.Dictionary(Of String, Object) From {{"schemaVersion", "1.0"}, {"runId", System.IO.Path.GetFileName(runDirectory)}, {"bot", "PlaywrightCookbook"}, {"version", "0.4.0"}, {"startedAtUtc", System.IO.File.ReadAllText(System.IO.Path.Combine(runDirectory, "started.txt"))}, {"workbook", System.IO.Path.GetFileName(workbookPath)}, {"workbookSha256", workbookHash}, {"scenario", selectedScenario}, {"dataset", selectedData}, {"recordVideo", recordVideo}, {"screenshotEach", screenshotEach}, {"screenshotLast", screenshotLast}, {"screenshotOnError", screenshotOnError}, {"headless", headless}, {"slowMoMs", slowMoMs}}
System.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "run.json"), logJson.Serialize(metadata), New System.Text.UTF8Encoding(False))
logEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "run_started"}, {"state", "Running"}})`,[...inputContract.map(([d,t,n])=>['InOut',t,n]),['Out','str','runDirectory'],['Out','table','outcomes']]);
const selectCases=invokeCode('Chọn kịch bản trong workbook',`If String.IsNullOrWhiteSpace(baseUrl) Then
 For Each row As System.Data.DataRow In book.Tables("settings").Rows
  If CStr(row("name")) = "base_url" Then baseUrl = CStr(row("value"))
 Next
End If
Dim chosen As New System.Collections.Generic.List(Of System.Data.DataRow)()
For Each row As System.Data.DataRow In book.Tables("scenarios").Rows
 If (selectedScenario = "" AndAlso CStr(row("run_full")) = "1") OrElse CStr(row("scenario_id")) = selectedScenario Then chosen.Add(row)
Next
If chosen.Count = 0 AndAlso selectedScenario <> "chi_nhanh" Then Throw New Exception("Unknown or empty scenario: " & selectedScenario)
scenarioRows = chosen`,[['In','book','book'],['In','str','selectedScenario'],['InOut','str','baseUrl'],['Out','rows','scenarioRows']]);
const selectData=invokeCode('Chọn bộ dữ liệu',`scenarioId = CStr(scenarioRow("scenario_id"))
Dim wanted As String = If(selectedData = "", CStr(scenarioRow("dataset_id")), selectedData)
dataRow = Nothing
For Each row As System.Data.DataRow In book.Tables("data").Rows
 If CStr(row("dataset_id")) = wanted Then dataRow = row : Exit For
Next
If dataRow Is Nothing Then Throw New Exception("Unknown dataset: " & wanted)`,[['In','book','book'],['In','row','scenarioRow'],['In','str','selectedData'],['Out','row','dataRow'],['Out','str','scenarioId']]);
const catchBody=invokeCode('Ghi lỗi ngoài kịch bản','__LOGGING__\nfatalError = safeText(caught.ToString())\nSystem.IO.File.WriteAllText(System.IO.Path.Combine(runDirectory, "fatal.log"), fatalError)\nlogEvent(New System.Collections.Generic.Dictionary(Of String, Object) From {{"eventType", "run_error"}, {"state", "Failed"}, {"severity", "Error"}, {"code", "UNHANDLED_ERROR"}, {"error", fatalError}})',[['In','book','book'],['In','obj','caught'],['In','str','runDirectory'],['Out','str','fatalError']]);
const mainBody=seq(prepare+`<TryCatch DisplayName="Run / cleanup / report"><TryCatch.Try>${seq(call('DocExcel')+selectCases+call('KhoiTaoTrinhDuyet')+
 each('row','scenarioRow','scenarioRows',selectData+prepareData+run(),'For Each: chạy kịch bản Excel')+
 condition('selectedScenario = "" OrElse selectedScenario = "chi_nhanh"',call('ChiNhanh',{},branchContract),'If chạy luồng 6 chi nhánh'))}</TryCatch.Try><TryCatch.Catches><Catch x:TypeArguments="s:Exception"><ActivityAction x:TypeArguments="s:Exception"><ActivityAction.Argument><DelegateInArgument x:TypeArguments="s:Exception" Name="caught"/></ActivityAction.Argument>${seq(catchBody)}</ActivityAction></Catch></TryCatch.Catches><TryCatch.Finally>${seq(call('DongTrinhDuyet')+call('BaoCao'))}</TryCatch.Finally></TryCatch>`+
 `<rac:LogMessage Level="Info" Message="[&quot;REPORT=&quot; &amp; System.IO.Path.Combine(runDirectory, &quot;report.html&quot;)]"/>`+
 condition('Not allPassed','<Throw Exception="[New System.Exception(&quot;Cookbook run failed; inspect report.html&quot;)]"/>','If kết quả không đạt'),mainVars);
fs.writeFileSync(path.join(root,'Main.xaml'),activity('Main',mainBody,inputContract,defaultArgs));
const examples={'01_DangNhap':'dang_nhap','02_NhapLieu':'nhap_lieu','03_DocBang':'doc_bang','04_Upload':'upload_cham','05_Download':'download_cham','06_ChoVaThuLai':'cho_thu_lai','07_NhieuChiNhanh':'chi_nhanh','08_CuaSoIframe':'cua_so_iframe'};
for(const [name,id] of Object.entries(examples))fs.writeFileSync(path.join(root,'examples',name+'.xaml'),activity(name,mainBody,inputContract,{...defaultArgs,selectedScenario:id}));
console.log('Built Main, '+Object.keys(examples).length+' examples and '+(Object.keys(contracts).length+1)+' reusable workflows.');
// Faults are available only in this opt-in QA workflow, never in production Main.
if(process.argv.includes('--qa')){
 const injection=invokeCode('QA: deterministic fault injection',`Dim fault As String = System.Environment.GetEnvironmentVariable("COOKBOOK_QA_CASE")
If fault = "retry_exhausted" Then
 For Each row As System.Data.DataRow In book.Tables("steps").Rows
  If CStr(row("scenario_id")) = "tai_trang_thu_lai" AndAlso CStr(row("step_order")) = "1" Then
   row("value") = CStr(row("value")).Replace("retry-once", "retry-always") : row("max_retries") = "2"
  End If
 Next
ElseIf fault = "capture_failure" Then
 Dim target As String = System.IO.Path.Combine(runDirectory, "screenshots")
 System.IO.Directory.Delete(target)
 System.IO.File.WriteAllText(target, "QA intentionally blocks screenshot directory")
ElseIf fault = "sensitive_failure" Then
 For Each row As System.Data.DataRow In book.Tables("steps").Rows
  If CStr(row("scenario_id")) = "dang_nhap" AndAlso CStr(row("step_order")) = "2" Then row("value") = "$" & "{DemoOnly!2026}"
 Next
ElseIf fault = "snapshot_locked" Then
 Dim target As String = System.IO.Path.Combine(runDirectory, "current.json")
 Dim lockFile As New System.IO.FileStream(target, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.Read)
 System.Threading.Tasks.Task.Run(Sub()
  System.Threading.Thread.Sleep(15000)
  lockFile.Dispose()
 End Sub)
End If`,[['In','book','book'],['In','str','runDirectory']]);
 const dir=path.join(root,'results/qa');fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,'ObservabilityHarness.xaml'),activity('ObservabilityHarness',mainBody.replace(call('DocExcel'),()=>call('DocExcel')+injection),inputContract,defaultArgs));
 // Validate Invoke Code compilation/checkpoints when a browser cannot start.
 // Deliberately passes Nothing for Page; expected outcome is TECHNICAL_ERROR.
 const chooseOffline=invokeCode('QA: choose offline compilation fixture','scenarioId = "dang_nhap"\ndataRow = book.Tables("data").Rows(0)',[['In','book','book'],['Out','str','scenarioId'],['Out','row','dataRow']]);
 fs.writeFileSync(path.join(dir,'OfflineCompile.xaml'),activity('OfflineCompile',seq(prepare+call('DocExcel')+branchPrepare+chooseOffline+prepareData+syncData+run()+call('DongTrinhDuyet')+call('BaoCao'),[...mainVars,['rows','branchRows'],['obj','rounds']]),inputContract,defaultArgs));
}
