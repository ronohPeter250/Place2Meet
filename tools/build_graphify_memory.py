from __future__ import annotations

import json
import sys
from pathlib import Path

from graphify.detect import detect
from graphify.watch import _rebuild_code

from export_graphify_vectors import export_vectors


def _print_summary(detection: dict) -> None:
    files = detection.get("files", {})
    summary = {
        "code": len(files.get("code", [])),
        "document": len(files.get("document", [])),
        "paper": len(files.get("paper", [])),
        "image": len(files.get("image", [])),
        "video": len(files.get("video", [])),
        "total_files": detection.get("total_files", 0),
        "total_words": detection.get("total_words", 0),
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))


def build_memory(project_root: Path) -> dict:
    project_root = project_root.resolve()
    detection = detect(project_root)
    _print_summary(detection)

    out_dir = project_root / "graphify-out"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / ".graphify_python").write_text(sys.executable, encoding="utf-8")
    (out_dir / "corpus-detect.json").write_text(
        json.dumps(detection, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    if not _rebuild_code(project_root):
        raise RuntimeError("graphify code-memory build failed")

    manifest = export_vectors(out_dir / "graph.json", out_dir=out_dir)
    result = {
        "project_root": str(project_root),
        "graph_report": str((out_dir / "GRAPH_REPORT.md").resolve()),
        "graph_json": str((out_dir / "graph.json").resolve()),
        "vector_manifest": str((out_dir / "vector-manifest.json").resolve()),
        "vector_documents": str((out_dir / "vector-documents.jsonl").resolve()),
        "vector_preview": str((out_dir / "vector-preview.jsonl").resolve()),
        "vector_dimensions": manifest["vector_dimensions"],
    }
    return result


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Build graphify memory and vector exports for a project.")
    parser.add_argument(
        "project_root",
        nargs="?",
        default=".",
        help="Project directory to analyze",
    )
    args = parser.parse_args()

    result = build_memory(Path(args.project_root))
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
