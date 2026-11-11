"""Strict adapter for an existing stt-tamil checkout. No private code is copied."""
from __future__ import annotations
import hashlib
import json
import math
from pathlib import Path


def contained(path: str, root: Path) -> Path:
    candidate = Path(path).expanduser().resolve()
    try:
        candidate.relative_to(root.expanduser().resolve())
    except ValueError:
        raise ValueError(f"Path must be inside configured root: {root}") from None
    return candidate


def validate_manifest(path: Path, data_root: Path) -> dict:
    count, seconds, speakers, samples = 0, 0.0, set(), []
    checksum = hashlib.sha256()
    seen = set()
    with path.open('rb') as source:
        for line in source:
            checksum.update(line)
            if not line.strip():
                continue
            row = json.loads(line)
            if not isinstance(row, dict) or not all(k in row for k in ('id', 'audio', 'text', 'duration')):
                raise ValueError(f"Manifest row {count + 1} needs id, audio, text, and duration")
            if not isinstance(row['id'], str) or '_' not in row['id'] or not row['id'].rsplit('_', 1)[0]:
                raise ValueError('IDs must use speaker_utterance format')
            if row['id'] in seen:
                raise ValueError(f"Duplicate utterance ID: {row['id']}")
            seen.add(row['id'])
            if not isinstance(row['text'], str) or not row['text'].strip():
                raise ValueError(f"Empty transcript at row {count + 1}")
            audio = contained(str(path.parent / row['audio']), data_root)
            if not audio.is_file():
                raise ValueError(f"Missing audio: {audio}")
            duration = float(row['duration'])
            if not math.isfinite(duration) or duration <= 0 or duration > 30:
                raise ValueError(f"Audio duration must be greater than zero and at most 30 seconds: {row['id']}")
            speakers.add(row['id'].rsplit('_', 1)[0])
            count += 1
            seconds += duration
            if len(samples) < 32:
                samples.append(str(audio))
    if count < 2 or len(speakers) < 2:
        raise ValueError('A speaker-disjoint split requires at least two speakers and two samples')
    return {'rows': count, 'hours': seconds / 3600, 'speakers': len(speakers), 'sha256': checksum.hexdigest(), 'samples': samples}


def build_arguments(run: dict, repo: Path, output: Path, data_root: Path, model_root: Path) -> list[str]:
    config, snapshot = run['config'], run['snapshot']
    dataset, model = snapshot['dataset'], snapshot['model']
    if model['family'] != 'whisper':
        raise ValueError('Only Whisper recipes are available in this worker')
    model_ref = model['reference']
    if model['source'] == 'local':
        model_ref = str(contained(model_ref, model_root))
        if not Path(model_ref).is_dir():
            raise ValueError('Local model directory does not exist')
    if dataset['source'] == 'manifest':
        manifest = contained(dataset['reference'], data_root)
        if not manifest.is_file():
            raise ValueError('Manifest does not exist on this worker')
        args = [str(repo / 'scripts/train_relabeled.py'), '--manifest', str(manifest), '--eval-frac', str(config['evalFrac']), '--seed', str(config['seed']), '--workers', str(config['workers'])]
    elif dataset['source'] == 'huggingface' and dataset['reference'] == 'google/fleurs' and dataset['config'] == 'ta_in':
        args = [str(repo / 'scripts/train_lora.py'), '--config', 'ta_in', '--num-proc', str(config['workers'])]
    else:
        raise ValueError('Unsupported dataset recipe; use a local manifest or Tamil FLEURS')
    if not Path(args[0]).is_file():
        raise ValueError('Training script is missing from STT_REPO')
    args += ['--model', model_ref, '--out', str(output)]
    for key in ('epochs', 'batch', 'accum', 'lr', 'rank'):
        args += [f'--{key}', str(config[key])]
    return args


def resume_checkpoint(value: str, run_root: Path, fingerprint: str) -> Path | None:
    if not value:
        return None
    checkpoint = contained(value, run_root)
    for filename in ('trainer_state.json', 'optimizer.pt', 'scheduler.pt'):
        if not (checkpoint / filename).is_file():
            raise ValueError(f'Resume requires a complete training checkpoint: missing {filename}')
    provenance = checkpoint.parent / 'provenance.json'
    if not provenance.is_file() or json.loads(provenance.read_text())['fingerprint'] != fingerprint:
        raise ValueError('Checkpoint model, dataset, code revision, or training configuration does not match')
    return checkpoint
