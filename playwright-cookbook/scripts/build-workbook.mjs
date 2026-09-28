import fs from 'node:fs/promises';import path from 'node:path';
import {Workbook,SpreadsheetFile} from '@oai/artifact-tool';
import {sheets} from './scenarios.mjs';
const root=path.resolve(import.meta.dirname,'..'),wb=Workbook.create();
const previewDir=path.join(root,'results/workbook-preview');await fs.mkdir(previewDir,{recursive:true});
for(const [name,values] of Object.entries(sheets)){
 const s=wb.worksheets.add(name),n=values.length,m=values[0].length;
 const all=s.getRangeByIndexes(0,0,n,m);all.values=values;
 all.format.font={name:'Arial',size:11,color:'#20334B'};all.format.rowHeight=29;all.format.verticalAlignment='center';
 all.format.columnWidth=26;s.showGridLines=false;
 const head=s.getRangeByIndexes(0,0,1,m);head.format.fill='#20334B';head.format.font={name:'Arial',size:11,bold:true,color:'#FFFFFF'};head.format.rowHeight=34;
 s.freezePanes.freezeRows(1);
 if(n>2){s.tables.add(s.getRangeByIndexes(0,0,n,m),true,'tb_'+name);}
 if(name==='instructions'){s.getRange('B1:B11').format.columnWidth=110;s.getRange('B1:B11').format.wrapText=true;s.getRange('A1:B11').format.rowHeight=38;}
 if(name==='steps'){
  s.getRange('B1:B'+n).format.columnWidth=16;s.getRange('C1:C'+n).format.columnWidth=32;s.getRange('F1:I'+n).format.columnWidth=45;s.getRange('F1:I'+n).format.wrapText=true;
  s.getRange('J1:K'+n).format.columnWidth=16;s.getRange('A2:K'+n).format.rowHeight=42;
  s.getRange('D2:D'+n).dataValidation={rule:{type:'list',values:['navigate','click','fill','select','check','press','hover','double_click','upload','download','read_text','read_table','popup','close_tab','dialog','wait','assert']}};
 }
 if(name==='scenarios'){s.getRange('B1:B'+n).format.columnWidth=45;s.getRange('E1:E'+n).format.columnWidth=78;s.getRange('E1:E'+n).format.wrapText=true;s.getRange('A2:E'+n).format.rowHeight=38;}
 if(name==='elements')s.getRange('B1:B'+n).format.columnWidth=55;
 if(name==='settings')s.getRange('B1:B'+n).format.columnWidth=42;
 if(name==='data'){s.getRange('D1:F'+n).format.columnWidth=34;s.getRange('A2:H'+n).format.fill='#FFF5D6';}
 if(name==='expected_results')s.getRange('B1:B'+n).dataValidation={rule:{type:'list',values:['PASS','BUSINESS_ERROR','TIMEOUT','CONFLICT']}};
}
wb.recalculate();
console.log((await wb.inspect({kind:'sheet',include:'id,name',maxChars:2500})).ndjson);
for(const name of Object.keys(sheets)){
 const end={instructions:'B11',settings:'B3',scenarios:'E9',steps:'F8',elements:'B9',data:'H9',expected_results:'B10'}[name];
 const p=await wb.render({sheetName:name,range:'A1:'+end,scale:1,format:'png'});
 await fs.writeFile(path.join(previewDir,name+'.png'),new Uint8Array(await p.arrayBuffer()));
}
const file=await SpreadsheetFile.exportXlsx(wb);await file.save(path.join(root,'scenarios.xlsx'));
console.log('Exported scenarios.xlsx: '+sheets.scenarios.length+' scenario header + rows');
