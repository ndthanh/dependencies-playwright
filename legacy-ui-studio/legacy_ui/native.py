"""Win32 HWND tree. Handles are resolved afresh, never saved as identity."""
import ctypes as c
from ctypes import wintypes as w
from .uia import process_name, UIAAdapter

u=c.WinDLL('user32',use_last_error=True)
for name, args, result in [
    ('GetWindow',[w.HWND,w.UINT],w.HWND),('GetParent',[w.HWND],w.HWND),
    ('GetAncestor',[w.HWND,w.UINT],w.HWND),('GetDlgCtrlID',[w.HWND],c.c_int),
    ('IsWindow',[w.HWND],w.BOOL),
    ('GetWindowLongW',[w.HWND,c.c_int],w.LONG),('IsWindowEnabled',[w.HWND],w.BOOL),
    ('IsWindowVisible',[w.HWND],w.BOOL),('GetWindowRect',[w.HWND,c.POINTER(w.RECT)],w.BOOL),
    ('GetClassNameW',[w.HWND,w.LPWSTR,c.c_int],c.c_int),
    ('GetWindowTextW',[w.HWND,w.LPWSTR,c.c_int],c.c_int),
    ('GetWindowThreadProcessId',[w.HWND,c.POINTER(w.DWORD)],w.DWORD),
    ('SendMessageTimeoutW',[w.HWND,w.UINT,w.WPARAM,w.LPARAM,w.UINT,w.UINT,c.POINTER(w.WPARAM)],w.LPARAM),
]:
    fn=getattr(u,name); fn.argtypes=args; fn.restype=result

class NativeAdapter:
    backend='win32'
    view='native'
    def __init__(self): self.uia=UIAAdapter('raw')
    def from_handle(self,handle):
        if not u.IsWindow(handle): raise RuntimeError('Native window no longer exists')
        return int(handle)
    def from_point(self,x,y):
        u.WindowFromPoint.argtypes=[w.POINT]; u.WindowFromPoint.restype=w.HWND
        return int(u.WindowFromPoint(w.POINT(x,y)) or 0)
    def roots(self):
        result=[]
        callback=c.WINFUNCTYPE(w.BOOL,w.HWND,w.LPARAM)(lambda hwnd,_: result.append(int(hwnd)) or True)
        u.EnumWindows.argtypes=[type(callback),w.LPARAM]
        u.EnumWindows(callback,0)
        return result
    def children(self,node):
        result=[]; child=u.GetWindow(node,5)
        while child:
            if len(result)>=10000: raise RuntimeError('Enumeration budget exceeded')
            result.append(int(child)); child=u.GetWindow(child,2)
        return result
    def descendants(self,node):
        result=[]; stack=list(reversed(self.children(node)))
        while stack:
            item=stack.pop(); result.append(item)
            if len(result)>=10000: raise RuntimeError('Enumeration budget exceeded')
            stack.extend(reversed(self.children(item)))
        return result
    def parent(self,node):
        # GetParent(top-level) can return an owner; only traverse WS_CHILD parents.
        if not u.GetWindowLongW(node,-16)&0x40000000: return None
        return int(u.GetParent(node) or 0) or None
    def previous(self,node): return int(u.GetWindow(node,3) or 0) or None
    def props(self,node):
        if not u.IsWindow(node): raise RuntimeError('Native window no longer exists')
        name=c.create_unicode_buffer(4096); cls=c.create_unicode_buffer(256); pid=w.DWORD(); r=w.RECT()
        u.GetWindowTextW(node,name,len(name)); u.GetClassNameW(node,cls,len(cls))
        u.GetWindowThreadProcessId(node,c.byref(pid)); u.GetWindowRect(node,c.byref(r))
        style=u.GetWindowLongW(node,-16); is_edit=cls.value.lower()=='edit'
        password=is_edit and bool(style&0x20)
        return dict(name='' if password else name.value,class_name=cls.value,control_id=u.GetDlgCtrlID(node),
            control_type='Window' if not style&0x40000000 else 'Pane',automation_id='',
            process_id=pid.value,process_name=process_name(pid.value),native_window_handle=node,
            runtime_id=[node],rect_screen=[r.left,r.top,r.right,r.bottom],
            is_enabled=bool(u.IsWindowEnabled(node)),is_offscreen=not bool(u.IsWindowVisible(node)),
            is_password=password,patterns=['Win32Text'] if is_edit else ['Win32Click'] if cls.value.lower()=='button' else [],read_errors=[])
    def message(self,node,message,lparam=0):
        result=w.WPARAM()
        if not u.SendMessageTimeoutW(node,message,0,lparam,2,2000,c.byref(result)):
            raise RuntimeError('Win32 message failed/timed out; do not blindly retry')
        return result.value
    def set_value(self,node,text):
        p=self.props(node)
        if p['class_name'].lower()!='edit' or p['is_password'] or not p['is_enabled']:
            raise RuntimeError('Win32 text requires an enabled non-password standard Edit')
        buf=c.create_unicode_buffer(text); self.message(node,0x000C,c.addressof(buf))
        if self.value(node)!=text: raise RuntimeError('Win32 value postcondition failed')
    def value(self,node):
        p=self.props(node)
        if p['is_password'] or p['class_name'].lower()!='edit': raise RuntimeError('Standard Edit required')
        buf=c.create_unicode_buffer(32768); result=w.WPARAM()
        if not u.SendMessageTimeoutW(node,0x000D,len(buf),c.addressof(buf),2,2000,c.byref(result)):
            raise RuntimeError('Cannot read native text')
        return buf.value
    def invoke(self,node):
        p=self.props(node)
        if p['class_name'].lower()!='button' or not p['is_enabled']: raise RuntimeError('Standard Button required')
        self.message(node,0x00F5)
    def highlight(self,node,**options): self.uia.highlight(self.uia.from_handle(node),**options)

def adapter_for(selector):
    return NativeAdapter() if selector['backend']=='win32' else UIAAdapter(selector['tree_view'])
