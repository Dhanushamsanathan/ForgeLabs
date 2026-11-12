"""Installs only the ForgeLabs worker, using an existing training environment."""
import fcntl
import os
from pathlib import Path
import sys
import uuid


def install(payload):
    if sys.version_info < (3, 10):
        raise SystemExit('Use Python 3.10 or newer from your training environment.')
    os.umask(0o077)
    repo = Path(payload['repo']).expanduser().resolve()
    if not (repo / 'scripts' / 'train_lora.py').is_file() or not (repo / 'scripts' / 'train_relabeled.py').is_file():
        raise SystemExit('Training folder not found. Set the path to the stt-tamil checkout on this GPU server.')
    worker_id = str(uuid.UUID(payload['id']))
    root = Path.home() / '.local' / 'share' / 'forgelabs' / worker_id
    runs = root / 'runs'
    runs.mkdir(parents=True, exist_ok=True)
    lock = (runs / f'.worker-{worker_id}.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('This worker is already running. Keep the existing connector open.') from None
    settings = {
        'FORGELABS_URL': payload['url'], 'FORGELABS_WORKER_ID': worker_id,
        'FORGELABS_WORKER_TOKEN': payload['token'], 'STT_REPO': str(repo),
        'FORGELABS_DATA_ROOT': str(Path(payload.get('data') or repo / 'data').expanduser().resolve()),
        'FORGELABS_MODEL_ROOT': str(Path(payload.get('models') or root / 'models').expanduser().resolve()),
        'FORGELABS_RUN_ROOT': str(runs), 'CUDA_VISIBLE_DEVICES': payload['gpu'],
    }
    for name in ('agent.py', 'runner.py', 'recipe.py'):
        target = root / name
        target.write_text(payload['files'][name])
        target.chmod(0o600)
    config = root / 'worker.env'
    config.write_text(''.join(f'{key}={value}\n' for key, value in settings.items()))
    config.chmod(0o600)
    print('Worker installed. Waiting for ForgeLabs to confirm the connection…', flush=True)
    os.environ.update(settings)
    lock.close()
    os.execv(sys.executable, [sys.executable, '-u', str(root / 'agent.py')])


if __name__ == '__main__':
    install(PAYLOAD)
