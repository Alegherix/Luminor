#!/usr/bin/env python3
"""Transcribe one Luminor meeting recording to JSON segments.

Called by Luminor with placeholders:

    --input {recordingPath} --output {outputPath}

It deliberately writes the transcript to the output file and keeps stdout quiet
so the desktop app does not need to parse command output.
"""

from __future__ import annotations

import argparse
from collections import Counter
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Iterable, Protocol, TypedDict

DEFAULT_MODEL = "KBLab/kb-whisper-large"
DEFAULT_DEVICE = "cuda"
DEFAULT_COMPUTE_TYPE = "float16"
CUDA_LIBRARY_PATH = "/opt/resolve/libs"
CUDA_INIT_ENV = "TRANSCRIBE_CUDA_INIT"
TRANSCRIBE_TASK = "transcribe"
TRANSCRIBE_BEAM_SIZE = 5
VAD_MIN_SILENCE_DURATION_MS = 500
NO_SPEECH_THRESHOLD = 0.3
LIVE_VAD_MIN_SILENCE_DURATION_MS = 300
LIVE_NO_SPEECH_THRESHOLD = 0.6
COMPRESSION_RATIO_THRESHOLD = 2.4
LOG_PROB_THRESHOLD = -1.0
BOILERPLATE_NO_SPEECH_THRESHOLD = 0.35
BOILERPLATE_LOG_PROB_THRESHOLD = -0.8
BOILERPLATE_HALLUCINATIONS = {
    "thank you",
    "thanks",
    "thanks for watching",
    "thank you for watching",
}
BOILERPLATE_COLLAPSE_MIN_SEGMENTS = 10
BOILERPLATE_COLLAPSE_RATIO = 0.80
BOILERPLATE_COLLAPSE_LOW_CONFIDENCE_RATIO = 0.50
BOILERPLATE_COLLAPSE_ERROR = (
    "transcription collapsed into repeated low-confidence boilerplate; "
    "refusing to write misleading transcript"
)
MISSING_FASTER_WHISPER_ERROR = (
    "faster-whisper is not installed; create/activate a Python environment "
    "with faster-whisper before running local transcription"
)
AUDIO_SAMPLE_RATE = "16000"
AUDIO_CHANNELS = "1"


class WhisperSegment(Protocol):
    start: float
    end: float
    text: str


class TranscriptSegment(TypedDict):
    startMs: int
    endMs: int
    text: str


class SegmentFilterStats(TypedDict):
    rawSegments: int
    droppedSegments: int


class TranscriptRunReport(TypedDict):
    model: str
    device: str
    computeType: str
    languageRequested: str
    languageDetected: str
    languageProbability: float | None
    rawSegments: int
    droppedSegments: int
    acceptedSegments: int
    transcriptDurationMs: int


def eprint(message: str) -> None:
    print(message, file=sys.stderr)


def venv_nvidia_library_paths() -> list[str]:
    import site

    suffixes = (
        "nvidia/cublas/lib",
        "nvidia/cudnn/lib",
        "nvidia/cuda_runtime/lib",
    )
    found: list[str] = []
    for base in site.getsitepackages():
        for suffix in suffixes:
            candidate = os.path.join(base, suffix)
            if os.path.isdir(candidate):
                found.append(candidate)
    return found


def ensure_cuda_library_path() -> None:
    if os.environ.get(CUDA_INIT_ENV):
        return

    paths = venv_nvidia_library_paths()
    if os.path.isdir(CUDA_LIBRARY_PATH):
        paths.append(CUDA_LIBRARY_PATH)
    current = os.environ.get("LD_LIBRARY_PATH", "")
    if current:
        paths.append(current)
    if not paths:
        return

    os.environ["LD_LIBRARY_PATH"] = ":".join(paths)
    os.environ[CUDA_INIT_ENV] = "1"
    os.execv(sys.executable, [sys.executable] + sys.argv)


def milliseconds(seconds: float) -> int:
    return round(float(seconds) * 1000)


def normalize_transcript_text(text: str) -> str:
    return " ".join(text.strip().lower().replace("…", "").split()).strip(" .!?")


def should_drop_segment(segment: WhisperSegment) -> bool:
    text = normalize_transcript_text(str(getattr(segment, "text", "")))
    if not text:
        return True
    if text not in BOILERPLATE_HALLUCINATIONS:
        return False

    return is_low_confidence_or_silent_segment(segment)


def is_low_confidence_or_silent_segment(segment: WhisperSegment) -> bool:
    no_speech_prob = getattr(segment, "no_speech_prob", 0.0) or 0.0
    avg_logprob = getattr(segment, "avg_logprob", 0.0) or 0.0
    compression_ratio = getattr(segment, "compression_ratio", 0.0) or 0.0

    return (
        no_speech_prob > BOILERPLATE_NO_SPEECH_THRESHOLD
        or avg_logprob < BOILERPLATE_LOG_PROB_THRESHOLD
        or compression_ratio > COMPRESSION_RATIO_THRESHOLD
    )


def looks_like_boilerplate_collapse(segments: Iterable[str]) -> bool:
    normalized = [
        text
        for text in (normalize_transcript_text(segment) for segment in segments)
        if text
    ]
    if len(normalized) < BOILERPLATE_COLLAPSE_MIN_SEGMENTS:
        return False

    text, count = Counter(normalized).most_common(1)[0]
    return (
        text in BOILERPLATE_HALLUCINATIONS
        and count / len(normalized) >= BOILERPLATE_COLLAPSE_RATIO
    )


def looks_like_raw_boilerplate_collapse(segments: Iterable[WhisperSegment]) -> bool:
    normalized: list[str] = []
    low_confidence_by_text: Counter[str] = Counter()

    for segment in segments:
        text = normalize_transcript_text(str(getattr(segment, "text", "")))
        if not text:
            continue

        normalized.append(text)
        if text in BOILERPLATE_HALLUCINATIONS and is_low_confidence_or_silent_segment(segment):
            low_confidence_by_text[text] += 1

    if len(normalized) < BOILERPLATE_COLLAPSE_MIN_SEGMENTS:
        return False

    top_text, top_count = Counter(normalized).most_common(1)[0]
    if top_text not in BOILERPLATE_HALLUCINATIONS:
        return False

    top_ratio = top_count / len(normalized)
    low_confidence_ratio_for_top = low_confidence_by_text[top_text] / top_count
    return (
        top_ratio >= BOILERPLATE_COLLAPSE_RATIO
        and low_confidence_ratio_for_top >= BOILERPLATE_COLLAPSE_LOW_CONFIDENCE_RATIO
    )


def looks_like_empty_after_boilerplate_filter(
    raw_segments: Iterable[WhisperSegment],
    accepted_segments: list[TranscriptSegment],
) -> bool:
    if accepted_segments:
        return False

    saw_text = False
    for segment in raw_segments:
        text = normalize_transcript_text(str(getattr(segment, "text", "")))
        if not text:
            continue

        saw_text = True
        if text not in BOILERPLATE_HALLUCINATIONS:
            return False
        if not is_low_confidence_or_silent_segment(segment):
            return False

    return saw_text


def build_transcribe_kwargs(language: str | None) -> dict[str, object]:
    transcribe_kwargs: dict[str, object] = {
        "task": TRANSCRIBE_TASK,
        "beam_size": TRANSCRIBE_BEAM_SIZE,
        "vad_filter": True,
        "vad_parameters": {"min_silence_duration_ms": VAD_MIN_SILENCE_DURATION_MS},
        "condition_on_previous_text": False,
        "no_speech_threshold": NO_SPEECH_THRESHOLD,
        "compression_ratio_threshold": COMPRESSION_RATIO_THRESHOLD,
        "log_prob_threshold": LOG_PROB_THRESHOLD,
    }
    if language:
        transcribe_kwargs["language"] = language
    return transcribe_kwargs


def build_live_transcribe_kwargs(language: str | None) -> dict[str, object]:
    kwargs = build_transcribe_kwargs(language)
    kwargs["no_speech_threshold"] = LIVE_NO_SPEECH_THRESHOLD
    kwargs["vad_parameters"] = {
        "min_silence_duration_ms": LIVE_VAD_MIN_SILENCE_DURATION_MS,
    }
    return kwargs


def convert_segments_to_transcript_json(
    segments: Iterable[WhisperSegment],
) -> tuple[list[TranscriptSegment], SegmentFilterStats]:
    converted: list[TranscriptSegment] = []
    raw_count = 0
    dropped_count = 0
    for segment in segments:
        raw_count += 1
        if should_drop_segment(segment):
            dropped_count += 1
            continue

        text = str(segment.text).strip()
        start_ms = milliseconds(segment.start)
        end_ms = milliseconds(segment.end)
        if end_ms < start_ms:
            end_ms = start_ms

        converted.append({"startMs": start_ms, "endMs": end_ms, "text": text})
    return converted, {"rawSegments": raw_count, "droppedSegments": dropped_count}


def segments_to_transcript_json(segments: Iterable[WhisperSegment]) -> list[TranscriptSegment]:
    converted, _stats = convert_segments_to_transcript_json(segments)
    return converted


def write_transcript_json(segments: list[TranscriptSegment], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(segments, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def format_timestamp(milliseconds_value: int, *, decimal_separator: str) -> str:
    total_ms = max(0, int(milliseconds_value))
    hours, remainder = divmod(total_ms, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}{decimal_separator}{millis:03d}"


def render_srt(segments: list[TranscriptSegment]) -> str:
    blocks: list[str] = []
    for index, segment in enumerate(segments, start=1):
        start = format_timestamp(segment["startMs"], decimal_separator=",")
        end = format_timestamp(segment["endMs"], decimal_separator=",")
        blocks.append(f"{index}\n{start} --> {end}\n{segment['text']}\n")
    return "\n".join(blocks)


def render_vtt(segments: list[TranscriptSegment]) -> str:
    blocks: list[str] = ["WEBVTT\n"]
    for segment in segments:
        start = format_timestamp(segment["startMs"], decimal_separator=".")
        end = format_timestamp(segment["endMs"], decimal_separator=".")
        blocks.append(f"{start} --> {end}\n{segment['text']}\n")
    return "\n".join(blocks)


def render_markdown(segments: list[TranscriptSegment]) -> str:
    lines = ["# Transcript", ""]
    for segment in segments:
        stamp = format_timestamp(segment["startMs"], decimal_separator=".")
        lines.append(f"- **[{stamp}]** {segment['text']}")
    return "\n".join(lines) + "\n"


def write_text_artifact(content: str, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8")


def validate_paths(input_path: Path, output_path: Path) -> None:
    if not str(input_path):
        raise ValueError("missing --input")
    if not str(output_path):
        raise ValueError("missing --output")
    if not input_path.exists():
        raise FileNotFoundError(f"input file does not exist: {input_path}")
    if not input_path.is_file():
        raise ValueError(f"input path is not a file: {input_path}")


def command_failure_summary(result: subprocess.CompletedProcess[str]) -> str:
    detail = " ".join((result.stderr or result.stdout or "").split())
    return detail or f"exit {result.returncode}"


def run_checked_command(args: list[str], label: str) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError(f"{label} failed: executable not found") from exc
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed: {command_failure_summary(result)}")
    return result


def parse_probe_json(raw: str) -> dict[str, object]:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("ffprobe returned invalid JSON") from exc
    if not isinstance(parsed, dict):
        raise RuntimeError("ffprobe returned invalid JSON")
    return parsed


def probe_audio_streams(input_path: Path) -> tuple[dict[str, object], list[dict[str, object]]]:
    result = run_checked_command(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(input_path),
        ],
        "ffprobe",
    )
    parsed = parse_probe_json(result.stdout)
    format_info = parsed.get("format")
    streams = parsed.get("streams")
    if not isinstance(format_info, dict):
        format_info = {}
    if not isinstance(streams, list):
        streams = []
    audio_streams = [
        stream
        for stream in streams
        if isinstance(stream, dict) and stream.get("codec_type") == "audio"
    ]
    if not audio_streams:
        raise RuntimeError("input file has no audio streams")
    return format_info, audio_streams


def duration_label(format_info: dict[str, object], stream: dict[str, object]) -> str:
    for candidate in (stream.get("duration"), format_info.get("duration")):
        try:
            duration = float(candidate)
        except (TypeError, ValueError):
            continue
        if duration >= 0:
            return f"{duration:.3f}s"
    return "unknown"


def stream_index(stream: dict[str, object]) -> int:
    value = stream.get("index")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.isdigit():
        return int(value)
    raise RuntimeError("selected audio stream is missing an index")


def parse_volume(stderr: str) -> tuple[str | None, str | None]:
    mean_volume: str | None = None
    max_volume: str | None = None
    for line in stderr.splitlines():
        if "mean_volume:" in line:
            mean_volume = line.split("mean_volume:", 1)[1].strip()
        if "max_volume:" in line:
            max_volume = line.split("max_volume:", 1)[1].strip()
    return mean_volume, max_volume


def normalize_audio_for_transcription(input_path: Path, tmpdir: Path) -> Path:
    format_info, audio_streams = probe_audio_streams(input_path)
    selected_stream = audio_streams[0]
    selected_index = stream_index(selected_stream)
    wav_path = tmpdir / f"{input_path.stem}-16k-mono.wav"

    eprint(f"input path: {input_path}")
    eprint(f"input duration: {duration_label(format_info, selected_stream)}")
    eprint(f"audio stream count: {len(audio_streams)}")
    eprint(f"selected audio stream: 0:{selected_index}")
    eprint(f"normalized wav path: {wav_path}")

    result = run_checked_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-y",
            "-i",
            str(input_path),
            "-map",
            f"0:{selected_index}",
            "-vn",
            "-af",
            "volumedetect",
            "-ac",
            AUDIO_CHANNELS,
            "-ar",
            AUDIO_SAMPLE_RATE,
            "-acodec",
            "pcm_s16le",
            "-f",
            "wav",
            str(wav_path),
        ],
        "ffmpeg audio normalization",
    )

    mean_volume, max_volume = parse_volume(result.stderr)
    if mean_volume or max_volume:
        eprint(
            f"normalized wav volume: mean={mean_volume or 'unknown'}, max={max_volume or 'unknown'}",
        )
    return wav_path


def load_whisper_model_class():
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise RuntimeError(MISSING_FASTER_WHISPER_ERROR) from exc
    return WhisperModel


def transcribe_recording(
    input_path: Path,
    output_path: Path,
    *,
    model_name: str,
    device: str,
    compute_type: str,
    language: str | None,
) -> tuple[list[TranscriptSegment], TranscriptRunReport]:
    validate_paths(input_path, output_path)

    WhisperModel = load_whisper_model_class()

    eprint(f"loading model: {model_name} (device={device}, compute_type={compute_type})")
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    transcribe_kwargs = build_transcribe_kwargs(language)
    with tempfile.TemporaryDirectory(prefix="luminor-transcribe-") as tmp:
        audio_path = normalize_audio_for_transcription(input_path, Path(tmp))
        eprint(f"transcribing normalized audio: {audio_path}")
        raw_segment_iter, info = model.transcribe(str(audio_path), **transcribe_kwargs)
        raw_segments = list(raw_segment_iter)
        if looks_like_raw_boilerplate_collapse(raw_segments):
            raise RuntimeError(BOILERPLATE_COLLAPSE_ERROR)
        segments, filter_stats = convert_segments_to_transcript_json(raw_segments)

    if looks_like_empty_after_boilerplate_filter(raw_segments, segments):
        raise RuntimeError(BOILERPLATE_COLLAPSE_ERROR)

    detected_language = getattr(info, "language", "unknown")
    language_probability = getattr(info, "language_probability", None)
    if language_probability is None:
        eprint(f"detected language: {detected_language}")
    else:
        eprint(f"detected language: {detected_language} ({language_probability:.3f})")

    report: TranscriptRunReport = {
        "model": model_name,
        "device": device,
        "computeType": compute_type,
        "languageRequested": language or "auto",
        "languageDetected": str(detected_language),
        "languageProbability": (
            float(language_probability) if language_probability is not None else None
        ),
        "rawSegments": filter_stats["rawSegments"],
        "droppedSegments": filter_stats["droppedSegments"],
        "acceptedSegments": len(segments),
        "transcriptDurationMs": segments[-1]["endMs"] if segments else 0,
    }
    eprint(
        "segment filter: "
        f"raw={filter_stats['rawSegments']}, "
        f"dropped={filter_stats['droppedSegments']}, "
        f"accepted={len(segments)}",
    )
    return segments, report


def write_requested_artifacts(
    segments: list[TranscriptSegment],
    report: TranscriptRunReport,
    *,
    output_path: Path,
    srt_path: Path | None,
    vtt_path: Path | None,
    markdown_path: Path | None,
    report_path: Path | None,
) -> None:
    write_transcript_json(segments, output_path)
    eprint(f"segments written: {len(segments)}")
    eprint(f"output path: {output_path}")

    if srt_path is not None:
        write_text_artifact(render_srt(segments), srt_path)
        eprint(f"srt path: {srt_path}")
    if vtt_path is not None:
        write_text_artifact(render_vtt(segments), vtt_path)
        eprint(f"vtt path: {vtt_path}")
    if markdown_path is not None:
        write_text_artifact(render_markdown(segments), markdown_path)
        eprint(f"markdown path: {markdown_path}")
    if report_path is not None:
        write_text_artifact(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n",
            report_path,
        )
        eprint(f"report path: {report_path}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Transcribe one Luminor .webm meeting recording to JSON segments.",
    )
    parser.add_argument("--check-deps", action="store_true", help="Verify faster-whisper can be imported with this Python interpreter.")
    parser.add_argument("--input", type=Path, help="Path to a Luminor recording, usually .webm.")
    parser.add_argument("--output", type=Path, help="Path to write transcript JSON array.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"faster-whisper model (default: {DEFAULT_MODEL}).")
    parser.add_argument("--device", default=DEFAULT_DEVICE, help=f"faster-whisper device (default: {DEFAULT_DEVICE}).")
    parser.add_argument("--compute-type", default=DEFAULT_COMPUTE_TYPE, help=f"faster-whisper compute type (default: {DEFAULT_COMPUTE_TYPE}).")
    parser.add_argument("--language", help="Language code sv or en. Omit or pass 'auto' for detection.")
    parser.add_argument("--srt", type=Path, help="Optional path to write an SRT subtitle file.")
    parser.add_argument("--vtt", type=Path, help="Optional path to write a WebVTT subtitle file.")
    parser.add_argument("--markdown", type=Path, help="Optional path to write a Markdown transcript.")
    parser.add_argument("--report", type=Path, help="Optional path to write a JSON run report (model/language/segment stats).")
    return parser


def normalize_language_arg(language: str | None) -> str | None:
    if language is None:
        return None
    normalized = language.strip().lower()
    if normalized in ("", "auto"):
        return None
    return normalized


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.device == "cuda":
        ensure_cuda_library_path()

    try:
        if args.check_deps:
            load_whisper_model_class()
            return 0
        if args.input is None or args.output is None:
            parser.error("--input and --output are required unless --check-deps is used")
        segments, report = transcribe_recording(
            args.input,
            args.output,
            model_name=args.model,
            device=args.device,
            compute_type=args.compute_type,
            language=normalize_language_arg(args.language),
        )
        write_requested_artifacts(
            segments,
            report,
            output_path=args.output,
            srt_path=args.srt,
            vtt_path=args.vtt,
            markdown_path=args.markdown,
            report_path=args.report,
        )
    except Exception as exc:  # noqa: BLE001 - CLI should report any transcription failure.
        eprint(f"error: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
