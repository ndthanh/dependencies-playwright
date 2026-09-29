import copy
import unittest
from legacy_ui.core import SelectorError, resolve, snapshot, selector_from_snapshot


class FakeAdapter:
    view = 'raw'

    def __init__(self):
        self.root = dict(name='Lab', class_name='Window', control_type='Window', process_name='Lab.exe',
                         automation_id='', children=[])
        self.form = dict(name='Form', class_name='Form', control_type='Pane', automation_id='', children=[])
        self.root['children'] = [self.form]
        self.form['children'] = [dict(name='', class_name='Field' if i < 2 else 'Command',
                                     control_type='Pane', automation_id='', children=[]) for i in range(4)]

    def props(self, node): return {k: v for k, v in node.items() if k != 'children'}
    def roots(self): return [self.root]
    def children(self, node): return node['children']
    def descendants(self, node):
        result = []
        for child in self.children(node): result += [child] + self.descendants(child)
        return result
    def previous(self, node):
        for parent in [self.root, self.form]:
            for i, candidate in enumerate(parent['children']):
                if candidate is node: return parent['children'][i-1] if i else None


class SelectorTests(unittest.TestCase):
    def setUp(self):
        self.a = FakeAdapter()
        self.s = dict(schema_version=1, backend='uia', tree_view='raw', root={'name': 'Lab'}, steps=[
            dict(axis='descendant', match={'name': 'Form'}),
            dict(axis='child', child_index=1, expect_child_count=4, match={'class_name': 'Field'})])

    def test_direct_index(self):
        self.assertIs(resolve(self.a, self.s)[0], self.a.form['children'][1])

    def test_filtered_index(self):
        self.s['steps'][-1] = dict(axis='child', match={'class_name': 'Command'}, match_index=0, expect_match_count=2)
        self.assertIs(resolve(self.a, self.s)[0], self.a.form['children'][2])

    def test_insert_sibling_fails_closed(self):
        self.a.form['children'].insert(0, copy.deepcopy(self.a.form['children'][0]))
        with self.assertRaisesRegex(SelectorError, 'StructureMismatch'): resolve(self.a, self.s)

    def test_reorder_different_class_fails(self):
        self.a.form['children'][1], self.a.form['children'][2] = self.a.form['children'][2], self.a.form['children'][1]
        with self.assertRaises(SelectorError): resolve(self.a, self.s)

    def test_ambiguous_match_fails(self):
        self.s['steps'][-1] = dict(axis='child', match={'class_name': 'Field'})
        with self.assertRaisesRegex(SelectorError, 'AmbiguousMatch'): resolve(self.a, self.s)

    def test_wrong_view_fails(self):
        self.s['tree_view'] = 'control'
        with self.assertRaisesRegex(SelectorError, 'view mismatch'): resolve(self.a, self.s)

    def test_conflicting_indexes_fail(self):
        self.s['steps'][-1]['match_index'] = 0
        with self.assertRaisesRegex(SelectorError, 'mutually exclusive'): resolve(self.a, self.s)

    def test_negative_index_fails(self):
        self.s['steps'][-1]['child_index'] = -1
        with self.assertRaises(SelectorError): resolve(self.a, self.s)

    def test_unknown_assertion_fails(self):
        self.s['assert'] = {'missing_property': True}
        with self.assertRaises(SelectorError): resolve(self.a, self.s)

    def test_previous_sibling_guard(self):
        self.s['assert'] = {'previous_sibling': {'class_name': 'Command'}}
        with self.assertRaisesRegex(SelectorError, 'previous sibling'): resolve(self.a, self.s)

    def test_roundtrip_generated_selector(self):
        data = snapshot(self.a, self.a.root)
        s = selector_from_snapshot(data, 'n3')
        self.assertIs(resolve(self.a, s)[0], self.a.form['children'][1])

    def test_truncated_dump_rejected(self):
        data = snapshot(self.a, self.a.root, max_nodes=3)
        self.assertFalse(data['complete'])
        with self.assertRaises(SelectorError): selector_from_snapshot(data, 'n2')

    def test_filtered_count_guard(self):
        self.s['steps'][-1] = dict(axis='child', match={'class_name': 'Field'}, match_index=1, expect_match_count=3)
        with self.assertRaisesRegex(SelectorError, 'StructureMismatch'): resolve(self.a, self.s)


if __name__ == '__main__': unittest.main()
