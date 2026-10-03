"""Direct Microsoft UI Automation COM adapter. No pywinauto view ambiguity."""
import ctypes
from ctypes import wintypes
import os
import time
import sys

sys.coinit_flags = 0  # UIA worker uses the COM multithreaded apartment.
import comtypes
import comtypes.client

comtypes.client.GetModule('UIAutomationCore.dll')
from comtypes.gen import UIAutomationClient as UIA

CONTROL_TYPES = {
    50000: 'Button', 50001: 'Calendar', 50002: 'CheckBox', 50003: 'ComboBox',
    50004: 'Edit', 50005: 'Hyperlink', 50006: 'Image', 50007: 'ListItem',
    50008: 'List', 50009: 'Menu', 50010: 'MenuBar', 50011: 'MenuItem',
    50012: 'ProgressBar', 50013: 'RadioButton', 50014: 'ScrollBar',
    50015: 'Slider', 50016: 'Spinner', 50017: 'StatusBar', 50018: 'Tab',
    50019: 'TabItem', 50020: 'Text', 50021: 'ToolBar', 50022: 'ToolTip',
    50023: 'Tree', 50024: 'TreeItem', 50025: 'Custom', 50026: 'Group',
    50027: 'Thumb', 50028: 'DataGrid', 50029: 'DataItem', 50030: 'Document',
    50031: 'SplitButton', 50032: 'Window', 50033: 'Pane', 50034: 'Header',
    50035: 'HeaderItem', 50036: 'Table', 50037: 'TitleBar', 50038: 'Separator',
}
PATTERNS = {
    'Invoke': (10000, 'IUIAutomationInvokePattern'),
    'Value': (10002, 'IUIAutomationValuePattern'),
    'SelectionItem': (10010, 'IUIAutomationSelectionItemPattern'),
    'Toggle': (10015, 'IUIAutomationTogglePattern'),
    'LegacyIAccessible': (10018, 'IUIAutomationLegacyIAccessiblePattern'),
    'Text': (10014, 'IUIAutomationTextPattern'),
}


def process_name(pid):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                                wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    handle = kernel.OpenProcess(0x1000, False, pid)
    if not handle:
        return ''
    try:
        buf = ctypes.create_unicode_buffer(32768)
        size = wintypes.DWORD(len(buf))
        if kernel.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
            return os.path.basename(buf.value)
        return ''
    finally:
        kernel.CloseHandle(handle)


class UIAAdapter:
    backend='uia'
    def __init__(self, view='raw', max_enumeration=10000):
        if view not in ('raw', 'control'):
            raise ValueError('Unsupported tree view')
        self.view = view
        self.max_enumeration = max_enumeration
        self.client = comtypes.client.CreateObject(UIA.CUIAutomation, interface=UIA.IUIAutomation)
        self.walker = self.client.RawViewWalker if view == 'raw' else self.client.ControlViewWalker

    def children(self, element):
        result = []
        child = self.walker.GetFirstChildElement(element)
        while child:
            if len(result) >= self.max_enumeration:
                raise RuntimeError('Enumeration budget exceeded')
            result.append(child)
            child = self.walker.GetNextSiblingElement(child)
        return result

    def descendants(self, element):
        result = []
        stack = list(reversed(self.children(element)))
        while stack:
            node = stack.pop()
            result.append(node)
            if len(result) >= self.max_enumeration:
                raise RuntimeError('Descendant budget exceeded')
            stack.extend(reversed(self.children(node)))
        return result

    def roots(self):
        return self.children(self.client.GetRootElement())

    def previous(self, element):
        value = self.walker.GetPreviousSiblingElement(element)
        return value if value else None

    def parent(self, element):
        value = self.walker.GetParentElement(element)
        return value if value else None

    def from_handle(self, handle):
        return self.client.ElementFromHandle(handle)

    def from_point(self, x, y):
        return self.walker.NormalizeElement(self.client.ElementFromPoint(UIA.tagPOINT(x, y)))

    def pattern(self, element, name):
        number, interface = PATTERNS[name]
        raw = element.GetCurrentPattern(number)
        if not raw:
            return None
        return raw.QueryInterface(getattr(UIA, interface))

    def props(self, element):
        result = {'read_errors': []}
        fields = {
            'name': 'CurrentName', 'automation_id': 'CurrentAutomationId',
            'class_name': 'CurrentClassName', 'framework_id': 'CurrentFrameworkId',
            'process_id': 'CurrentProcessId', 'native_window_handle': 'CurrentNativeWindowHandle',
            'is_enabled': 'CurrentIsEnabled', 'is_offscreen': 'CurrentIsOffscreen',
            'is_keyboard_focusable': 'CurrentIsKeyboardFocusable', 'is_password': 'CurrentIsPassword',
        }
        for key, source in fields.items():
            try:
                value = getattr(element, source)
                result[key] = bool(value) if key.startswith('is_') else value
            except Exception as exc:
                result['read_errors'].append(f'{key}: {type(exc).__name__}')
        try:
            ct = element.CurrentControlType
            result['control_type'] = CONTROL_TYPES.get(ct, str(ct))
            r = element.CurrentBoundingRectangle
            result['rect_screen'] = [r.left, r.top, r.right, r.bottom]
            result['runtime_id'] = list(element.GetRuntimeId())
        except Exception as exc:
            result['read_errors'].append(f'geometry/identity: {type(exc).__name__}')
        result['process_name'] = process_name(result.get('process_id', 0))
        result['patterns'] = []
        for name in PATTERNS:
            try:
                if self.pattern(element, name):
                    result['patterns'].append(name)
            except comtypes.COMError:
                pass
        if 'LegacyIAccessible' in result['patterns']:
            try:
                legacy=self.pattern(element,'LegacyIAccessible')
                result['legacy']={k:getattr(legacy,'Current'+source) for k,source in
                    [('role','Role'),('state','State'),('name','Name'),('default_action','DefaultAction'),('child_id','ChildId')]}
            except Exception as exc: result['read_errors'].append('legacy: '+type(exc).__name__)
        return result

    def legacy_action(self,element,kind,text=''):
        if element.CurrentIsPassword or not element.CurrentIsEnabled: raise RuntimeError('Legacy target unavailable')
        pattern=self.pattern(element,'LegacyIAccessible')
        if not pattern: raise RuntimeError('LegacyIAccessiblePattern unavailable')
        if kind=='legacy_set_value':
            if pattern.CurrentState&0x40: raise RuntimeError('Legacy target is read-only')
            pattern.SetValue(text)
            if pattern.CurrentValue!=text: raise RuntimeError('Legacy value postcondition failed')
        elif kind=='legacy_default': pattern.DoDefaultAction()
        else: raise ValueError('Unsupported legacy action')

    def set_value(self, element, text):
        if element.CurrentIsPassword:
            raise RuntimeError('Password controls are excluded from this tool')
        if not element.CurrentIsEnabled:
            raise RuntimeError('Target disabled')
        pattern = self.pattern(element, 'Value')
        if not pattern or pattern.CurrentIsReadOnly:
            raise RuntimeError('Writable ValuePattern unavailable; no silent keyboard fallback')
        pattern.SetValue(text)
        if pattern.CurrentValue != text:
            raise RuntimeError('Value postcondition failed')

    def value(self, element):
        if element.CurrentIsPassword:
            raise RuntimeError('Password controls are excluded')
        pattern = self.pattern(element, 'Value')
        if not pattern:
            raise RuntimeError('ValuePattern unavailable')
        return pattern.CurrentValue

    def invoke(self, element):
        if not element.CurrentIsEnabled:
            raise RuntimeError('Target disabled')
        pattern = self.pattern(element, 'Invoke')
        if not pattern:
            raise RuntimeError('InvokePattern unavailable; no silent click fallback')
        pattern.Invoke()

    def highlight(self, element, seconds=1.5, point=None):
        # A topmost outline, drawn in physical screen coordinates; not a click target.
        import tkinter as tk
        window=element
        for _ in range(50):
            if window.CurrentControlType==50032 and window.CurrentNativeWindowHandle:
                user32=ctypes.WinDLL('user32',use_last_error=True)
                user32.SetForegroundWindow.argtypes=[wintypes.HWND]
                user32.SetForegroundWindow(window.CurrentNativeWindowHandle)
                break
            window=self.parent(window)
            if window is None: break
        left, top, right, bottom = self.props(element)['rect_screen']
        if right <= left or bottom <= top:
            raise RuntimeError('Element has no drawable rectangle')
        root = tk.Tk()
        root.overrideredirect(True)
        root.attributes('-topmost', True)
        root.config(bg='magenta')
        root.attributes('-transparentcolor', 'magenta')
        root.geometry(f'{right-left+8}x{bottom-top+8}+{left-4}+{top-4}')
        canvas = tk.Canvas(root, bg='magenta', highlightthickness=0)
        canvas.pack(fill='both', expand=True)
        canvas.create_rectangle(2, 2, right-left+6, bottom-top+6, outline='#0de3a0', width=4)
        if point is not None:
            x,y=point[0]-left+4,point[1]-top+4
            canvas.create_oval(x-8,y-8,x+8,y+8,outline='#ff6935',width=3)
            canvas.create_line(x-14,y,x+14,y,fill='#ff6935',width=2)
            canvas.create_line(x,y-14,x,y+14,fill='#ff6935',width=2)
        root.after(int(seconds * 1000), root.destroy)
        root.mainloop()


def set_dpi_awareness():
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except (AttributeError, OSError):
        pass
