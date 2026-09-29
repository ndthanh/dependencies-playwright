"""Explicit foreground input fallback for controls without UIA patterns."""
import ctypes as c
from ctypes import wintypes as w
import time

user32 = c.WinDLL('user32', use_last_error=True)
ULONG_PTR = w.WPARAM
class MOUSEINPUT(c.Structure):
    _fields_ = [('dx',w.LONG),('dy',w.LONG),('mouseData',w.DWORD),('dwFlags',w.DWORD),('time',w.DWORD),('dwExtraInfo',ULONG_PTR)]
class KEYBDINPUT(c.Structure):
    _fields_ = [('wVk',w.WORD),('wScan',w.WORD),('dwFlags',w.DWORD),('time',w.DWORD),('dwExtraInfo',ULONG_PTR)]
class HARDWAREINPUT(c.Structure):
    _fields_ = [('uMsg',w.DWORD),('wParamL',w.WORD),('wParamH',w.WORD)]
class UNION(c.Union):
    _fields_ = [('mi',MOUSEINPUT),('ki',KEYBDINPUT),('hi',HARDWAREINPUT)]
class INPUT(c.Structure):
    _anonymous_ = ('u',)
    _fields_ = [('type',w.DWORD),('u',UNION)]
user32.SendInput.argtypes = [w.UINT,c.POINTER(INPUT),c.c_int]
user32.SetForegroundWindow.argtypes = [w.HWND]
user32.GetForegroundWindow.restype = w.HWND

def send(items):
    values = (INPUT*len(items))(*items)
    if user32.SendInput(len(items),values,c.sizeof(INPUT)) != len(items):
        raise RuntimeError('SendInput failed; input outcome may be partial')

def key(vk=0,scan=0,flags=0):
    x=INPUT(type=1); x.ki=KEYBDINPUT(vk,scan,flags,0,0); return x

def interact(adapter, element, kind, value):
    props=adapter.props(element)
    if props.get('is_password') or not props.get('is_enabled') or props.get('is_offscreen'):
        raise RuntimeError('Target is not available for foreground input')
    root=element; hwnd=0
    for _ in range(50):
        p=adapter.props(root)
        if p.get('control_type')=='Window' and p.get('native_window_handle'):
            hwnd=p['native_window_handle']; break
        root=adapter.parent(root)
        if root is None: break
    if not hwnd: raise RuntimeError('No target window handle')
    # UIA focus is supported even when a background process cannot call
    # SetForegroundWindow directly after the user clicked the browser.
    try: root.SetFocus()
    except Exception: pass
    user32.SetForegroundWindow(hwnd)
    time.sleep(.15)
    if user32.GetForegroundWindow()!=hwnd:
        raise RuntimeError('Cannot activate target; bring it to foreground and retry')
    if kind=='click':
        left,top,right,bottom=adapter.props(element)['rect_screen']
        if right<=left or bottom<=top: raise RuntimeError('Empty rectangle')
        x,y=(left+right)//2,(top+bottom)//2
        hit=adapter.from_point(x,y)
        matched=False
        for _ in range(50):
            if adapter.client.CompareElements(hit,element): matched=True; break
            hit=adapter.parent(hit)
            if hit is None: break
        if not matched: raise RuntimeError('Click point is occluded or belongs to another element')
        if not user32.SetCursorPos(x,y): raise RuntimeError('Cannot move cursor')
        down=INPUT(type=0); down.mi=MOUSEINPUT(0,0,0,2,0,0)
        up=INPUT(type=0); up.mi=MOUSEINPUT(0,0,0,4,0,0)
        send([down,up]); return
    element.SetFocus()
    focused=adapter.client.GetFocusedElement()
    if not adapter.client.CompareElements(focused,element):
        raise RuntimeError('Target did not receive keyboard focus')
    if kind=='type_text':
        encoded=value.encode('utf-16-le')
        for i in range(0,len(encoded),2):
            unit=int.from_bytes(encoded[i:i+2],'little'); send([key(scan=unit,flags=4),key(scan=unit,flags=6)])
    else:
        mapping={'CTRL':0x11,'ALT':0x12,'SHIFT':0x10,'ENTER':0x0D,'TAB':9,'ESC':0x1B,'BACKSPACE':8,
                 'DELETE':0x2E,'HOME':0x24,'END':0x23,'LEFT':0x25,'UP':0x26,'RIGHT':0x27,'DOWN':0x28,'SPACE':0x20}
        keys=[]
        for token in value.upper().split('+'):
            token=token.strip()
            vk=mapping.get(token)
            if vk is None and len(token)==1 and token.isascii() and token.isalnum(): vk=ord(token)
            if vk is None: raise ValueError('Unsupported key: '+token)
            keys.append(vk)
        try:
            send([key(vk=k) for k in keys])
        finally:
            send([key(vk=k,flags=2) for k in reversed(keys)])
