import json
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from recipe import contained, validate_manifest, resume_checkpoint, build_arguments


class RecipeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.data = self.root / 'data'
        self.data.mkdir()
        (self.data / 'audio.flac').write_bytes(b'fixture')

    def manifest(self, rows):
        path = self.data / 'manifest.jsonl'
        path.write_text('\n'.join(json.dumps(row) for row in rows))
        return path

    def rows(self):
        return [{'id': 'speaker1_1', 'audio': 'audio.flac', 'text': 'hello', 'duration': 3}, {'id': 'speaker2_1', 'audio': 'audio.flac', 'text': 'world', 'duration': 4}]

    def test_rejects_escape_and_symlink_escape(self):
        outside = self.root / 'outside'
        outside.write_text('private')
        (self.data / 'link').symlink_to(outside)
        for path in [str(self.data / '../outside'), str(self.data / 'link')]:
            with self.assertRaises(ValueError): contained(path, self.data)

    def test_manifest_counts_and_provenance(self):
        audit = validate_manifest(self.manifest(self.rows()), self.data)
        self.assertEqual(audit['rows'], 2)
        self.assertEqual(audit['speakers'], 2)
        self.assertEqual(len(audit['sha256']), 64)

    def test_rejects_missing_audio_duplicate_ids_single_speaker_and_bad_duration(self):
        for field, value in [('audio', 'missing.flac'), ('id', 'speaker1_1'), ('id', 'speaker1_2'), ('duration', 31), ('duration', float('nan')), ('text', '')]:
            rows = self.rows()
            rows[1][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                validate_manifest(self.manifest(rows), self.data)

    def test_resume_requires_full_state_and_same_provenance(self):
        run = self.root / 'old-run'
        checkpoint = run / 'checkpoint-10'
        checkpoint.mkdir(parents=True)
        with self.assertRaises(ValueError): resume_checkpoint(str(checkpoint), self.root, 'fingerprint')
        for name in ['trainer_state.json', 'optimizer.pt', 'scheduler.pt']:
            (checkpoint / name).write_text('{}')
        (run / 'provenance.json').write_text(json.dumps({'fingerprint': 'fingerprint'}))
        self.assertEqual(resume_checkpoint(str(checkpoint), self.root, 'fingerprint'), checkpoint.resolve())
        with self.assertRaises(ValueError): resume_checkpoint(str(checkpoint), self.root, 'different')

    def test_shell_characters_remain_literal_arguments(self):
        repo = self.root / 'repo'
        (repo / 'scripts').mkdir(parents=True)
        (repo / 'scripts/train_lora.py').write_text('')
        run = {'config': {'epochs': 1, 'batch': 1, 'accum': 1, 'lr': .0001, 'rank': 8, 'workers': 0}, 'snapshot': {'model': {'family': 'whisper', 'source': 'huggingface', 'reference': 'org/model; echo unsafe'}, 'dataset': {'source': 'huggingface', 'reference': 'google/fleurs', 'config': 'ta_in'}}}
        args = build_arguments(run, repo, self.root / 'output', self.data, self.data)
        self.assertEqual(args[args.index('--model') + 1], 'org/model; echo unsafe')
        run['snapshot']['dataset']['reference'] = 'unsupported/data'
        with self.assertRaises(ValueError): build_arguments(run, repo, self.root / 'output', self.data, self.data)


if __name__ == '__main__': unittest.main()
