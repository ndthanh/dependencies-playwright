import fs from 'node:fs';import path from 'node:path';
const root=import.meta.dirname;
const obj=(properties,required=[])=>({type:'object',additionalProperties:false,properties,required});
const str={type:'string'},id={type:'string',minLength:1},integer=(min,max)=>({type:'integer',minimum:min,maximum:max});
const selector={oneOf:[
 obj({kind:{const:'role'},value:id,name:id,exact:{type:'boolean'}},['kind','value','name']),
 obj({kind:{enum:['testId','label','text','css','xpath']},value:id,exact:{type:'boolean'}},['kind','value'])
]};
const target=obj({selectors:{type:'array',minItems:1,maxItems:5,items:selector},frame:selector},['selectors']);
const scalar={type:['string','number','boolean','null']};
const compare=obj({kind:{const:'compare'},left:scalar,operator:{enum:['eq','ne','gt','gte','lt','lte','contains']},right:scalar},['kind','left','operator','right']);
const domPredicate=obj({kind:{enum:['visible','hidden','enabled','text','value','count','url']},target,expected:{type:['string','number','boolean']}},['kind']);
domPredicate.allOf=[{if:{properties:{kind:{enum:['visible','hidden','enabled','text','value','count']}}},then:{required:['target']}},{if:{properties:{kind:{enum:['text','value','count','url']}}},then:{required:['expected']}}];
const predicate={oneOf:[compare,domPredicate]};
const actions=['Goto','Click','Fill','Clear','Select','Check','Uncheck','Press','WaitFor','WaitForURL','ExtractText','ExtractAttribute','Upload','Download','Screenshot','Evaluate','SwitchPage','ClosePage','Assert'];
const options=obj({state:{enum:['visible','hidden','attached','detached','enabled']},waitUntil:{enum:['domcontentloaded','load','commit']},attribute:id,fullPage:{type:'boolean'},fileName:id,expectedText:str,expectedSha256:{type:'string',pattern:'^[a-f0-9]{64}$'},scriptId:id,scriptArguments:{},openPopup:{type:'boolean'},pageId:id});
const onFail=obj({policy:{enum:['Stop','Continue','Retry']},maxAttempts:integer(1,5),delayMs:integer(0,60000),retryOn:{type:'array',minItems:1,uniqueItems:true,items:{enum:['TRANSIENT_SIGNAL','NAVIGATION_TRANSIENT']}},totalTimeoutMs:integer(100,900000),replay:{enum:['safe','idempotent','forbidden']},idempotencyKey:id},['policy']);
onFail.allOf=[{if:{properties:{policy:{const:'Retry'}}},then:{required:['maxAttempts','delayMs','retryOn','totalTimeoutMs','replay'],properties:{replay:{enum:['safe','idempotent']},maxAttempts:integer(2,5)}}},{if:{properties:{replay:{const:'idempotent'}},required:['replay']},then:{required:['idempotencyKey']}}];
const core={action:{enum:actions},target,value:{},timeoutMs:integer(100,300000),options};
const schema=(title,body)=>({$schema:'https://json-schema.org/draft/2020-12/schema',title,...body});
const step=schema('Step v1 draft',obj({schemaVersion:{const:'1.0-draft'},stepId:id,...core,onFail,condition:predicate,success:predicate,failure:predicate,retrySignal:predicate,output:{type:'string',pattern:'^[A-Za-z_][A-Za-z0-9_]*(\\.[A-Za-z_][A-Za-z0-9_]*)*$'}},['schemaVersion','stepId','action','timeoutMs','onFail']));
step.$defs={selector,target,predicate};
const targetActions=['Click','Fill','Clear','Select','Check','Uncheck','Press','ExtractText','ExtractAttribute','Upload','Download'];
const requirements=[
 {if:{properties:{action:{enum:targetActions}}},then:{required:['target']}},
 {if:{properties:{action:{enum:['Goto','Fill','Select','Press','WaitForURL','Upload']}}},then:{required:['value']}},
 {if:{properties:{action:{const:'ExtractAttribute'}}},then:{required:['options'],properties:{options:{required:['attribute']}}}},
 {if:{properties:{action:{const:'Evaluate'}}},then:{required:['options'],properties:{options:{required:['scriptId']}}}},
 {if:{properties:{action:{enum:['Assert','WaitFor']}}},then:{required:['success']}}
];
step.allOf=requirements;
const contextRef=obj({runId:id,sessionId:id,pageId:id},['runId','sessionId','pageId']);
const request=schema('ActionRequest v1 draft',obj({schemaVersion:{const:'1.0-draft'},requestId:id,stepId:id,attempt:integer(1,5),...core,success:predicate,failure:predicate,retrySignal:predicate,context:contextRef},['schemaVersion','requestId','stepId','attempt','action','timeoutMs','context']));
request.allOf=requirements;
const relativePath={type:'string',minLength:1,pattern:'^(?![A-Za-z]:)(?![/\\\\])(?!.*(?:^|[/\\\\])\\.\\.(?:[/\\\\]|$)).+'};
const artifact=obj({kind:{enum:['screenshot','video','download','trace','table']},path:relativePath,mimeType:id,bytes:{type:'integer',minimum:0},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'}},['kind','path']);
const err=obj({code:{enum:['INVALID_DEFINITION','MISSING_VARIABLE','TARGET_NOT_FOUND','AMBIGUOUS_TARGET','TIMEOUT','TRANSIENT_SIGNAL','NAVIGATION_TRANSIENT','BUSINESS_ERROR','SIGNAL_CONFLICT','ASSERTION_FAILED','DOWNLOAD_FAILED','SESSION_EXPIRED','CANCELLED','TECHNICAL_ERROR']},message:id,retryable:{type:'boolean'},phase:{enum:['resolve','action','postcondition','artifact']},sideEffect:{enum:['none','possible','confirmed']}},['code','message','retryable','phase','sideEffect']);
const result=schema('ActionResult v1 draft',obj({schemaVersion:{const:'1.0-draft'},requestId:id,stepId:id,attempt:integer(1,5),status:{enum:['Completed','Failed','Skipped']},success:{type:'boolean'},value:{},error:{oneOf:[{type:'null'},err]},durationMs:{type:'integer',minimum:0},selectedSelectorIndex:{type:['integer','null'],minimum:0,maximum:4},screenshot:{type:['string','null']},artifacts:{type:'array',items:artifact},contextPatch:obj({activePageId:id,closedPageIds:{type:'array',items:id}})},['schemaVersion','requestId','stepId','attempt','status','success','value','error','durationMs','selectedSelectorIndex','screenshot','artifacts','contextPatch']));
result.allOf=[
 {if:{properties:{status:{const:'Completed'}}},then:{properties:{success:{const:true},error:{type:'null'}}}},
 {if:{properties:{status:{const:'Failed'}}},then:{properties:{success:{const:false},error:err}}},
 {if:{properties:{status:{const:'Skipped'}}},then:{properties:{success:{const:false},value:{type:'null'},error:{type:'null'}}}}
];
const context=schema('Serializable BotContext v1 draft',obj({schemaVersion:{const:'1.0-draft'},runId:id,sessionId:id,activePageId:id,variables:{type:'object'},outputs:{type:'object'},currentStep:{type:['string','null']},artifacts:{type:'array',items:artifact},history:{type:'array',items:obj({stepId:id,requestId:id,status:{enum:['Completed','Failed','Skipped']}},['stepId','requestId','status'])},capture:obj({recordVideo:{type:'boolean'},eachStep:{type:'boolean'},lastStep:{type:'boolean'},onError:{type:'boolean'}},['recordVideo','eachStep','lastStep','onError'])},['schemaVersion','runId','sessionId','activePageId','variables','outputs','currentStep','artifacts','history','capture']));
for(const [name,value] of Object.entries({'step.schema.json':step,'action-request.schema.json':request,'action-result.schema.json':result,'bot-context.schema.json':context}))fs.writeFileSync(path.join(root,name),JSON.stringify(value,null,2)+'\n');
console.log('Wrote four v1 draft JSON schemas. Runtime 0.3 does not yet consume these schemas.');
