#!/usr/bin/env python3
"""Personal ForgeLabs connector. Contains a worker credential; keep private."""
import base64
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
from urllib.parse import urlparse


def connect(payload):
    os.chmod(__file__, 0o600)
    if payload['mode'] == 'direct':
        namespace = {'__name__': 'forgelabs_installer'}
        exec(compile(payload['bootstrap'], '<ForgeLabs installer>', 'exec'), namespace)
        namespace['install'](payload)
        return
    url = urlparse(payload['url'])
    port = 40000 + int(payload['id'].replace('-', '')[:6], 16) % 20000
    local_host = '[::1]' if url.hostname == '::1' else url.hostname
    forward = f"127.0.0.1:{port}:{local_host}:{url.port or 80}"
    payload['url'] = f'http://127.0.0.1:{port}'
    remote = 'import json,sys; p=json.load(sys.stdin); exec(compile(p["bootstrap"],"<ForgeLabs installer>","exec"), {"__name__":"__main__", "PAYLOAD":p})'
    python = payload['python']
    # Expand a home-relative interpreter without allowing shell substitutions.
    interpreter = '"$HOME"/' + shlex.quote(python[2:]) if python.startswith('~/') else shlex.quote(python)
    args = ['ssh', '-T', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=30',
            '-o', 'ServerAliveCountMax=3', '-p', str(payload['port']), '-R', forward,
            payload['host'], interpreter + ' -c ' + shlex.quote(remote)]
    print('Connecting through your existing SSH login. Keep this terminal open.', flush=True)
    process = subprocess.Popen(args, stdin=subprocess.PIPE)
    try:
        process.communicate(json.dumps(payload).encode())
    except KeyboardInterrupt:
        process.terminate()
        process.wait()
        print('\nConnection closed. Run this connector again to reconnect.')
        return
    if process.returncode:
        raise SystemExit('Connection failed. Check the SSH address, Python path, and message above. Run this file again to retry.')


if __name__ == '__main__':
    connect(json.loads(base64.b64decode('__FORGELABS_PAYLOAD__')))
