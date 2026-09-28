using System;using System.Collections.Generic;using System.IO;using System.IO.Compression;using System.Linq;using System.Text;using System.Text.RegularExpressions;using System.Xml;
namespace BranchLab {
public sealed class WorkbookPackage {
 public Dictionary<string,List<Dictionary<string,string>>> Tables=new Dictionary<string,List<Dictionary<string,string>>>();
 public Dictionary<string,string> Settings; public Dictionary<string,Dictionary<string,string>> Scenarios,Targets,Conditions;
 public List<Dictionary<string,string>> Steps,Rules,Items;
 static XmlDocument Xml(ZipArchive zip,string name){var e=zip.GetEntry(name);if(e==null)throw new InvalidDataException("Missing XLSX part: "+name);var d=new XmlDocument();d.XmlResolver=null;using(var s=e.Open())using(var r=XmlReader.Create(s,new XmlReaderSettings{DtdProcessing=DtdProcessing.Prohibit,XmlResolver=null}))d.Load(r);return d;}
 static string Rel(string from,string target){return new Uri(new Uri("http://xlsx/"+from),target).AbsolutePath.TrimStart('/');}
 static Dictionary<string,string> Rels(ZipArchive z,string file){return Xml(z,file).DocumentElement.ChildNodes.Cast<XmlElement>().Where(x=>x.GetAttribute("TargetMode")!="External").ToDictionary(x=>x.GetAttribute("Id"),x=>x.GetAttribute("Target"));}
 static int Col(string address){int v=0;foreach(char c in address){if(c<'A'||c>'Z')break;v=v*26+c-'A'+1;}return v;}
 static string Text(XmlElement c,List<string> shared){var v=c.SelectSingleNode("*[local-name()='v']");string t=v==null?"":v.InnerText;return c.GetAttribute("t")=="s"?shared[int.Parse(t)]:c.GetAttribute("t")=="inlineStr"?string.Concat(c.SelectNodes(".//*[local-name()='t']").Cast<XmlNode>().Select(x=>x.InnerText)):t;}
 public WorkbookPackage(string path){using(var z=ZipFile.OpenRead(path)){
  var shared=new List<string>();if(z.GetEntry("xl/sharedStrings.xml")!=null)foreach(XmlNode n in Xml(z,"xl/sharedStrings.xml").SelectNodes("//*[local-name()='si']"))shared.Add(string.Concat(n.SelectNodes(".//*[local-name()='t']").Cast<XmlNode>().Select(x=>x.InnerText)));
  var rels=Rels(z,"xl/_rels/workbook.xml.rels");
  foreach(XmlElement sh in Xml(z,"xl/workbook.xml").SelectNodes("//*[local-name()='sheet']")){
   string name=sh.GetAttribute("name");if(!Regex.IsMatch(name,"^[a-z][a-z0-9_]*$"))throw new InvalidDataException("Tên sheet phải snake_case không dấu: "+name);
   string part=Rel("xl/workbook.xml",rels[sh.GetAttribute("id","http://schemas.openxmlformats.org/officeDocument/2006/relationships")]);var doc=Xml(z,part);
   string relPart=System.IO.Path.GetDirectoryName(part).Replace('\\','/')+"/_rels/"+System.IO.Path.GetFileName(part)+".rels";
   if(z.GetEntry(relPart)==null)continue;var sr=Rels(z,relPart);XmlElement table=null;
   foreach(XmlElement tp in doc.SelectNodes("//*[local-name()='tablePart']")){var td=Xml(z,Rel(part,sr[tp.GetAttribute("id","http://schemas.openxmlformats.org/officeDocument/2006/relationships")])).DocumentElement;if(td.GetAttribute("name")=="tbl_"+name)table=td;}
   if(table==null)throw new InvalidDataException(name+": missing named table tbl_"+name);
   var ends=table.GetAttribute("ref").Split(':');int first=int.Parse(Regex.Match(ends[0],"[0-9]+").Value),last=int.Parse(Regex.Match(ends[1],"[0-9]+").Value),left=Col(ends[0]),right=Col(ends[1]);
   var headers=new Dictionary<int,string>();var rows=new List<Dictionary<string,string>>();
   foreach(XmlElement row in doc.SelectNodes("//*[local-name()='sheetData']/*[local-name()='row']")){
    int rn=int.Parse(row.GetAttribute("r"));if(rn<first||rn>last)continue;var values=new Dictionary<int,string>();
    foreach(XmlElement c in row.ChildNodes){int cn=Col(c.GetAttribute("r"));if(cn<left||cn>right)continue;if(c.SelectSingleNode("*[local-name()='f']")!=null)throw new InvalidDataException(name+"!"+c.GetAttribute("r")+": formula not allowed in runner configuration");values[cn]=Text(c,shared);}
    if(rn==first){for(int i=left;i<=right;i++){string h=values.ContainsKey(i)?values[i]:"";if(string.IsNullOrEmpty(h)||headers.Values.Contains(h))throw new InvalidDataException(name+": invalid/duplicate header");headers[i]=h;}continue;}
    var record=headers.ToDictionary(h=>h.Value,h=>values.ContainsKey(h.Key)?values[h.Key]:"");if(record.Values.All(string.IsNullOrWhiteSpace))continue;record["_source"]=name+"!A"+rn;rows.Add(record);
   }Tables.Add(name,rows);
  }
 }
 foreach(string t in new[]{"thong_tin","kich_ban","buoc","doi_tuong","dieu_kien","ket_qua","tham_so","du_lieu"})if(!Tables.ContainsKey(t))throw new InvalidDataException("Missing sheet/table "+t);
 Settings=Unique(Tables["thong_tin"],"key").ToDictionary(x=>x.Key,x=>Get(x.Value,"value"));if(GetSetting("schema_version")!="1.0")throw new InvalidDataException("Unsupported schema_version");
 Scenarios=Unique(Tables["kich_ban"],"scenario_id");Targets=Unique(Tables["doi_tuong"],"target_id");Conditions=Unique(Tables["dieu_kien"],"condition_id");Steps=Tables["buoc"];Rules=Tables["ket_qua"];Items=Tables["du_lieu"];Validate();
 }
 public string GetSetting(string key){if(!Settings.ContainsKey(key))throw new InvalidDataException("Missing setting: "+key);return Settings[key];}
 public static string Get(Dictionary<string,string> r,string k){if(!r.ContainsKey(k))throw new InvalidDataException(r["_source"]+": missing column "+k);return r[k];}
 public static int Number(Dictionary<string,string> r,string k,int min,int max){int v;if(!int.TryParse(Get(r,k),out v)||v<min||v>max)throw new InvalidDataException(r["_source"]+": "+k+" must be "+min+".."+max);return v;}
 static Dictionary<string,Dictionary<string,string>> Unique(List<Dictionary<string,string>> rows,string key){var d=new Dictionary<string,Dictionary<string,string>>(StringComparer.Ordinal);foreach(var r in rows){var k=Get(r,key);if(string.IsNullOrWhiteSpace(k)||d.ContainsKey(k))throw new InvalidDataException(r["_source"]+": empty or duplicate "+key);d.Add(k,r);}return d;}
 void Validate(){
  foreach(var c in Conditions.Values){if(!Targets.ContainsKey(Get(c,"target_id")))throw new InvalidDataException(c["_source"]+": unknown target");if(!new[]{"visible","hidden","text","value","nonempty"}.Contains(Get(c,"operator")))throw new InvalidDataException(c["_source"]+": unsupported operator");}
  foreach(var t in Targets.Values)if(string.IsNullOrWhiteSpace(Get(t,"selector")))throw new InvalidDataException(t["_source"]+": empty selector");
  var seen=new HashSet<string>();var orders=new HashSet<string>();foreach(var s in Steps){var id=Get(s,"scenario_id");if(!Scenarios.ContainsKey(id))throw new InvalidDataException(s["_source"]+": unknown scenario");if(!seen.Add(id+"/"+Get(s,"step_id"))||!orders.Add(id+"/"+Number(s,"order",1,10000)))throw new InvalidDataException(s["_source"]+": duplicate step/order");if(!new[]{"navigate","fill","click","upload","read_text"}.Contains(Get(s,"action")))throw new InvalidDataException(s["_source"]+": unsupported action");if(Get(s,"action")!="navigate"&&!Targets.ContainsKey(Get(s,"target_id")))throw new InvalidDataException(s["_source"]+": unknown target");Number(s,"timeout_ms",100,300000);Number(s,"max_retries",0,5);Number(s,"retry_delay_ms",0,30000);if(s["max_retries"]!="0"&&!Rules.Any(r=>r["scenario_id"]==id&&r["step_id"]==s["step_id"]&&r["effect"]=="retry"))throw new InvalidDataException(s["_source"]+": retry needs an explicit condition");}
  foreach(var r in Rules){if(!seen.Contains(Get(r,"scenario_id")+"/"+Get(r,"step_id"))||!Conditions.ContainsKey(Get(r,"condition_id")))throw new InvalidDataException(r["_source"]+": unknown step/condition");if(!new[]{"continue","retry","fail"}.Contains(Get(r,"effect")))throw new InvalidDataException(r["_source"]+": unsupported effect");}
  foreach(var s in Scenarios.Values){Number(s,"timeout_ms",100,900000);if(!Steps.Any(x=>x["scenario_id"]==s["scenario_id"]))throw new InvalidDataException(s["_source"]+": empty scenario");}
  Unique(Items,"item_id");foreach(var r in Items){if(!Regex.IsMatch(Get(r,"item_id"),"^[A-Za-z0-9_-]+$"))throw new InvalidDataException(r["_source"]+": invalid item_id");if(!new[]{"1","0","TRUE","FALSE","true","false"}.Contains(Get(r,"enabled")))throw new InvalidDataException(r["_source"]+": invalid enabled");foreach(var key in new[]{"account","credential_ref","file_path","fault_mode"})if(string.IsNullOrEmpty(Get(r,key)))throw new InvalidDataException(r["_source"]+": empty "+key);}
 }
}}
