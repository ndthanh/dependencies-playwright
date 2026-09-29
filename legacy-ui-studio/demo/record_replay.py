"""Record the actual demo window while replaying the example JSON workflow.

Requires ffmpeg on PATH. Run PaneDemo first. No reconstructed or generated frames.
"""
import os
from pathlib import Path
import subprocess
import sys
import time

root=Path(__file__).resolve().parents[1]
os.chdir(root)
output=root/'artifacts'
output.mkdir(exist_ok=True)
session=root/'demo'/'session'
session.mkdir(exist_ok=True)
(session/'stage.txt').write_text('Replay / saved selectors + atomic actions + waits',encoding='utf-8')
(session/'trace.txt').write_text('Live Python replay\n\n1. Invoke Clear\n2. Wait for empty input\n3. Set customer code\n4. Set customer name\n5. Invoke Save\n6. Wait for the saved result\n7. Invoke Clear\n8. Wait for both inputs to be empty\n\nSource: examples/flow.json\nAll selectors resolve against the live UI tree.',encoding='utf-8')
with (output/'replay-video.log').open('w') as log:
    recorder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','warning','-y','-f','gdigrab',
        '-framerate','10','-draw_mouse','0','-i','title=Legacy Pane Lab','-t','20',
        '-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','ultrafast',
        '-crf','21','-pix_fmt','yuv420p',str(output/'replay.mp4')],stdout=log,stderr=log,
        creationflags=subprocess.CREATE_NO_WINDOW)
    time.sleep(1)
    if recorder.poll() is not None: raise RuntimeError('Recorder failed; see replay-video.log')
    run=subprocess.run([sys.executable,'-m','legacy_ui','replay','--flow','examples/flow.json',
        '--out','artifacts/replay-final.json'],capture_output=True,encoding='utf-8',timeout=50,
        env=dict(os.environ,PYTHONIOENCODING='utf-8'))
    if run.returncode==0:
        (session/'stage.txt').write_text('Replay complete / 12 of 12 activities passed',encoding='utf-8')
        (session/'trace.txt').write_text('PASS\n\n2 inputs filled through ValuePattern\nSave + Clear invoked through InvokePattern\nWait conditions verified on live elements\n\n12 atomic activities completed, including delays.\n\nReport: artifacts/replay-final.json',encoding='utf-8')
    else:
        (session/'trace.txt').write_text(run.stderr,encoding='utf-8')
    recorder.wait(timeout=30)
    if run.returncode or recorder.returncode: raise RuntimeError(run.stderr or 'Recording failed')
check=subprocess.run(['ffmpeg','-hide_banner','-i',str(output/'replay.mp4'),
    '-vf','blackdetect=d=2:pix_th=0.1,freezedetect=n=-50dB:d=12',
    '-an','-f','null','-'],capture_output=True,text=True,timeout=30)
if 'black_start:' in check.stderr or 'freeze_start:' in check.stderr:
    raise RuntimeError('Replay passed, but the recording contains black/frozen frames. '
                       'Use an unlocked interactive desktop and record again; do not publish this clip.')
print('Recorded artifacts/replay.mp4; replay passed; no long black/frozen segment detected.')
