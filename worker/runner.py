"""Detached process that bridges the external training recipe to structured events."""
from __future__ import annotations
import hashlib
import json
import math
import os
import runpy
import subprocess
import sys
import traceback
import uuid
from pathlib import Path
from recipe import build_arguments, contained, resume_checkpoint, validate_manifest


def atomic_json(path: Path, data: dict):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False))
    tmp.replace(path)


def main(job_path: Path):
    run = json.loads(job_path.read_text())
    output = job_path.parent
    atomic_json(output / 'process.json', {'pid': os.getpid()})
    event_file = (output / 'events.jsonl').open('a', buffering=1)

    def emit(kind, payload, step=None):
        event_file.write(json.dumps({'id': str(uuid.uuid4()), 'kind': kind, 'step': step, 'payload': payload}, allow_nan=False) + '\n')

    status, error = 'failed', None
    try:
        repo = Path(os.environ['STT_REPO']).expanduser().resolve()
        data_root = Path(os.environ['FORGELABS_DATA_ROOT']).expanduser().resolve()
        model_root = Path(os.environ.get('FORGELABS_MODEL_ROOT', str(data_root))).expanduser().resolve()
        run_root = Path(os.environ['FORGELABS_RUN_ROOT']).expanduser().resolve()
        arguments = build_arguments(run, repo, output, data_root, model_root)
        print('[preflight] Checking training environment and dataset', flush=True)
        dataset = run['snapshot']['dataset']
        audit = None
        if dataset['source'] == 'manifest':
            audit = validate_manifest(contained(dataset['reference'], data_root), data_root)
            print(f"[data] {audit['rows']} utterances, {audit['hours']:.2f} hours, {audit['speakers']} speakers", flush=True)
            # Decode a bounded sample; the original collator handles the remaining data.
            for audio in audit['samples']:
                probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels', '-of', 'json', audio], check=True, capture_output=True, text=True, timeout=15)
                info = json.loads(probe.stdout)
                duration = float(info['format']['duration'])
                if not math.isfinite(duration) or not 0 < duration <= 30.1:
                    raise ValueError('Decoded sample exceeds Whisper audio duration limits')
                if not info.get('streams') or int(info['streams'][0].get('channels', 0)) != 1:
                    raise ValueError('Prepare mono audio before training with this recipe')
            emit('log', {'message': '[preflight] Manifest checked; up to 32 audio files decoded successfully.'})
        revision = subprocess.run(['git', '-C', str(repo), 'rev-parse', 'HEAD'], capture_output=True, text=True, timeout=10, check=True).stdout.strip()
        config = {k: v for k, v in run['config'].items() if k != 'resumeFrom'}
        provenance = {'model': run['snapshot']['model']['reference'], 'dataset': dataset['reference'], 'datasetConfig': dataset['config'], 'manifestSha256': audit['sha256'] if audit else None, 'config': config, 'recipeRevision': revision}
        # Include current script bytes even when the checkout has uncommitted edits.
        provenance['scriptSha256'] = hashlib.sha256(Path(arguments[0]).read_bytes()).hexdigest()
        fingerprint = hashlib.sha256(json.dumps(provenance, sort_keys=True).encode()).hexdigest()
        provenance['fingerprint'] = fingerprint
        checkpoint = resume_checkpoint(run['config'].get('resumeFrom', ''), run_root, fingerprint)
        atomic_json(output / 'provenance.json', provenance)

        import torch
        import transformers
        from transformers import TrainerCallback, AutoConfig, set_seed

        if not torch.cuda.is_available():
            raise RuntimeError('CUDA GPU not available in this worker environment')
        if not torch.cuda.is_bf16_supported():
            raise RuntimeError('The current training recipe requires BF16 support')
        model_config = AutoConfig.from_pretrained(arguments[arguments.index('--model') + 1], trust_remote_code=False)
        if model_config.model_type != 'whisper':
            raise ValueError('This training recipe requires a Whisper model')
        set_seed(config['seed'])
        print(f'[device] {torch.cuda.get_device_name(0)}', flush=True)

        class Reporter(TrainerCallback):
            def on_train_begin(self, args, state, control, **kwargs):
                emit('metric', {'step': state.global_step, 'total_steps': state.max_steps, 'epoch': state.epoch or 0}, state.global_step)

            def on_log(self, args, state, control, logs=None, **kwargs):
                values = {k: v for k, v in (logs or {}).items() if isinstance(v, (int, float)) and math.isfinite(v)}
                values.update(step=state.global_step, total_steps=state.max_steps, epoch=state.epoch or 0)
                emit('metric', values, state.global_step)

            def on_step_end(self, args, state, control, **kwargs):
                if (output / 'cancel.flag').exists():
                    control.should_save = True
                    control.should_training_stop = True
                return control

            def on_save(self, args, state, control, **kwargs):
                emit('checkpoint', {'path': str(output / f'checkpoint-{state.global_step}')}, state.global_step)

        original = transformers.Seq2SeqTrainer

        class InstrumentedTrainer(original):
            def __init__(self, *args, **kwargs):
                training_args = kwargs.get('args')
                if training_args:
                    training_args.seed = config['seed']
                    training_args.save_only_model = False
                    training_args.save_total_limit = 2
                super().__init__(*args, **kwargs)
                self.add_callback(Reporter())

            def train(self, *args, **kwargs):
                if checkpoint:
                    kwargs['resume_from_checkpoint'] = str(checkpoint)
                return super().train(*args, **kwargs)

        transformers.Seq2SeqTrainer = InstrumentedTrainer
        sys.path.insert(0, str(repo / 'src'))
        sys.path.insert(0, str(repo / 'scripts'))
        sys.argv = arguments
        if (output / 'cancel.flag').exists():
            status = 'cancelled'
        else:
            runpy.run_path(arguments[0], run_name='__main__')
            status = 'cancelled' if (output / 'cancel.flag').exists() else 'completed'
    except BaseException as exc:
        error = f'{type(exc).__name__}: {exc}'[:4000]
        traceback.print_exc()
    finally:
        artifacts = []
        for path in sorted(output.glob('checkpoint-*')):
            if path.is_dir(): artifacts.append({'name': path.name, 'path': str(path), 'kind': 'checkpoint'})
        if (output / 'adapter').is_dir(): artifacts.append({'name': 'LoRA adapter', 'path': str(output / 'adapter'), 'kind': 'adapter'})
        atomic_json(output / 'result.json', {'status': status, 'error': error, 'artifacts': artifacts})
        event_file.close()


if __name__ == '__main__':
    main(Path(sys.argv[1]).resolve())
