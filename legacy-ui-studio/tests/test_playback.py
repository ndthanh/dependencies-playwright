import unittest
from legacy_ui.playback import perform
from test_core import FakeAdapter


class WaitTests(unittest.TestCase):
    def setUp(self):
        self.adapter=FakeAdapter()
        self.selector=dict(schema_version=1,backend='uia',tree_view='raw',root={'name':'Lab'},steps=[])

    def test_wait_exists(self):
        trace=perform(self.adapter,self.selector,dict(action='wait',condition='exists',wait_seconds=0))
        self.assertIn('passed',trace[-1])

    def test_wait_name_timeout(self):
        with self.assertRaises(TimeoutError):
            perform(self.adapter,self.selector,dict(action='wait',condition='name',value='not ready',wait_seconds=.02,poll_seconds=.01))

    def test_wait_polls_until_ready(self):
        original=self.adapter.props
        attempts=[0]
        def props(node):
            p=original(node)
            if node is self.adapter.root:
                attempts[0]+=1
                p['is_enabled']=attempts[0]>4
            return p
        self.adapter.props=props
        trace=perform(self.adapter,self.selector,dict(action='wait',condition='enabled',wait_seconds=1,poll_seconds=.01))
        self.assertGreater(attempts[0],4); self.assertIn('passed',trace[-1])

    def test_sleep_without_target(self):
        self.assertEqual(perform(None,None,dict(action='sleep',seconds=0)),['Sleep: 0 seconds'])

    def test_absent(self):
        self.selector['root']={'name':'Missing'}
        self.assertIn('passed',perform(self.adapter,self.selector,dict(action='wait',condition='absent'))[-1])

    def test_unknown_condition(self):
        with self.assertRaises(ValueError): perform(self.adapter,self.selector,dict(action='wait',condition='typo'))
