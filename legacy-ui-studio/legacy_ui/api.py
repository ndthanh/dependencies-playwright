"""Convenient Python entry point using the same activities as CLI and web GUI."""
import json
from pathlib import Path

def run(selector,action,**options):
    """Resolve fresh and perform once. Use CLI when a hard COM timeout is needed."""
    from .uia import set_dpi_awareness
    from .native import adapter_for
    from .playback import perform
    set_dpi_awareness()
    if isinstance(selector,(str,Path)):selector=json.loads(Path(selector).read_text(encoding='utf-8'))
    return perform(adapter_for(selector),selector,dict(options,action=action))
