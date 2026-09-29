import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def parser():
    p = argparse.ArgumentParser(description='Guarded UIA structural selectors for legacy Windows apps')
    p.add_argument('--timeout', type=float, default=45, help='Hard worker-process timeout in seconds')
    sub = p.add_subparsers(dest='command', required=True)
    sub.add_parser('windows')
    studio = sub.add_parser('studio')
    studio.add_argument('--project', default='projects/default')
    studio.add_argument('--port', type=int, default=8765)
    studio.add_argument('--no-browser', action='store_true')
    d = sub.add_parser('dump')
    d.add_argument('--hwnd', type=lambda v: int(v, 0), required=True)
    d.add_argument('--view', choices=['raw', 'control'], default='raw')
    d.add_argument('--out', required=True)
    d.add_argument('--max-nodes', type=int, default=2000)
    d.add_argument('--max-depth', type=int, default=30)
    g = sub.add_parser('generate')
    g.add_argument('--snapshot', required=True); g.add_argument('--node', required=True); g.add_argument('--out', required=True)
    i = sub.add_parser('inspect')
    i.add_argument('--point', required=True, help='Physical screen x,y')
    i.add_argument('--view', choices=['raw', 'control'], default='raw')
    i.add_argument('--hwnd', type=lambda v: int(v, 0), help='Require the hit to belong to this window')
    pick = sub.add_parser('pick')
    pick.add_argument('--hwnd',type=lambda v:int(v,0),required=True)
    pick.add_argument('--view',choices=['raw','control'],default='raw')
    pick.add_argument('--delay',type=float,default=3)
    r = sub.add_parser('resolve')
    r.add_argument('--selector', required=True); r.add_argument('--highlight', action='store_true')
    r.add_argument('--out')
    replay = sub.add_parser('replay')
    replay.add_argument('--flow', required=True); replay.add_argument('--out', required=True)
    return p


def execute(args):
    from .core import matches, resolve, snapshot, render_tree, selector_from_snapshot
    if args.command == 'generate':
        selector = selector_from_snapshot(read(args.snapshot), args.node)
        write(args.out, selector)
        return selector
    from .uia import UIAAdapter, set_dpi_awareness
    set_dpi_awareness()
    adapter = UIAAdapter(getattr(args, 'view', 'raw'))
    if args.command == 'windows':
        return [adapter.props(n) for n in adapter.roots()]
    if args.command == 'dump':
        data = snapshot(adapter, adapter.from_handle(args.hwnd), args.max_nodes, args.max_depth)
        write(args.out + '.json', data)
        Path(args.out + '.txt').write_text(render_tree(data), encoding='utf-8')
        return dict(complete=data['complete'], nodes=len(data['nodes']), issues=data['issues'], output=args.out)
    if args.command == 'pick':
        import ctypes
        from ctypes import wintypes
        user32=ctypes.WinDLL('user32',use_last_error=True)
        user32.SetForegroundWindow.argtypes=[wintypes.HWND]
        user32.SetForegroundWindow(args.hwnd)
        time.sleep(max(0,min(10,args.delay)))
        point=wintypes.POINT()
        if not user32.GetCursorPos(ctypes.byref(point)):
            raise RuntimeError('Cannot read mouse pointer in this desktop session')
        args.point=f'{point.x},{point.y}'
    if args.command in ('inspect','pick'):
        x, y = map(int, args.point.split(','))
        node = adapter.from_point(x, y)
        if args.hwnd:
            target_root = adapter.from_handle(args.hwnd)
            ancestor = node
            for _ in range(50):
                if ancestor is None: raise RuntimeError('Point is outside the selected application')
                if adapter.client.CompareElements(ancestor, target_root): break
                ancestor = adapter.parent(ancestor)
            else:
                raise RuntimeError('Point is outside the selected application')
        chain = []
        for _ in range(50):
            if not node: break
            parent = adapter.parent(node)
            index = None
            if parent:
                index = next((i for i, child in enumerate(adapter.children(parent))
                              if adapter.client.CompareElements(child, node)), None)
            chain.append(dict(adapter.props(node), child_index=index))
            if args.hwnd and adapter.client.CompareElements(node,target_root): break
            node = parent
        return dict(point=[x, y], tree_view=adapter.view, ancestors=list(reversed(chain)))
    if args.command == 'resolve':
        selector = read(args.selector)
        adapter = UIAAdapter(selector['tree_view'])
        node, trace = resolve(adapter, selector)
        result = dict(trace=trace, element=adapter.props(node))
        if args.highlight: adapter.highlight(node)
        if args.out: write(args.out, result)
        return result
    if args.command == 'replay':
        from .playback import perform
        flow = read(args.flow)
        log = []
        result = dict(success=False, steps=log)
        try:
            for action in flow['actions']:
                entry = dict(action=action['action'], selector=action.get('selector'), success=False)
                log.append(entry)
                selector = None if action['action']=='sleep' else read(Path(args.flow).parent / action['selector'])
                adapter = None if selector is None else UIAAdapter(selector['tree_view'])
                entry['trace'] = perform(adapter, selector, action)
                entry['success'] = True
            result['success'] = True
        except Exception as exc:
            result['error'] = f'{type(exc).__name__}: {exc}'
            raise
        finally:
            write(args.out, result)
        return result


def main():
    # All COM work lives in one disposable child process; thread timeouts cannot kill COM calls.
    args = parser().parse_args()
    if args.command == 'studio':
        from .web import launch
        launch(args.project,args.port,not args.no_browser)
        return 0
    if os.environ.get('LEGACY_UI_WORKER') != '1':
        env = dict(os.environ, LEGACY_UI_WORKER='1', PYTHONIOENCODING='utf-8')
        try:
            completed = subprocess.run([sys.executable, '-m', 'legacy_ui', *sys.argv[1:]],
                                       env=env, timeout=args.timeout, capture_output=True)
            sys.stdout.buffer.write(completed.stdout)
            sys.stderr.buffer.write(completed.stderr)
            return completed.returncode
        except subprocess.TimeoutExpired:
            print(json.dumps({'error': 'ProviderTimeout', 'outcome': 'unknown; do not blindly retry actions'}))
            return 2
    try:
        print(json.dumps(execute(args), ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        print(json.dumps({'error': type(exc).__name__, 'message': str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
