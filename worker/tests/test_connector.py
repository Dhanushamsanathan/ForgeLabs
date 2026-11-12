import importlib.util
import json
import os
from pathlib import Path
import shlex
import tempfile
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('connector', ROOT / 'setup' / 'connector.py')
connector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(connector)


class ConnectorTest(unittest.TestCase):
    def payload(self):
        return {'mode': 'ssh', 'url': 'http://127.0.0.1:3100',
                'id': '12345678-1234-1234-1234-123456789abc', 'host': 'user@gpu-server',
                'port': 2222, 'python': "/opt/training env/it's-python", 'token': 'private-token',
                'bootstrap': 'pass'}

    def test_ssh_preserves_login_and_quotes_interpreter_without_exposing_token(self):
        child = Mock(returncode=0)
        with patch.object(connector.os, 'chmod'), patch.object(connector.subprocess, 'Popen', return_value=child) as popen:
            connector.connect(self.payload())
        args = popen.call_args.args[0]
        self.assertIn('ExitOnForwardFailure=yes', args)
        self.assertNotIn('StrictHostKeyChecking=no', args)
        self.assertEqual(shlex.split(args[-1])[0], self.payload()['python'])
        self.assertNotIn('private-token', ' '.join(args))
        self.assertIn(':127.0.0.1:3100', args[args.index('-R') + 1])
        sent = json.loads(child.communicate.call_args.args[0])
        self.assertEqual(sent['token'], 'private-token')
        self.assertTrue(sent['url'].startswith('http://127.0.0.1:'))

    def test_ssh_failure_is_reported(self):
        with patch.object(connector.os, 'chmod'), patch.object(connector.subprocess, 'Popen', return_value=Mock(returncode=255)):
            with self.assertRaisesRegex(SystemExit, 'Connection failed'):
                connector.connect(self.payload())

    def test_install_checks_training_folder_before_writing(self):
        namespace = {'__name__': 'test_installer'}
        exec((ROOT / 'setup' / 'install.py').read_text(), namespace)
        with tempfile.TemporaryDirectory() as home, patch.object(Path, 'home', return_value=Path(home)), patch.object(namespace['sys'], 'version_info', (3, 10)):
            old_mask = os.umask(0o077)
            try:
                with self.assertRaisesRegex(SystemExit, 'Training folder not found'):
                    namespace['install']({'repo': home})
                self.assertFalse((Path(home) / '.local').exists())
            finally:
                os.umask(old_mask)
