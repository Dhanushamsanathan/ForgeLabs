#!/usr/bin/env python3
"""ForgeLabs pull worker. Standard-library only; run in the training Python environment.

The training child writes logs, events, and its result to disk. The agent persists
acknowledged offsets so an API interruption or agent restart does not lose output.
"""
from __future__ import annotations
import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from runner import atomic_json

VERSION = '0.1.0'


def load_env(path: str):
    if not path:
        return
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#'):
            key, value = line.split('=', 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


class Agent:
    def __init__(self):
        self.url = os.environ['FORGELABS_URL'].rstrip('/')
        self.id = str(uuid.UUID(os.environ['FORGELABS_WORKER_ID']))
        self.token = os.environ['FORGELABS_WORKER_TOKEN']
        self.root = Path(os.environ['FORGELABS_RUN_ROOT']).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.state_path = self.root / f'.worker-{self.id}.json'
        self.state = json.loads(self.state_path.read_text()) if self.state_path.exists() else None
        self.child = None
        self.last_heartbeat = 0.0
        self.secrets = [v for k, v in os.environ.items() if any(s in k.upper() for s in ('TOKEN', 'PASSWORD', 'API_KEY', 'SECRET')) and len(v) >= 8]

    def redact(self, text):
        for secret in self.secrets:
            text = text.replace(secret, '[REDACTED]')
        return text

    def post(self, path, body):
        request = Request(self.url + '/api/worker/' + path, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + self.token, 'X-Worker-Id': self.id}, method='POST')
        with urlopen(request, timeout=15) as response:
            return json.load(response)

    def telemetry(self):
        gpus = []
        binary = '/usr/bin/nvidia-smi' if Path('/usr/bin/nvidia-smi').exists() else 'nvidia-smi'
        try:
            result = subprocess.run([binary, '--query-gpu=name,memory.total,memory.used,utilization.gpu', '--format=csv,noheader,nounits'], capture_output=True, text=True, timeout=5, check=True)
            for line in result.stdout.strip().splitlines():
                name, total, used, utilization = [x.strip() for x in line.split(',')]
                gpus.append({'name': name, 'memoryTotal': float(total), 'memoryUsed': float(used), 'utilization': float(utilization)})
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
        return {'hostname': socket.gethostname(), 'workerVersion': VERSION, 'gpus': gpus, 'diskFreeGb': shutil.disk_usage(self.root).free / 1024**3, 'activeRunId': self.state['id'] if self.state else None, 'recipes': ['tamil-whisper-manifest', 'tamil-whisper-fleurs']}

    def persist(self):
        atomic_json(self.state_path, self.state)

    def launch(self, run):
        run_id = str(uuid.UUID(run['id']))
        output = self.root / run_id
        output.mkdir(exist_ok=False)
        atomic_json(output / 'job.json', run)
        self.state = {'id': run_id, 'eventOffset': 0, 'logOffset': 0, 'launched': time.time()}
        self.persist()
        try:
            with (output / 'output.log').open('ab', buffering=0) as log:
                self.child = subprocess.Popen([sys.executable, '-u', str(Path(__file__).with_name('runner.py')), str(output / 'job.json')], stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        except OSError as exc:
            atomic_json(output / 'result.json', {'status': 'failed', 'error': str(exc), 'artifacts': []})

    def collect(self, path, offset, structured):
        if not path.exists():
            return [], offset
        events = []
        with path.open('rb') as file:
            file.seek(offset)
            for _ in range(50):
                start = file.tell()
                line = file.readline(65536)
                if not line:
                    break
                if not line.endswith(b'\n') and len(line) < 65536:
                    file.seek(start)
                    break
                text = self.redact(line.decode('utf-8', errors='replace').strip())
                if structured:
                    events.append(json.loads(text))
                else:
                    # Stable IDs make a retry after a crash idempotent.
                    identifier = str(uuid.uuid5(uuid.UUID(self.state['id']), f'log:{start}'))
                    events.append({'id': identifier, 'kind': 'log', 'step': None, 'payload': {'message': text[:12000]}})
            return events, file.tell()

    def process_active(self):
        output = self.root / self.state['id']
        events, event_offset = self.collect(output / 'events.jsonl', self.state['eventOffset'], True)
        logs, log_offset = self.collect(output / 'output.log', self.state['logOffset'], False)
        response = self.post(f"runs/{self.state['id']}/events", {'events': events + logs})
        if response.get('terminal'):
            self.state = None
            self.child = None
            self.persist()
            return
        self.state.update(eventOffset=event_offset, logOffset=log_offset)
        self.persist()
        if response['cancelRequested']:
            (output / 'cancel.flag').touch()
        result_path = output / 'result.json'
        if not result_path.exists():
            # Never relaunch an uncertain job after an agent restart.
            alive = True
            if self.child:
                alive = self.child.poll() is None
            elif (output / 'process.json').exists():
                try: os.kill(json.loads((output / 'process.json').read_text())['pid'], 0)
                except ProcessLookupError: alive = False
            elif time.time() - self.state['launched'] > 30:
                alive = False
            if not alive:
                atomic_json(result_path, {'status': 'failed', 'error': 'Training process exited without a result. Inspect worker logs and resume from a saved checkpoint.', 'artifacts': []})
        # Drain all buffered events before marking the run terminal.
        if result_path.exists() and not events and not logs:
            result = json.loads(self.redact(result_path.read_text()))
            self.post(f"runs/{self.state['id']}/finish", result)
            self.state = None
            self.child = None
            self.persist()

    def tick(self):
        if time.time() - self.last_heartbeat >= 10:
            self.post('heartbeat', self.telemetry())
            self.last_heartbeat = time.time()
        if self.state:
            self.process_active()
        else:
            result = self.post('claim', {})
            if result['run']:
                self.launch(result['run'])


def main():
    parser = argparse.ArgumentParser(description='ForgeLabs GPU worker')
    parser.add_argument('--env-file', default='')
    args = parser.parse_args()
    load_env(args.env_file)
    for key in ('FORGELABS_URL', 'FORGELABS_WORKER_ID', 'FORGELABS_WORKER_TOKEN', 'STT_REPO', 'FORGELABS_DATA_ROOT', 'FORGELABS_RUN_ROOT'):
        if not os.environ.get(key):
            raise SystemExit(f'Missing {key}')
    os.environ.setdefault('CUDA_VISIBLE_DEVICES', '0')
    agent = Agent()
    # Prevent two agent processes from sharing the same credential/state file.
    import fcntl
    lock = (agent.root / f'.worker-{agent.id}.lock').open('w')
    try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError: raise SystemExit('This worker is already running') from None
    print(f'ForgeLabs worker {VERSION} connected to configured API. Ctrl+C stops polling, not the training child.', flush=True)
    while True:
        try:
            agent.tick()
        except KeyboardInterrupt:
            print('Worker stopped. Restart with the same configuration to reconnect to an active run.')
            break
        except HTTPError as exc:
            print(f'API returned HTTP {exc.code}; retrying. Check worker credentials and API logs.', flush=True)
        except Exception as exc:
            print(f'Worker: {agent.redact(str(exc))}; retrying.', flush=True)
        time.sleep(2)


if __name__ == '__main__':
    main()
