import unittest
from unittest.mock import patch
from legacy_ui.interaction import position, chords, validate_options
from legacy_ui.core import resolve,snapshot,selector_from_snapshot
from test_core import FakeAdapter

class PositionTests(unittest.TestCase):
    def test_pixel_offset_tracks_moved_pane(self):
        self.assertEqual(position([500,300,800,600],{'mode':'relative_pixels','x':142,'y':86}),(642,386))
    def test_ratio_edges_stay_inside(self):
        self.assertEqual(position([10,20,110,220],{'mode':'relative_ratio','x':1,'y':1}),(109,219))
    def test_outside_rejected(self):
        with self.assertRaises(ValueError): position([0,0,10,10],{'mode':'relative_pixels','x':10,'y':0})
    def test_changed_size_rejected(self):
        with self.assertRaisesRegex(ValueError,'size changed'):
            position([0,0,100,100],{'mode':'relative_pixels','x':10,'y':10,'recorded_size':[80,80]})
    def test_nonfinite_rejected(self):
        with self.assertRaises(ValueError): validate_options({'action':'click','position':{'mode':'relative_pixels','x':float('nan'),'y':0}})
    def test_sequence(self): self.assertEqual(chords('Ctrl+A; Backspace; F12'),[[17,65],[8],[123]])
    def test_invalid_later_chord_rejected(self):
        with self.assertRaises(ValueError): chords('Ctrl+A; invalid')
    def test_native_selector_omits_dynamic_input_text(self):
        a=FakeAdapter(); a.backend='win32'; a.view='native'
        for node in [a.root,a.form,*a.form['children']]: node['control_id']=100
        s=selector_from_snapshot(snapshot(a,a.root),'n3')
        a.form['children'][1]['name']='Changed text'
        self.assertIs(resolve(a,s)[0],a.form['children'][1])
    def test_backend_mismatch(self):
        a=FakeAdapter(); a.view='native'
        with self.assertRaisesRegex(Exception,'Backend mismatch'):
            resolve(a,{'schema_version':1,'backend':'win32','tree_view':'native','root':{'name':'Lab'},'steps':[]})

class KeyboardTests(unittest.TestCase):
    def setUp(self):
        from legacy_ui import input as module
        self.module=module
        class Element:
            def SetFocus(self): pass
        self.root=Element();self.pane=Element();self.edit=Element();self.other=Element()
        root,pane,edit,other=self.root,self.pane,self.edit,self.other
        class Client:
            CompareElements=staticmethod(lambda a,b:a is b)
            def GetFocusedElement(self): return edit
        class Adapter:
            client=Client()
            def parent(self,node): return root if node is pane else pane if node is edit else None
            def props(self,node): return dict(is_enabled=True,is_password=False,is_offscreen=False,
                control_type='Window' if node is root else 'Pane',native_window_handle=123 if node is root else 0,rect_screen=[0,0,100,100])
            def value(self,node): return 'verified'
        self.adapter=Adapter();self.sent=[]
        self.patches=[patch.object(module.user32,'SetForegroundWindow',return_value=1),
            patch.object(module.user32,'GetForegroundWindow',return_value=123),
            patch.object(module.time,'sleep'),patch.object(module,'send',side_effect=self.sent.append)]
        for p in self.patches: p.start()
        self.addCleanup(lambda:[p.stop() for p in reversed(self.patches)])
    def test_fill_pane_descendant_clears_then_unicode(self):
        self.module.interact(self.adapter,self.pane,'fill','Việt',{'clear_first':True})
        self.assertEqual([i.ki.wVk for i in self.sent[0]],[17,65])
        self.assertEqual(self.sent[2][0].ki.wVk,8)
        self.assertEqual(len(self.sent),8)
    def test_append_skips_clear(self):
        self.module.interact(self.adapter,self.pane,'fill','A',{'clear_first':False})
        self.assertEqual(len(self.sent),1);self.assertEqual(self.sent[0][0].ki.wScan,65)
    def test_strict_focus_rejects_descendant(self):
        with self.assertRaises(RuntimeError): self.module.interact(self.adapter,self.pane,'fill','A',{'allow_descendant_focus':False})
        self.assertFalse(self.sent)
    def test_wrong_focus_sends_nothing(self):
        self.adapter.client.GetFocusedElement=lambda:self.other
        with self.assertRaises(RuntimeError): self.module.interact(self.adapter,self.pane,'send_keys','Ctrl+A')
        self.assertFalse(self.sent)
    def test_invalid_sequence_sends_nothing(self):
        with self.assertRaises(ValueError): self.module.interact(self.adapter,self.pane,'send_keys','Ctrl+A; invalid')
        self.assertFalse(self.sent)
    def test_sequence_stops_after_focus_leaves_pane(self):
        values=iter([self.edit,self.edit,self.other])
        self.adapter.client.GetFocusedElement=lambda:next(values)
        with self.assertRaises(RuntimeError): self.module.interact(self.adapter,self.pane,'send_keys','Tab; Enter')
        self.assertEqual(len(self.sent),2) # Tab down/up, no Enter
    def test_verify_requires_readable_value_before_typing(self):
        self.adapter.value=lambda node:(_ for _ in ()).throw(RuntimeError('No ValuePattern'))
        with self.assertRaises(RuntimeError): self.module.interact(self.adapter,self.pane,'fill','A',{'verify_value':True})
        self.assertFalse(self.sent)

class VisionTests(unittest.TestCase):
    def setUp(self):
        try:
            import cv2,numpy as np
        except ImportError: self.skipTest('Optional vision dependencies not installed')
        self.cv=cv2;self.np=np
        self.template=np.random.default_rng(3).integers(0,256,(12,14,3),dtype=np.uint8)
        self.scene=np.zeros((80,100,3),dtype=np.uint8);self.scene[30:42,40:54]=self.template
    def locate(self):
        from legacy_ui.vision import locate_arrays
        return locate_arrays(self.scene,self.template,[100,200,200,280],{'threshold':.95,'offset':[7,6]},self.cv,self.np)
    def test_unique_anchor(self): self.assertEqual(self.locate(),(147,236))
    def test_duplicate_anchor_rejected(self):
        self.scene[5:17,5:19]=self.template
        with self.assertRaisesRegex(RuntimeError,'Ambiguous'): self.locate()
    def test_missing_anchor_rejected(self):
        self.scene[:]=0
        with self.assertRaisesRegex(RuntimeError,'not found'): self.locate()
