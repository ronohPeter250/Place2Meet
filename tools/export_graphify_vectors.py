from __future__ import annotations

import hashlib
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

TOKEN_RE = re.compile(r"[A-Za-z0-9_./:-]+")
DEFAULT_VECTOR_DIMENSIONS = 128
DEFAULT_NEIGHBOR_LIMIT = 12


def _normalize(vector: list[float]) -> list[float]:
    magnitude = math.sqrt(sum(value * value for value in vector))
    if magnitude == 0:
        return vector
    return [round(value / magnitude, 6) for value in vector]


def hashed_vector(text: str, dimensions: int = DEFAULT_VECTOR_DIMENSIONS) -> list[float]:
    vector = [0.0] * dimensions
    for token in TOKEN_RE.findall(text.lower()):
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
        bucket = int.from_bytes(digest[:4], "little") % dimensions
        sign = 1.0 if digest[4] % 2 == 0 else -1.0
        weight = 1.0 + min(len(token), 24) / 24.0
        vector[bucket] += sign * weight
    return _normalize(vector)


def _load_graph(graph_path: Path) -> dict[str, Any]:
    return json.loads(graph_path.read_text(encoding="utf-8"))


def _render_vector_html(preview_rows: list[dict[str, Any]], out_path: Path, dimensions: int) -> None:
    data_json = json.dumps(preview_rows, ensure_ascii=False)
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Graphify Vector Preview</title>
  <style>
    :root {{
      --bg: #0f1117;
      --panel: #171a22;
      --panel-2: #1f2430;
      --border: #2d3445;
      --text: #e6ebf5;
      --muted: #9ca6ba;
      --accent: #5cc8ff;
      --accent-2: #ff8a5b;
      --ok: #7ee787;
    }}
    * {{
      box-sizing: border-box;
    }}
    body {{
      margin: 0;
      font-family: "Segoe UI", system-ui, sans-serif;
      background: linear-gradient(180deg, #0d1016 0%, #111520 100%);
      color: var(--text);
    }}
    .layout {{
      display: grid;
      grid-template-columns: 420px 1fr;
      min-height: 100vh;
    }}
    .sidebar {{
      border-right: 1px solid var(--border);
      background: rgba(16, 19, 27, 0.92);
      backdrop-filter: blur(8px);
      padding: 20px;
      overflow: auto;
    }}
    .content {{
      padding: 24px;
      overflow: auto;
    }}
    h1 {{
      margin: 0 0 8px;
      font-size: 24px;
    }}
    .sub {{
      color: var(--muted);
      margin-bottom: 18px;
      line-height: 1.5;
    }}
    .stats {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 18px;
    }}
    .stat {{
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 12px;
    }}
    .stat b {{
      display: block;
      font-size: 18px;
      margin-top: 6px;
    }}
    .label {{
      color: var(--muted);
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }}
    .search {{
      width: 100%;
      padding: 12px 14px;
      background: var(--panel);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 12px;
      outline: none;
      margin-bottom: 14px;
    }}
    .search:focus {{
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(92, 200, 255, 0.15);
    }}
    .list {{
      display: grid;
      gap: 10px;
    }}
    .item {{
      border: 1px solid var(--border);
      background: var(--panel);
      border-radius: 14px;
      padding: 12px;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }}
    .item:hover {{
      transform: translateY(-1px);
      border-color: var(--accent);
      background: var(--panel-2);
    }}
    .item.active {{
      border-color: var(--accent-2);
      box-shadow: 0 0 0 3px rgba(255, 138, 91, 0.14);
    }}
    .item h3 {{
      margin: 0 0 6px;
      font-size: 15px;
      word-break: break-word;
    }}
    .meta {{
      color: var(--muted);
      font-size: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}
    .panel {{
      background: rgba(19, 23, 32, 0.9);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 20px;
      min-height: calc(100vh - 48px);
    }}
    .pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(92, 200, 255, 0.1);
      color: var(--accent);
      border: 1px solid rgba(92, 200, 255, 0.22);
      font-size: 12px;
      margin-right: 8px;
      margin-bottom: 8px;
    }}
    .empty {{
      color: var(--muted);
      padding: 18px 0;
    }}
    pre {{
      margin: 0;
      white-space: pre-wrap;
      word-break: break-word;
      background: #0d1016;
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 16px;
      line-height: 1.55;
      color: #d5def0;
    }}
    .vector-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
      gap: 8px;
      margin-top: 16px;
    }}
    .vec {{
      background: #0d1016;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 8px;
      text-align: center;
    }}
    .vec .dim {{
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 5px;
    }}
    .vec .val {{
      font-family: Consolas, monospace;
      font-size: 12px;
      color: var(--ok);
    }}
    .section {{
      margin-top: 18px;
    }}
    .section h2 {{
      font-size: 14px;
      margin: 0 0 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }}
    @media (max-width: 980px) {{
      .layout {{
        grid-template-columns: 1fr;
      }}
      .sidebar {{
        border-right: none;
        border-bottom: 1px solid var(--border);
      }}
      .panel {{
        min-height: auto;
      }}
    }}
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <h1>Vector Memory</h1>
      <div class="sub">Graphify knowledge graph exported into a vector-friendly preview. Search by label, file, or community and inspect the stored vector coordinates.</div>
      <div class="stats">
        <div class="stat"><span class="label">Rows</span><b id="statRows">0</b></div>
        <div class="stat"><span class="label">Dimensions</span><b>{dimensions}</b></div>
        <div class="stat"><span class="label">Mode</span><b style="font-size:14px">Hashed Preview</b></div>
      </div>
      <input id="search" class="search" type="search" placeholder="Search label, file, community..." />
      <div id="list" class="list"></div>
    </aside>
    <main class="content">
      <div class="panel">
        <div id="details" class="empty">Select a vector row from the left to inspect it.</div>
      </div>
    </main>
  </div>
  <script>
    const rows = {data_json};
    const listEl = document.getElementById("list");
    const detailsEl = document.getElementById("details");
    const searchEl = document.getElementById("search");
    const statRowsEl = document.getElementById("statRows");
    let activeId = null;

    statRowsEl.textContent = String(rows.length);

    function esc(value) {{
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }}

    function renderDetails(row) {{
      if (!row) {{
        detailsEl.className = "empty";
        detailsEl.textContent = "Select a vector row from the left to inspect it.";
        return;
      }}
      const metadata = row.metadata || {{}};
      const vectorCells = row.vector.map((value, index) => `
        <div class="vec">
          <div class="dim">d${{index}}</div>
          <div class="val">${{Number(value).toFixed(6)}}</div>
        </div>
      `).join("");
      detailsEl.className = "";
      detailsEl.innerHTML = `
        <h1 style="margin-bottom:10px">${{esc(metadata.label || row.id)}}</h1>
        <div>
          <span class="pill">id: ${{esc(row.id)}}</span>
          <span class="pill">type: ${{esc(metadata.file_type || "unknown")}}</span>
          <span class="pill">community: ${{esc(metadata.community ?? "n/a")}}</span>
          <span class="pill">degree: ${{esc(metadata.degree ?? 0)}}</span>
          <span class="pill">neighbors: ${{esc(metadata.neighbor_count ?? 0)}}</span>
        </div>
        <div class="section">
          <h2>Source</h2>
          <pre>${{esc(metadata.source_file || "")}}
${{esc(metadata.source_location || "")}}</pre>
        </div>
        <div class="section">
          <h2>Vector</h2>
          <div class="vector-grid">${{vectorCells}}</div>
        </div>
      `;
    }}

    function renderList(filteredRows) {{
      listEl.innerHTML = "";
      for (const row of filteredRows) {{
        const metadata = row.metadata || {{}};
        const item = document.createElement("button");
        item.type = "button";
        item.className = "item" + (row.id === activeId ? " active" : "");
        item.innerHTML = `
          <h3>${{esc(metadata.label || row.id)}}</h3>
          <div class="meta">
            <span>${{esc(metadata.file_type || "unknown")}}</span>
            <span>community ${{esc(metadata.community ?? "n/a")}}</span>
            <span>degree ${{esc(metadata.degree ?? 0)}}</span>
          </div>
        `;
        item.addEventListener("click", () => {{
          activeId = row.id;
          renderList(filteredRows);
          renderDetails(row);
        }});
        listEl.appendChild(item);
      }}
      if (filteredRows.length === 0) {{
        listEl.innerHTML = '<div class="empty">No rows match the current search.</div>';
        if (!activeId) {{
          renderDetails(null);
        }}
      }}
    }}

    function applySearch() {{
      const query = searchEl.value.trim().toLowerCase();
      const filtered = rows.filter((row) => {{
        const metadata = row.metadata || {{}};
        const haystack = [
          row.id,
          metadata.label,
          metadata.file_type,
          metadata.source_file,
          metadata.source_location,
          String(metadata.community ?? ""),
        ].join(" ").toLowerCase();
        return haystack.includes(query);
      }});
      if (activeId && !filtered.some((row) => row.id === activeId)) {{
        activeId = filtered[0]?.id ?? null;
      }}
      renderList(filtered);
      renderDetails(filtered.find((row) => row.id === activeId) ?? filtered[0] ?? null);
    }}

    activeId = rows[0]?.id ?? null;
    searchEl.addEventListener("input", applySearch);
    applySearch();
  </script>
</body>
</html>
"""
    out_path.write_text(html, encoding="utf-8")


def _build_neighbors(graph_data: dict[str, Any]) -> dict[str, list[dict[str, str]]]:
    nodes_by_id = {node["id"]: node for node in graph_data.get("nodes", [])}
    neighbor_map: dict[str, list[dict[str, str]]] = defaultdict(list)
    for link in graph_data.get("links", graph_data.get("edges", [])):
        source = str(link["source"])
        target = str(link["target"])
        relation = str(link.get("relation", "relates_to"))
        confidence = str(link.get("confidence", "EXTRACTED"))
        source_label = str(nodes_by_id.get(source, {}).get("label", source))
        target_label = str(nodes_by_id.get(target, {}).get("label", target))
        neighbor_map[source].append(
            {
                "direction": "out",
                "neighbor_id": target,
                "neighbor_label": target_label,
                "relation": relation,
                "confidence": confidence,
            }
        )
        neighbor_map[target].append(
            {
                "direction": "in",
                "neighbor_id": source,
                "neighbor_label": source_label,
                "relation": relation,
                "confidence": confidence,
            }
        )
    return neighbor_map


def _document_for_node(
    node: dict[str, Any],
    neighbors: list[dict[str, str]],
    neighbor_limit: int = DEFAULT_NEIGHBOR_LIMIT,
) -> dict[str, Any]:
    limited_neighbors = sorted(
        neighbors,
        key=lambda item: (item["direction"], item["neighbor_label"].lower()),
    )[:neighbor_limit]
    neighbor_lines = [
        f"- {item['direction']} {item['relation']} -> {item['neighbor_label']} [{item['confidence']}]"
        for item in limited_neighbors
    ]
    text_sections = [
        f"Node label: {node.get('label', node['id'])}",
        f"Node id: {node['id']}",
        f"File type: {node.get('file_type', 'unknown')}",
        f"Source file: {node.get('source_file', '')}",
        f"Source location: {node.get('source_location', '')}",
        f"Community: {node.get('community', 'unknown')}",
        f"Normalized label: {node.get('norm_label', '')}",
        f"Degree: {node.get('degree', 0)}",
        "Connections:",
    ]
    text_sections.extend(neighbor_lines if neighbor_lines else ["- No recorded neighbors"])
    metadata = {
        "label": node.get("label", node["id"]),
        "file_type": node.get("file_type", "unknown"),
        "source_file": node.get("source_file", ""),
        "source_location": node.get("source_location", ""),
        "community": node.get("community"),
        "degree": node.get("degree", 0),
        "neighbor_count": len(neighbors),
    }
    return {
        "id": node["id"],
        "text": "\n".join(section for section in text_sections if section is not None),
        "metadata": metadata,
    }


def export_vectors(
    graph_path: Path,
    out_dir: Path | None = None,
    *,
    dimensions: int = DEFAULT_VECTOR_DIMENSIONS,
) -> dict[str, Any]:
    out_dir = out_dir or graph_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    graph_data = _load_graph(graph_path)
    neighbor_map = _build_neighbors(graph_data)
    documents = [
        _document_for_node(node, neighbor_map.get(node["id"], []))
        for node in graph_data.get("nodes", [])
    ]

    documents_path = out_dir / "vector-documents.jsonl"
    preview_path = out_dir / "vector-preview.jsonl"
    manifest_path = out_dir / "vector-manifest.json"
    html_path = out_dir / "vector-preview.html"
    preview_rows: list[dict[str, Any]] = []

    with documents_path.open("w", encoding="utf-8") as documents_file, preview_path.open(
        "w", encoding="utf-8"
    ) as preview_file:
        for document in documents:
            documents_file.write(json.dumps(document, ensure_ascii=False) + "\n")
            preview = {
                "id": document["id"],
                "vector": hashed_vector(document["text"], dimensions),
                "metadata": document["metadata"],
            }
            preview_rows.append(preview)
            preview_file.write(json.dumps(preview, ensure_ascii=False) + "\n")

    _render_vector_html(preview_rows, html_path, dimensions)

    manifest = {
        "graph_path": str(graph_path.resolve()),
        "documents_path": str(documents_path.resolve()),
        "vector_preview_path": str(preview_path.resolve()),
        "vector_html_path": str(html_path.resolve()),
        "vector_dimensions": dimensions,
        "vector_mode": "hashed_bow_preview",
        "document_count": len(documents),
        "notes": [
            "graphifyy provides a knowledge graph, not a native embedding index.",
            "vector-preview.jsonl is a deterministic local preview layer for immediate vector inspection.",
            "vector-documents.jsonl is the clean export to feed into a real embedding pipeline later.",
        ],
    }
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return manifest


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Export graphify graph nodes into vector-friendly JSONL files.")
    parser.add_argument(
        "--graph",
        default="graphify-out/graph.json",
        help="Path to graphify graph.json",
    )
    parser.add_argument(
        "--out-dir",
        default="graphify-out",
        help="Directory for exported vector files",
    )
    parser.add_argument(
        "--dimensions",
        type=int,
        default=DEFAULT_VECTOR_DIMENSIONS,
        help="Deterministic preview vector dimensions",
    )
    args = parser.parse_args()

    manifest = export_vectors(
        graph_path=Path(args.graph),
        out_dir=Path(args.out_dir),
        dimensions=args.dimensions,
    )
    print(json.dumps(manifest, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
