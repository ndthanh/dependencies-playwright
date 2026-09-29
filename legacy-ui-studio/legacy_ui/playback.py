"""One atomic action at a time, explicit strategy, explicit waits."""
import time
from .core import resolve, SelectorError


def perform(adapter, selector, action):
    kind = action['action']
    if kind == 'sleep':
        seconds = float(action.get('seconds', 1))
        if not 0 <= seconds <= 3600:
            raise ValueError('Sleep must be between 0 and 3600 seconds')
        time.sleep(seconds)
        return [f'Sleep: {seconds:g} seconds']
    if kind in ('wait', 'assert_value', 'assert_name'):
        condition = action.get('condition', {'assert_value':'value', 'assert_name':'name'}.get(kind, 'exists'))
        if condition not in ('exists','absent','enabled','visible','value','name','name_contains'):
            raise ValueError('Unknown wait condition')
        timeout = float(action.get('wait_seconds', 10))
        poll = float(action.get('poll_seconds', 0.2))
        if timeout < 0 or poll <= 0:
            raise ValueError('Invalid timeout or polling interval')
        start = time.monotonic()
        attempts = 0
        last = ''
        while True:
            attempts += 1
            try:
                node, trace = resolve(adapter, selector)
                props = adapter.props(node)
                success = {
                    'exists': lambda: True,
                    'absent': lambda: False,
                    'enabled': lambda: props.get('is_enabled') is True,
                    'visible': lambda: props.get('is_offscreen') is False,
                    'value': lambda: adapter.value(node) == action.get('value', ''),
                    'name': lambda: props.get('name') == action.get('value', ''),
                    'name_contains': lambda: action.get('value', '') in (props.get('name') or ''),
                }[condition]()
                if success:
                    return trace + [f'Wait {condition}: passed after {time.monotonic()-start:.2f}s ({attempts} polls)']
                last = 'condition not met'
            except SelectorError as exc:
                # A missing match can be transient. Ambiguity/schema/guard errors are not absence.
                message = str(exc)
                missing = ('RootNotFound: found 0' in message or
                           'ElementNotFound' in message and (message.endswith(': 0') or 'out of bounds' in message))
                if not missing:
                    raise
                if condition == 'absent':
                    return [f'Wait absent: passed after {attempts} polls']
                last = message
            if time.monotonic()-start >= timeout:
                raise TimeoutError(f'Wait {condition} timed out after {timeout:g}s: {last}')
            time.sleep(min(poll, max(0, timeout-(time.monotonic()-start))))
    element, trace = resolve(adapter, selector)
    if kind == 'set_value':
        adapter.set_value(element, action.get('value', ''))
    elif kind == 'invoke':
        adapter.invoke(element)
    elif kind in ('click','type_text','key'):
        from .input import interact
        interact(adapter, element, kind, action.get('value', ''))
    elif kind == 'highlight':
        adapter.highlight(element)
    else:
        raise ValueError(f'Unsupported action: {kind}')
    return trace + [f'{kind}: completed']
