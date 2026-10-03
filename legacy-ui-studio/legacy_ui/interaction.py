"""Portable validation for pointer positions and keyboard sequences."""
import math

KEYS={'CTRL':0x11,'ALT':0x12,'SHIFT':0x10,'ENTER':0x0D,'TAB':9,'ESC':0x1B,'ESCAPE':0x1B,
      'BACKSPACE':8,'DELETE':0x2E,'HOME':0x24,'END':0x23,'LEFT':0x25,'UP':0x26,
      'RIGHT':0x27,'DOWN':0x28,'SPACE':0x20,'PAGEUP':0x21,'PAGEDOWN':0x22,'INSERT':0x2D}
KEYS.update({f'F{i}':0x6F+i for i in range(1,25)})

def chords(value):
    parts=value.split(';') if isinstance(value,str) else value
    if not isinstance(parts,list) or not parts or len(parts)>100:
        raise ValueError('Keys must be a chord, semicolon-separated chords, or a list (max 100)')
    result=[]
    for part in parts:
        if not isinstance(part,str): raise ValueError('Each chord must be text')
        keys=[]
        for token in part.upper().split('+'):
            token=token.strip(); vk=KEYS.get(token)
            if vk is None and len(token)==1 and token.isascii() and token.isalnum(): vk=ord(token)
            if vk is None: raise ValueError('Unsupported key: '+token)
            keys.append(vk)
        if len(set(keys))!=len(keys): raise ValueError('Duplicate key in chord')
        result.append(keys)
    return result

def position(rect,config=None):
    left,top,right,bottom=rect; width=right-left; height=bottom-top
    if width<=0 or height<=0: raise ValueError('Empty target rectangle')
    if not config: return round((left+right-1)/2),round((top+bottom-1)/2)
    mode=config.get('mode')
    if mode not in ('relative_pixels','relative_ratio'): raise ValueError('Invalid position mode')
    x=float(config['x']); y=float(config['y'])
    if not math.isfinite(x) or not math.isfinite(y): raise ValueError('Non-finite position')
    if mode=='relative_ratio':
        if not 0<=x<=1 or not 0<=y<=1: raise ValueError('Ratios must be between 0 and 1')
        x*=width-1; y*=height-1
    else:
        size=config.get('recorded_size')
        if size is not None and list(size)!=[width,height]:
            raise ValueError('Target size changed from recording; review pixel offset')
    x=left+round(x); y=top+round(y)
    if not left<=x<right or not top<=y<bottom: raise ValueError('Point lies outside target')
    return x,y

def validate_options(action):
    kind=action['action']
    if kind in ('fill','type_text','set_value','legacy_set_value') and not isinstance(action.get('value',''),str):
        raise ValueError('Text must be a string')
    if action.get('position') and action.get('image_anchor'): raise ValueError('Choose position OR image anchor')
    if kind in ('key','send_keys'): chords(action.get('keys',action.get('value','')))
    if kind in ('fill','key','send_keys','type_text'):
        if action.get('activation','focus') not in ('focus','click'): raise ValueError('Activation must be focus or click')
        for field in ('clear_first','allow_descendant_focus','verify_value'):
            if field in action and type(action[field]) is not bool: raise ValueError(field+' must be boolean')
        if not 0<=float(action.get('settle_seconds',.1))<=5: raise ValueError('Invalid settle time')
        if action.get('verify_value') and (kind!='fill' or not action.get('clear_first',True)):
            raise ValueError('Value verification requires fill with clear_first=true')
    if action.get('position'):
        p=action['position']; mode=p.get('mode')
        if mode not in ('relative_pixels','relative_ratio'): raise ValueError('Invalid position mode')
        for axis in ('x','y'):
            n=float(p[axis])
            if not math.isfinite(n) or n<0 or mode=='relative_ratio' and n>1: raise ValueError('Invalid offset')
    if action.get('image_anchor'):
        from .vision import validate_anchor
        validate_anchor(action['image_anchor'])
