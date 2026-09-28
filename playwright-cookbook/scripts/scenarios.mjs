export const elements={
 login_form:'#login-form',username:'#username',password:'#password',login_submit:'#login-submit',account:'#account',auth_error:'#auth-error',load_retry:'#load-retry',load_stop:'#load-stop',
 name:'#full-name',email:'#email',date:'#start-date',quantity:'#quantity',department:'#department',city:'#city-picker',city_hcm:'#city-hcm',notes:'#notes',agree:'#agree',priority:'#priority-high',save:'#save-profile',form_result:'#form-result',keyboard:'#keyboard-input',keyboard_result:'#keyboard-result',hover:'#hover-target',hover_result:'#hover-result',double:'#double-target',double_result:'#double-result',
 ui_delay:'#ui-delay',show_later:'#show-later',delayed:'#delayed-message',enable:'#enable-later',locked:'#locked-button',locked_result:'#locked-result',loading:'#start-loading',overlay:'#overlay',loading_result:'#loading-result',flaky:'#flaky-button',flaky_result:'#flaky-result',
 search:'#search-input',search_button:'#search-button',search_status:'#search-status',customers:'#customers',customer_rows:'#customer-rows tr',empty:'#empty-result',
 upload_file:'#upload-file',upload_delay:'#upload-delay',upload_duration:'#upload-duration',upload_fail:'#upload-fail',upload_button:'#upload-button',upload_status:'#upload-status',
 download_delay:'#download-delay',download_duration:'#download-duration',download_button:'#download-button',
 modal:'#open-modal',modal_input:'#modal-input',modal_save:'#modal-save',modal_result:'#modal-result',confirm:'#native-confirm',confirm_result:'#confirm-result',popup:'#open-popup',popup_code:'#popup-code',frame_name:'#demo-frame >>> #frame-name',frame_save:'#demo-frame >>> #frame-save',frame_result:'#demo-frame >>> #frame-result',
 branch_login:'#login-panel',workspace:'#workspace',logout:'#logout',branch_error:'#login-error',item:'#item-key',upload_submit:'#upload-submit',document_id:'#document-id',branch_upload_status:'#upload-status',upload_result:'#upload-result',lookup_id:'#lookup-id',round:'#round',lookup_submit:'#lookup-submit',document:'#document',status:'#status',reason:'#reason',owner:'#owner',retry:'#retry',not_found:'#not-found',general_error:'#error'
};
export const scenarios=[],steps=[],expected=[];
function scenario(id,title,rows,{data='mac_dinh',full=1,code='',description=''}={}){
 scenarios.push([id,title,data,full,description]); expected.push([id,code||'PASS']);
 rows.forEach((r,i)=>steps.push([id,i+1,r[0],r[1],r[2]||'',r[3]||'',r[4]||'',r[5]||'',r[6]||'',r[7]??10000,r[8]??0]));
}
const home=['Mở trang primitives','navigate','','${base_url}/','name|visible'];
const login=(mode='ok',good='login_form|visible',bad='load_stop|visible',retry='')=>[
 ['Mở trang đăng nhập','navigate','','${base_url}/login?load='+mode+'&run=${run_id}',good,bad,retry,8000,retry?1:0],
 ['Điền tài khoản','fill','username','${username}'],['Điền mật khẩu','fill','password','${password}']
];
scenario('dang_nhap','Đăng nhập thành công',[...login(),['Đăng nhập','click','login_submit','','account|visible','auth_error|visible']]);
scenario('dang_nhap_sai','Sai mật khẩu phải dừng',[...login(),['Đăng nhập','click','login_submit','','account|visible','auth_error|visible']],{data:'sai_mat_khau',code:'BUSINESS_ERROR'});
scenario('tai_trang_thu_lai','Tải trang lỗi tạm thời rồi thành công',[...login('retry-once','login_form|visible','load_stop|visible','load_retry|visible'),['Đăng nhập','click','login_submit','','account|visible','auth_error|visible']]);
scenario('tai_trang_dung','Lỗi tải trang phải dừng', [['Mở trang lỗi','navigate','','${base_url}/login?load=stop','login_form|visible','load_stop|visible']],{code:'BUSINESS_ERROR'});
scenario('dang_nhap_timeout','Không có dấu hiệu kết quả',[...login(),['Mở trang không phản hồi','navigate','','${base_url}/login?load=silent','login_form|visible','','',1800]],{code:'TIMEOUT'});
scenario('dang_nhap_mau_thuan','Hai dấu hiệu mâu thuẫn', [['Mở trang','navigate','','${base_url}/login?auth=conflict','login_form|visible'],...login().slice(1),['Đăng nhập','click','login_submit','','account|visible','auth_error|visible']],{code:'CONFLICT'});
scenario('nhap_lieu','Form và lựa chọn',[home,
 ['Điền tên','fill','name','${full_name}','name|value|${full_name}'],['Email','fill','email','${email}'],['Ngày','fill','date','2026-09-28'],['Số lượng','fill','quantity','3'],['Phòng ban','select','department','finance','department|value|finance'],['Mở thành phố','click','city'],['Chọn thành phố','click','city_hcm','','city|text|TP. Hồ Chí Minh'],['Ghi chú','fill','notes','Dữ liệu kiểm thử từ Excel'],['Đồng ý','check','agree','true'],['Ưu tiên cao','check','priority','true'],['Lưu','click','save','','form_result|text|Đã lưu: ${full_name}'],['Nhập phím','fill','keyboard','${full_name}'],['Enter','press','keyboard','Enter','keyboard_result|text|Đã nhận: ${full_name}'],['Hover','hover','hover','','hover_result|visible'],['Nhấp đúp','double_click','double','','double_result|text|1 lần']]);
scenario('doc_bang','Tra cứu và đọc bảng',[home,['Độ trễ','fill','ui_delay','0.4'],['Tìm khách hàng','fill','search','KH002'],['Tìm','click','search_button','','search_status|text|Kết quả: KH002 (1)'],['Đọc bảng','read_table','customers','','customer_rows|count|1'],['Tìm mã không có','fill','search','KH999'],['Tìm','click','search_button','','empty|visible']]);
scenario('upload_cham','Upload có thời gian chờ',[home,['Chọn file','upload','upload_file','${file_path}'],['Đọc chậm','fill','upload_duration','1'],['Xử lý chậm','fill','upload_delay','2'],['Upload','click','upload_button','','upload_status|contains|Hoàn tất:','upload_status|contains|Lỗi','',15000]]);
scenario('upload_loi','Upload thất bại có tín hiệu',[home,['Chọn file','upload','upload_file','${file_path}'],['Bật lỗi','check','upload_fail','true'],['Upload','click','upload_button','','upload_status|contains|Hoàn tất:','upload_status|contains|Lỗi']],{code:'BUSINESS_ERROR'});
scenario('download_cham','Chờ download và kiểm tra file',[home,['Đợi trước tải','fill','download_delay','2'],['Truyền chậm','fill','download_duration','2'],['Tải và kiểm tra nội dung','download','download_button','AKABOT-LAB-DOWNLOAD','','','',15000]]);
scenario('cho_thu_lai','Chờ điều kiện và retry có giới hạn',[home,['Độ trễ','fill','ui_delay','1'],['Chờ hiện','click','show_later','','delayed|visible'],['Mở khóa','click','enable','','locked|enabled'],['Click nút vừa mở','click','locked','','locked_result|text|Đã thực hiện'],['Bật loading','click','loading','','loading_result|text|Đã tải xong'],['Thử lại lỗi tạm thời','click','flaky','','flaky_result|text|Thành công','','flaky_result|text|Lỗi tạm thời',5000,1]]);
scenario('cua_so_iframe','Dialog, tab mới và iframe',[home,['Mở modal','click','modal'],['Nội dung','fill','modal_input','${full_name}'],['Lưu modal','click','modal_save','','modal_result|text|Đã xác nhận: ${full_name}'],['Native confirm','dialog','confirm','accept','confirm_result|text|Đã đồng ý'],['Mở tab','popup','popup','','popup_code|text|POPUP-001'],['Đóng tab','close_tab'],['Nhập iframe','fill','frame_name','${full_name}'],['Lưu iframe','click','frame_save','','frame_result|text|Xin chào ${full_name}']]);
scenario('cn_dang_nhap','Chi nhánh: đăng nhập',[
 ['Mở hồ sơ chi nhánh','navigate','','${base_url}/branch?run=${run_id}&seed=20260927&fault=${fault}','branch_login|visible'],['Tài khoản','fill','username','${username}'],['Mật khẩu','fill','password','${password}'],['Đăng nhập','click','login_submit','','account|text|${username}','branch_error|visible']
],{data:'cn01',full:0,description:'Bắt đầu phiên chi nhánh. Full flow gọi logout trước khi đổi tài khoản.'});
scenario('cn_tai_len','Chi nhánh: upload',[
 ['Mã hồ sơ','fill','item','${case_id}'],['Chọn file','upload','upload_file','${file_path}'],['Gửi hồ sơ','click','upload_submit','','upload_result|visible','general_error|visible','retry|visible',15000,1],['Trạng thái ban đầu','assert','','','branch_upload_status|text|Chờ duyệt'],['Lấy mã hồ sơ','read_text','document_id','document_id'],['Lưu trạng thái','read_text','branch_upload_status','status']
],{data:'cn01',full:0,description:'Cần session cn_dang_nhap. Chạy qua flow 07_NhieuChiNhanh.'});
scenario('cn_kiem_tra','Chi nhánh: kiểm tra',[
 ['Mã hồ sơ','fill','lookup_id','${document_id}'],['Vòng','fill','round','${round}'],['Tra cứu','click','lookup_submit','','document|visible','not_found|visible','retry|visible',12000,1],['Đúng chủ sở hữu','assert','','','owner|text|${username}'],['Lấy trạng thái','read_text','status','status']
],{data:'cn01',full:0,description:'Cần session và document_id đã upload.'});
scenario('cn_ly_do','Chi nhánh: lý do từ chối',[['Lấy lý do','read_text','reason','rejection_reason','reason|visible']],{data:'cn01',full:0,description:'Chỉ gọi khi trạng thái là Từ chối.'});
scenario('cn_dang_xuat','Chi nhánh: đăng xuất',[['Đăng xuất','click','logout','','branch_login|visible']],{data:'cn01',full:0});
export const datasets=[
 ['mac_dinh','business.user','DemoOnly!2026','Nguyễn Minh Anh','anh@example.test','fixtures/upload.txt','','none'],
 ['sai_mat_khau','business.user','wrong-password','Nguyễn Minh Anh','anh@example.test','fixtures/upload.txt','','none'],
 ...Array.from({length:6},(_,i)=>{const n=String(i+1).padStart(2,'0');return ['cn'+n,'cn'+n,'BranchDemo!'+n,'Chi nhánh '+n,'cn'+n+'@example.test','fixtures/upload.txt','HS-'+n,i===1?'slow_upload':i===3?'retry_once':'none'];})
];
export const sheets={
 instructions:[['topic','description'],['Mục đích','Sửa action, selector và dữ liệu ở Excel; akaBot điều phối If/For Each/Try Catch.'],['Chạy toàn bộ','run-full.cmd'],['Chạy một kịch bản','run-scenario.cmd dang_nhap --data mac_dinh'],['Dữ liệu','${column_name} lấy từ data. base_url và run_id do runner cung cấp.'],['Điều kiện','element_name|visible; element_name|text|description; contains; value; hidden; count; enabled.'],['Thử lại','Chỉ retry khi retry_condition xuất hiện. Timeout và lỗi không retry tự động.'],['Kết quả mong đợi','PASS hoặc mã lỗi BUSINESS_ERROR / TIMEOUT / CONFLICT.'],['Tài khoản mẫu','Chỉ dùng tài khoản và dữ liệu giả lập.'],['Kịch bản thành phần','Các mã cn_* là thành phần của 07_NhieuChiNhanh, cần session và dữ liệu đầu ra bước trước.']],
 settings:[['name','value'],['base_url','http://127.0.0.1:8798'],['max_rounds',5]],
 scenarios:[['scenario_id','scenario_name','dataset_id','run_full','notes'],...scenarios],
 steps:[['scenario_id','step_order','step_name','action','element','value','success_condition','failure_condition','retry_condition','timeout_ms','max_retries'],...steps],
 elements:[['name','selector'],...Object.entries(elements)],
 data:[['dataset_id','username','password','full_name','email','file_path','case_id','fault'],...datasets],
 expected_results:[['scenario_id','expected_result'],...expected]
};
