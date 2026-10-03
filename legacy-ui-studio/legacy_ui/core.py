import re
import time


class SelectorError(RuntimeError):
    pass


def matches(properties, criteria):
    for key, expected in criteria.items():
        if key.endswith('_regex'):
            if re.search(expected, str(properties.get(key[:-6], ''))) is None:
                return False
        elif key == 'supports_pattern':
            if expected not in properties.get('patterns', []):
                return False
        elif key not in properties or properties[key] != expected:
            return False
    return True


def validate_selector(s):
    if s.get('schema_version') != 1 or s.get('backend') not in ('uia', 'win32'):
        raise SelectorError('Unsupported schema/backend')
    if s.get('tree_view') not in (('native',) if s['backend']=='win32' else ('raw', 'control')):
        raise SelectorError('Invalid tree_view for backend')
    if not isinstance(s.get('root'), dict) or not s['root']:
        raise SelectorError('A constrained root is required')
    if not isinstance(s.get('steps'), list):
        raise SelectorError('steps must be a list')
    for step in s['steps']:
        if step.get('axis') not in ('child', 'descendant'):
            raise SelectorError('Invalid axis')
        indexes = [k for k in ('child_index', 'match_index') if k in step]
        if len(indexes) > 1:
            raise SelectorError('child_index and match_index are mutually exclusive')
        for k in indexes:
            if type(step[k]) is not int or step[k] < 0:
                raise SelectorError('Index must be a nonnegative integer')
        if 'child_index' in step and step['axis'] != 'child':
            raise SelectorError('child_index requires child axis')
        if 'expect_match_count' in step and 'child_index' in step:
            raise SelectorError('expect_match_count requires filtering before selection')


def resolve(adapter, selector):
    validate_selector(selector)
    if adapter.view != selector['tree_view']:
        raise SelectorError('Tree view mismatch')
    if getattr(adapter, 'backend', 'uia') != selector['backend']:
        raise SelectorError('Backend mismatch')
    roots = [n for n in adapter.roots() if matches(adapter.props(n), selector['root'])]
    if len(roots) != 1:
        raise SelectorError(f'AmbiguousRoot/RootNotFound: found {len(roots)}')
    current = roots[0]
    trace = ['Root: exactly 1 matching window']
    for number, step in enumerate(selector['steps'], 1):
        nodes = adapter.children(current) if step['axis'] == 'child' else adapter.descendants(current)
        if 'expect_child_count' in step and len(nodes) != step['expect_child_count']:
            raise SelectorError(f'StructureMismatch step {number}: child count {len(nodes)}')
        if 'child_index' in step:
            index = step['child_index']
            if index >= len(nodes):
                raise SelectorError(f'StructureMismatch step {number}: index out of bounds')
            current = nodes[index]
            if not matches(adapter.props(current), step.get('match', {})):
                raise SelectorError(f'StructureMismatch step {number}: selected child properties')
            trace.append(f'Step {number}: child_index={index} of {len(nodes)}')
        else:
            filtered = [n for n in nodes if matches(adapter.props(n), step.get('match', {}))]
            count = step.get('expect_match_count')
            if count is not None and count != len(filtered):
                raise SelectorError(f'StructureMismatch step {number}: expected {count}, got {len(filtered)}')
            if 'match_index' in step:
                index = step['match_index']
                if index >= len(filtered):
                    raise SelectorError(f'ElementNotFound step {number}: index out of bounds')
            else:
                if len(filtered) != 1:
                    raise SelectorError(f'AmbiguousMatch/ElementNotFound step {number}: {len(filtered)}')
                index = 0
            current = filtered[index]
            trace.append(f'Step {number}: {len(filtered)} match(es), match_index={index}')
    checks = dict(selector.get('assert', {}))
    previous = checks.pop('previous_sibling', None)
    if not matches(adapter.props(current), checks):
        raise SelectorError('StructureMismatch: target assertions failed')
    if previous is not None:
        sibling = adapter.previous(current)
        if sibling is None or not matches(adapter.props(sibling), previous):
            raise SelectorError('StructureMismatch: previous sibling assertion failed')
    trace.append('Assertions: passed')
    return current, trace


def snapshot(adapter, root, max_nodes=2000, max_depth=30):
    nodes = []
    issues = []
    started = time.time()

    def walk(element, parent, index, depth):
        if len(nodes) >= max_nodes:
            issues.append('max_nodes reached')
            return None
        node_id = f'n{len(nodes)}'
        p = adapter.props(element)
        entry = dict(p, node_id=node_id, parent_id=parent, child_index=index, children=[])
        nodes.append(entry)
        try:
            children = adapter.children(element)
            if depth >= max_depth and children:
                issues.append(f'{node_id}: max_depth reached')
            else:
                for child_index, child in enumerate(children):
                    cid = walk(child, node_id, child_index, depth + 1)
                    if cid is not None:
                        entry['children'].append(cid)
                    if len(nodes) >= max_nodes:
                        if child_index + 1 < len(children):
                            issues.append(f'{node_id}: remaining children truncated')
                        break
        except Exception as exc:
            issues.append(f'{node_id}: {type(exc).__name__}: {exc}')
        if p.get('read_errors'):
            issues.append(f'{node_id}: property read errors')
        return node_id

    walk(root, None, 0, 0)
    return dict(schema_version=1, backend=getattr(adapter,'backend','uia'), tree_view=adapter.view,
                started_at=started, finished_at=time.time(), complete=not issues,
                consistency='best-effort; UIA snapshots are not atomic',
                issues=issues, nodes=nodes)


def render_tree(data):
    by_id = {n['node_id']: n for n in data['nodes']}
    lines = []

    def line(n, depth):
        lines.append('  ' * depth + f"[{n['node_id']}] child[{n['child_index']}] "
                     f"{n.get('control_type')} name={n.get('name')!r} "
                     f"class={n.get('class_name')!r} id={n.get('automation_id')!r} "
                     f"patterns={n.get('patterns', [])}")
        for cid in n['children']:
            line(by_id[cid], depth + 1)
    if data['nodes']:
        line(data['nodes'][0], 0)
    return '\n'.join(lines)


def selector_from_snapshot(data, node_id, strict=False):
    """Generate a direct-child path; optional structural guards for callers that want them."""
    if not data['complete']:
        raise SelectorError('Cannot generate selector from incomplete snapshot')
    nodes = {n['node_id']: n for n in data['nodes']}
    target = nodes[node_id]
    current = target
    steps = []
    native = data['backend']=='win32'
    keys = ('class_name', 'control_id') if native else ('control_type', 'class_name', 'name', 'automation_id')
    while current['parent_id'] is not None:
        parent = nodes[current['parent_id']]
        step = dict(axis='child', child_index=current['child_index'],
                    match={k: current[k] for k in keys if k in current})
        if current.get('automation_id'):
            step['match'].pop('name',None)  # Text/status names may change while the ID stays stable.
        if native and current.get('control_id') not in (0,-1) and sum(
            matches(nodes[cid],step['match']) for cid in parent['children'])==1:
            step.pop('child_index') # Prefer a unique native class/control ID over position.
        if strict:
            step['expect_child_count'] = len(parent['children'])
        steps.append(step)
        current = parent
    checks = {'class_name': target['class_name']} if native else {'control_type': target['control_type']}
    if strict and target['parent_id'] and target['child_index'] > 0:
        parent = nodes[target['parent_id']]
        previous = nodes[parent['children'][target['child_index'] - 1]]
        checks['previous_sibling'] = {k: previous[k] for k in keys if k in previous}
    return dict(schema_version=1, backend=data['backend'], tree_view=data['tree_view'],
                root={'name': current['name'], 'class_name': current['class_name'],
                      'process_name': current['process_name']},
                steps=list(reversed(steps)), **{'assert': checks})
