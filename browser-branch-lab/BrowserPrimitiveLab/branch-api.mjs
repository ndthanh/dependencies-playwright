// Synthetic branch accounts and approval rounds; do not use for real credentials or files.
const pending='Chờ duyệt', statuses=['Đã duyệt','Từ chối','Đã hủy','Đã duyệt','Từ chối','Chờ duyệt'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(x=>x.toString(16).padStart(2,'0')).join('');
const reply=(data,status=200,extra={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...extra}});
const safeKey=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(x);
export function planFor(branch,seed=20260927){let s=seed>>>0;const a=[...statuses];for(let i=a.length-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[a[i],a[j]]=[a[j],a[i]];}const i=Number(branch.slice(-2))-1;return {finalStatus:a[i],dueRound:a[i]===pending?999:(i%5)+1};}
export function createBranchHandler(store){return async function(request){
 const u=new URL(request.url),route=u.pathname.replace('/api/branch','');if(!u.pathname.startsWith('/api/branch/'))return null;
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==u.origin)return reply({error:'Origin không hợp lệ'},403);
  const scope=request.headers.get('oai-authenticated-user-id')||'local-demo';
  const token=(request.headers.get('cookie')||'').match(/(?:^|;\s*)branch_session=([^;]+)/)?.[1];
  const sid=token?await digest(token):'',session=sid?await store.get('session',sid):null;
  const valid=session&&session.scope===scope&&session.expires>Date.now();
  const cookie=(value,age)=>`branch_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${u.protocol==='https:'?'; Secure':''}`;
  if(route==='/login'&&request.method==='POST'){
   const body=await request.json();await sleep(180);
   if(!/^cn0[1-6]$/.test(body.username||'')||body.password!=='BranchDemo!'+body.username.slice(-2))return reply({error:'Sai tài khoản hoặc mật khẩu'},401);
   if(valid)await store.del('session',sid);const next=crypto.randomUUID();await store.put('session',await digest(next),{scope,account:body.username,expires:Date.now()+3600000});
   return reply({account:body.username},200,{'Set-Cookie':cookie(next,3600)});
  }
  if(route==='/logout'&&request.method==='POST'){if(valid)await store.del('session',sid);return reply({ok:true},200,{'Set-Cookie':cookie('',0)});}
  if(!valid)return reply({error:'Phiên đăng nhập không còn hiệu lực'},401);
  if(route==='/me'&&request.method==='GET')return reply({account:session.account});
  if(route==='/documents'&&request.method==='POST'){
   const item=request.headers.get('x-item-key'),run=request.headers.get('x-run-id');if(!safeKey(item)||!safeKey(run))return reply({error:'Mã hồ sơ hoặc lần chạy không hợp lệ'},400);
   const fault=u.searchParams.get('fault')||'none';if(!['none','slow_upload','retry_once','status_silent','upload_fail','response_lost','conflict'].includes(fault))return reply({error:'Unknown fixture'},400);
   if(Number(request.headers.get('content-length')||0)>2097152)return reply({error:'Giới hạn 2 MB'},413);
   const reader=request.body?.getReader();if(!reader)return reply({error:'Thiếu file'},400);
   const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2097152){await reader.cancel();return reply({error:'Giới hạn 2 MB'},413);}chunks.push(value);}if(!size)return reply({error:'File rỗng'},400);
   const bytes=new Uint8Array(size);let pos=0;for(const b of chunks){bytes.set(b,pos);pos+=b.length;}
   const hash=await digest(bytes),id=(await digest(scope+'|'+session.account+'|'+run+'|'+item)).slice(0,24),old=await store.get('document',id);
   if(old){if(old.sha256!==hash)return reply({error:'Mã hồ sơ đã dùng cho file khác'},409);return reply({...publicDoc(old),duplicate:true});}
   if(fault==='upload_fail')return reply({error:'Lỗi upload mô phỏng, hồ sơ chưa được tạo'},503);await sleep(fault==='slow_upload'?1400:220);
   const seed=Number(u.searchParams.get('seed')||20260927);if(!Number.isSafeInteger(seed))return reply({error:'Seed không hợp lệ'},400);
   const doc={id,scope,account:session.account,item,run,name:decodeURIComponent(request.headers.get('x-file-name')||'file.txt'),bytes:size,sha256:hash,status:pending,reason:'',round:0,createdAt:new Date().toISOString(),fault,retrySeen:false,...planFor(session.account,seed)};
   await store.putBytes(id,bytes);await store.put('document',id,doc);
   if(fault==='response_lost')return reply({error:'Mô phỏng mất phản hồi sau khi server đã lưu'},503);return reply(publicDoc(doc),201);
  }
  const match=route.match(/^\/documents\/([a-f0-9]{24})(\/file)?$/);
  if(match&&request.method==='GET'){
   const doc=await store.get('document',match[1]);if(!doc||doc.scope!==scope||doc.account!==session.account)return reply({error:'Không tìm thấy hồ sơ trong tài khoản này'},404);
   if(match[2])return new Response(await store.getBytes(doc.id),{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="branch-document.txt"','Cache-Control':'no-store'}});
   const round=Number(u.searchParams.get('round')||0);if(!Number.isInteger(round)||round<0||round>100)return reply({error:'Vòng không hợp lệ'},400);
   if(round>0&&doc.fault==='retry_once'&&!doc.retrySeen){doc.retrySeen=true;await store.put('document',doc.id,doc);return reply({error:'Dịch vụ tra cứu tạm thời gián đoạn'},503);}
   if(round>0&&doc.fault==='status_silent')return reply({simulateSilent:true});
   doc.round=Math.max(doc.round,round);if(doc.status===pending&&doc.round>=doc.dueRound){doc.status=doc.finalStatus;doc.reason=doc.status==='Từ chối'?'Thiếu chứng từ đối chiếu của '+doc.account.toUpperCase()+'. Vui lòng bổ sung và gửi hồ sơ mới.':'';}
   await store.put('document',doc.id,doc);await sleep(160);return reply({...publicDoc(doc),simulateConflict:round>0&&doc.fault==='conflict'});
  }
  return reply({error:'Not found'},404);
 }catch(e){console.error('branch-api',e.message);return reply({error:'Không thể xử lý yêu cầu'},500);}
};}
function publicDoc(d){return {id:d.id,account:d.account,item:d.item,run:d.run,name:d.name,bytes:d.bytes,sha256:d.sha256,status:d.status,reason:d.reason,round:d.round,createdAt:d.createdAt};}
