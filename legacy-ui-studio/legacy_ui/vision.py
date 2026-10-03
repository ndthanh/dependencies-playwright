"""Local image anchors, bounded to one resolved Pane. No language model."""
import base64
import io
import math

def validate_anchor(anchor):
    if not isinstance(anchor,dict): raise ValueError('Image anchor must be an object')
    encoded=anchor.get('template_png','')
    if not isinstance(encoded,str) or not 0<len(encoded)<=1500000: raise ValueError('Invalid template size')
    try: raw=base64.b64decode(encoded,validate=True)
    except Exception as exc: raise ValueError('Invalid template base64') from exc
    if not raw.startswith(b'\x89PNG\r\n\x1a\n'): raise ValueError('PNG template required')
    threshold=float(anchor.get('threshold',.92))
    if not .5<=threshold<=1: raise ValueError('Anchor threshold must be between .5 and 1')
    offset=anchor.get('offset',[0,0])
    if not isinstance(offset,list) or len(offset)!=2 or not all(math.isfinite(float(x)) for x in offset):
        raise ValueError('Invalid anchor offset')

def dependencies():
    try:
        import cv2
        import numpy as np
        from PIL import Image, ImageGrab
        return cv2,np,Image,ImageGrab
    except ImportError as exc:
        raise RuntimeError('Image anchors require: python -m pip install -r requirements-vision.txt') from exc

def grab(rect):
    _,_,_,ImageGrab=dependencies()
    left,top,right,bottom=map(int,rect)
    if not 0<right-left<=4096 or not 0<bottom-top<=4096: raise ValueError('Invalid capture rectangle (max 4096 per axis)')
    try: return ImageGrab.grab(bbox=(left,top,right,bottom),all_screens=True).convert('RGB')
    except OSError as exc: raise RuntimeError('Desktop capture unavailable in this session') from exc

def capture(adapter,element):
    p=adapter.props(element)
    if p.get('is_password') or p.get('is_offscreen'): raise RuntimeError('Cannot capture this element')
    # Capture visible desktop pixels, after activating the resolved target window.
    import ctypes as c
    from ctypes import wintypes as w
    import time
    u=c.WinDLL('user32',use_last_error=True)
    u.SetForegroundWindow.argtypes=[w.HWND];u.GetForegroundWindow.restype=w.HWND
    ancestor=element;hwnd=0
    for _ in range(50):
        q=adapter.props(ancestor)
        if q.get('control_type')=='Window' and q.get('native_window_handle'):
            hwnd=q['native_window_handle'];break
        ancestor=adapter.parent(ancestor)
        if ancestor is None:break
    if not hwnd:raise RuntimeError('No target window handle for capture')
    if getattr(adapter,'backend','uia')=='uia':
        try: ancestor.SetFocus()
        except Exception: pass
    u.SetForegroundWindow(hwnd);time.sleep(.2)
    if u.GetForegroundWindow()!=hwnd:raise RuntimeError('Bring the target window to foreground before capture')
    rect=adapter.props(element)['rect_screen']; image=grab(rect); buf=io.BytesIO(); image.save(buf,format='PNG')
    return dict(png=base64.b64encode(buf.getvalue()).decode('ascii'),rect=rect,width=image.width,height=image.height)

def locate(rect,anchor):
    validate_anchor(anchor)
    cv2,np,Image,_=dependencies()
    image=grab(rect)
    with Image.open(io.BytesIO(base64.b64decode(anchor['template_png']))) as original:
        if original.width>4096 or original.height>4096: raise ValueError('Template too large')
        template=np.array(original.convert('RGB'))
    scene=np.array(image)
    return locate_arrays(scene,template,rect,anchor,cv2,np)

def locate_arrays(scene,template,rect,anchor,cv2,np):
    h,w=template.shape[:2]
    if min(h,w)<3 or h>scene.shape[0] or w>scene.shape[1]: raise ValueError('Template does not fit target')
    # Spatially uniform templates cannot identify an anchor.
    if float(np.std(template.astype(float),axis=(0,1)).max())<2: raise ValueError('Template lacks distinguishing detail')
    scores=cv2.matchTemplate(scene,template,cv2.TM_CCOEFF_NORMED)
    _,score,_,point=cv2.minMaxLoc(scores); threshold=float(anchor.get('threshold',.92))
    if not math.isfinite(score) or score<threshold: raise RuntimeError(f'Image anchor not found: score {score:.3f}')
    x,y=point
    remaining=scores.copy()
    remaining[max(0,y-h//2):y+h//2+1,max(0,x-w//2):x+w//2+1]=-1
    if float(remaining.max())>=threshold: raise RuntimeError('Ambiguous image anchor: more than one match')
    dx,dy=anchor.get('offset',[0,0]); px=round(x+dx); py=round(y+dy)
    if not 0<=px<scene.shape[1] or not 0<=py<scene.shape[0]: raise ValueError('Anchor click point outside target')
    return rect[0]+px,rect[1]+py
