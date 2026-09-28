"""Design validation only. This is NOT the Python orchestrator."""
import copy
import json
from pathlib import Path
from jsonschema import Draft202012Validator

root = Path(__file__).parent
example = json.loads((root / 'example.json').read_text(encoding='utf-8'))
names = {'step': 'step', 'request': 'action-request', 'result': 'action-result', 'context': 'bot-context'}
validators = {}
for key, filename in names.items():
    schema = json.loads((root / f'{filename}.schema.json').read_text(encoding='utf-8'))
    Draft202012Validator.check_schema(schema)
    validators[key] = Draft202012Validator(schema)
    validators[key].validate(example[key])

checks = 4
def rejected(key, mutation):
    global checks
    candidate = copy.deepcopy(example[key])
    mutation(candidate)
    assert list(validators[key].iter_errors(candidate)), f'Invalid {key} unexpectedly accepted'
    checks += 1

rejected('step', lambda x: x.pop('target'))
rejected('step', lambda x: x.update(action='FOR'))
rejected('step', lambda x: x.update(timeoutMs=0))
rejected('step', lambda x: x.update(onFail={'policy': 'Retry'}))
rejected('step', lambda x: x.update(onFail={'policy':'Retry','maxAttempts':2,'delayMs':100,'retryOn':['TRANSIENT_SIGNAL'],'totalTimeoutMs':20000,'replay':'forbidden'}))
rejected('step', lambda x: x.update(success={'kind':'visible'}))
rejected('step', lambda x: x.update(success={'kind':'text','target':x['target']}))
rejected('request', lambda x: x.update(attempt=0))
rejected('result', lambda x: x.update(success=False))
rejected('result', lambda x: x.update(status='Failed', success=False, error=None))
rejected('result', lambda x: x.update(status='Skipped', success=True))
rejected('result', lambda x: x.update(artifacts=[{'kind':'download','path':'../escape.txt'}]))
rejected('result', lambda x: x.update(artifacts=[{'kind':'download','path':'C:\\escape.txt'}]))
rejected('context', lambda x: x.update(browser={'runtimeObject':True}))
print(f'PASS: {checks} contract fixtures; 4 schemas valid (draft 2020-12).')
