"""Explicit foreground input fallback for controls without UIA patterns."""
import ctypes as c
from ctypes import wintypes as w
import time
from .interaction import chords, position, validate_options

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
user32.SetCursorPos.argtypes = [c.c_int,c.c_int]

def send(items):
    values = (INPUT*len(items))(*items)
    if user32.SendInput(len(items),values,c.sizeof(INPUT)) != len(items):
        raise RuntimeError('SendInput failed; input outcome may be partial')

def key(vk=0,scan=0,flags=0):
    x=INPUT(type=1); x.ki=KEYBDINPUT(vk,scan,flags,0,0); return x

def interact(adapter, element, kind, value='', options=None):
    options=dict(options or {},action=kind,value=value)
    validate_options(options)  # Reject all invalid chords before any input is sent.
    if getattr(adapter,'backend','uia')=='win32':
        element=adapter.uia.from_handle(element); adapter=adapter.uia
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
    try: element.SetFocus()
    except Exception: pass
    user32.SetForegroundWindow(hwnd)
    time.sleep(.15)
    if user32.GetForegroundWindow()!=hwnd:
        raise RuntimeError('Cannot activate target; bring it to foreground and retry')
    def belongs(node,target):
        for _ in range(50):
            if node is None: return False
            if adapter.client.CompareElements(node,target): return True
            node=adapter.parent(node)
        return False
    def click():
        rect=adapter.props(element)['rect_screen']
        if options.get('image_anchor'):
            from .vision import locate
            x,y=locate(rect,options['image_anchor'])
        else: x,y=position(rect,options.get('position'))
        hit=adapter.from_point(x,y)
        if not belongs(hit,element): raise RuntimeError('Click point is occluded or belongs to another element')
        if not user32.SetCursorPos(x,y): raise RuntimeError('Cannot move cursor')
        down=INPUT(type=0); down.mi=MOUSEINPUT(0,0,0,2,0,0)
        up=INPUT(type=0); up.mi=MOUSEINPUT(0,0,0,4,0,0)
        send([down,up])
    if kind=='click': click(); return ['Pointer click completed']
    if options.get('activation','focus')=='click': click()
    else: element.SetFocus()
    time.sleep(float(options.get('settle_seconds',.1)))
    def check_focus(expected=None):
        if user32.GetForegroundWindow()!=hwnd: raise RuntimeError('Target window lost foreground; keyboard input stopped')
        focused=adapter.client.GetFocusedElement()
        matches=belongs(focused,element) if options.get('allow_descendant_focus',True) else adapter.client.CompareElements(focused,element)
        if not matches or expected is not None and not adapter.client.CompareElements(focused,expected):
            raise RuntimeError('Target or allowed descendant did not retain keyboard focus')
        p=adapter.props(focused)
        if p.get('is_password') or not p.get('is_enabled'): raise RuntimeError('Focused input is unavailable')
        return focused
    focused=check_focus()
    def type_literal(text):
        encoded=text.encode('utf-16-le')
        for i in range(0,len(encoded),2):
            check_focus(focused)
            unit=int.from_bytes(encoded[i:i+2],'little'); send([key(scan=unit,flags=4),key(scan=unit,flags=6)])
    def chord(keys):
        try:
            send([key(vk=k) for k in keys])
        finally:
            send([key(vk=k,flags=2) for k in reversed(keys)])
    trace=[]
    if kind in ('fill','type_text'):
        expected=None
        if options.get('verify_value'):
            # Readability is checked before modifying text. No retry after a mismatch.
            adapter.value(focused)
            if kind=='fill' and options.get('clear_first',True): expected=value
            else: raise ValueError('Value verification requires fill with clear_first=true')
        if kind=='fill' and options.get('clear_first',True):
            check_focus(focused); chord(chords('Ctrl+A')[0]); check_focus(focused); chord(chords('Backspace')[0])
        type_literal(value)
        if expected is not None:
            deadline=time.monotonic()+2
            while adapter.value(focused)!=expected:
                check_focus(focused)
                if time.monotonic()>=deadline: raise RuntimeError('Fill value postcondition failed; no input retry')
                time.sleep(.05)
            trace.append('Fill value verified on focused input')
        else: trace.append('Keyboard input sent; value not verified (add a wait for application result)')
    elif kind in ('key','send_keys'):
        for keys in chords(options.get('keys',value)):
            check_focus(); chord(keys); time.sleep(float(options.get('settle_seconds',.1)))
        trace.append('Key sequence sent once')
    else: raise ValueError('Unsupported foreground action')
    return trace
