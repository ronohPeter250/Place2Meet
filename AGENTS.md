## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- Vector-facing exports live in `graphify-out/vector-documents.jsonl`, `graphify-out/vector-preview.jsonl`, and `graphify-out/vector-manifest.json`
- After modifying code files in this session, run `./build-graphify-memory.ps1 .` to rebuild the graph and refresh the vector exports with the project-local graphify runtime
