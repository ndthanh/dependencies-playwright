"""Python-only standard Win32 fixture for integration tests; no build step."""
import ctypes as c
from ctypes import wintypes as w

u=c.WinDLL('user32'); k=c.WinDLL('kernel32')
PROC=c.WINFUNCTYPE(w.LPARAM,w.HWND,w.UINT,w.WPARAM,w.LPARAM)
class WNDCLASS(c.Structure):
    _fields_=[('style',w.UINT),('proc',PROC),('cbClsExtra',c.c_int),('cbWndExtra',c.c_int),
        ('instance',w.HINSTANCE),('icon',w.HICON),('cursor',w.HANDLE),('background',w.HBRUSH),('menu',w.LPCWSTR),('name',w.LPCWSTR)]
u.DefWindowProcW.argtypes=[w.HWND,w.UINT,w.WPARAM,w.LPARAM];u.DefWindowProcW.restype=w.LPARAM
u.CreateWindowExW.argtypes=[w.DWORD,w.LPCWSTR,w.LPCWSTR,w.DWORD,c.c_int,c.c_int,c.c_int,c.c_int,w.HWND,w.HMENU,w.HINSTANCE,c.c_void_p]
u.CreateWindowExW.restype=w.HWND
u.SetWindowTextW.argtypes=[w.HWND,w.LPCWSTR]
u.ShowWindow.argtypes=[w.HWND,c.c_int]
u.DestroyWindow.argtypes=[w.HWND]
k.GetModuleHandleW.restype=w.HMODULE
status=None
@PROC
def procedure(hwnd,msg,wp,lp):
    if msg==0x111 and wp&0xffff==103 and wp>>16==0:
        u.SetWindowTextW(status,'CLICKED'); return 0
    if msg==0x10: u.DestroyWindow(hwnd); return 0
    if msg==2: u.PostQuitMessage(0); return 0
    return u.DefWindowProcW(hwnd,msg,wp,lp)
instance=k.GetModuleHandleW(None)
cls=WNDCLASS(0,procedure,0,0,instance,None,None,w.HBRUSH(6),None,'LegacyNativeFixture')
u.RegisterClassW(c.byref(cls))
root=u.CreateWindowExW(0,cls.name,'Legacy Native Python Lab',0x00CF0000,100,100,480,260,None,None,instance,None)
for class_name,text,id,y in [('Edit','initial',101,30),('Edit','',102,70),('Button','Save',103,110)]:
    u.CreateWindowExW(0,class_name,text,0x50010000|0x00800000,30,y,240,30,root,w.HMENU(id),instance,None)
status=u.CreateWindowExW(0,'Static','READY',0x50000000,30,155,240,30,root,w.HMENU(104),instance,None)
u.ShowWindow(root,5)
msg=w.MSG()
while u.GetMessageW(c.byref(msg),None,0,0)>0:
    u.TranslateMessage(c.byref(msg));u.DispatchMessageW(c.byref(msg))
