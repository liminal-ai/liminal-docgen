#!/usr/bin/env python3
"""Lightweight repository structural analyzer for Story 3.

This script preserves the mixed-runtime boundary from the design: Node/TypeScript
invokes a Python subprocess and receives structured JSON back. The implementation
is intentionally scoped to the Story 3 contract and TypeScript-first repositories.
"""

from __future__ import annotations

import argparse
import ast
import fnmatch
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    from tree_sitter import Language, Parser
    import tree_sitter_javascript
    import tree_sitter_typescript
except ImportError:
    Language = None
    Parser = None
    tree_sitter_javascript = None
    tree_sitter_typescript = None

DEFAULT_EXCLUDE_PATTERNS = [
    "**/.git/**",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
]

LANGUAGE_BY_EXTENSION = {
    ".c": "c",
    ".cpp": "cpp",
    ".cs": "csharp",
    ".go": "go",
    ".java": "java",
    ".js": "javascript",
    ".jsx": "javascript",
    ".kt": "kotlin",
    ".php": "php",
    ".py": "python",
    ".rs": "rust",
    ".ts": "typescript",
    ".tsx": "typescript",
}

SUPPORTED_LANGUAGES = {"javascript", "python", "typescript"}

EXPORT_PATTERNS = [
    ("class", re.compile(r"^\s*export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)),
    ("function", re.compile(r"^\s*export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)),
    ("interface", re.compile(r"^\s*export\s+interface\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)),
    ("type_alias", re.compile(r"^\s*export\s+type\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)),
    ("enum", re.compile(r"^\s*export\s+enum\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)),
    ("constant", re.compile(r"^\s*export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)),
    ("variable", re.compile(r"^\s*export\s+(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)", re.MULTILINE)),
]

IMPORT_PATTERNS = [
    re.compile(r'^\s*import\s+.+?\s+from\s+["\'](.+?)["\']', re.MULTILINE),
    re.compile(r'^\s*import\s+["\'](.+?)["\']', re.MULTILINE),
    re.compile(r'^\s*export\s+.+?\s+from\s+["\'](.+?)["\']', re.MULTILINE),
]

TREE_SITTER_PARSERS: dict[str, Any | None] = {}


def main() -> int:
    args = parse_args()
    repo_path = Path(args.repo_path).resolve()

    if not repo_path.exists() or not repo_path.is_dir():
        raise SystemExit(f"Repository path does not exist or is not a directory: {repo_path}")

    file_records = collect_files(
        repo_path,
        args.include or [],
        args.exclude or [],
        args.file or None,
    )
    file_tree = build_file_tree(repo_path, file_records)
    analysis = analyze_files(repo_path, file_records)

    payload = {
        "functions": analysis["functions"],
        "relationships": analysis["relationships"],
        "file_tree": file_tree,
        "summary": {
            "files": analysis["files"],
            "files_analyzed": analysis["files_analyzed"],
            "languages_found": sorted(analysis["languages_found"]),
            "total_files": len(file_records),
            "unsupported_files": analysis["unsupported_files"],
        },
    }

    json.dump(payload, sys.stdout)
    sys.stdout.write("\n")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-path", required=True)
    parser.add_argument("--file", action="append")
    parser.add_argument("--include", action="append")
    parser.add_argument("--exclude", action="append")
    return parser.parse_args()


def collect_files(
    repo_path: Path,
    include_patterns: list[str],
    exclude_patterns: list[str],
    explicit_files: list[str] | None = None,
) -> list[dict[str, Any]]:
    patterns_to_exclude = [*DEFAULT_EXCLUDE_PATTERNS, *exclude_patterns]
    records: list[dict[str, Any]] = []

    candidate_paths = (
        [repo_path / relative_path for relative_path in explicit_files]
        if explicit_files
        else sorted(path for path in repo_path.rglob("*") if path.is_file())
    )

    for file_path in candidate_paths:
        if not file_path.is_file():
            continue

        relative_path = file_path.relative_to(repo_path).as_posix()

        if should_exclude(relative_path, patterns_to_exclude):
            continue

        if include_patterns and not should_include(relative_path, include_patterns):
            continue

        extension = file_path.suffix.lower()
        language = LANGUAGE_BY_EXTENSION.get(extension)
        supported = language in SUPPORTED_LANGUAGES if language else False
        records.append(
            {
                "extension": extension,
                "language": language,
                "lines_of_code": count_lines(file_path),
                "path": relative_path,
                "supported": supported,
                "type": "file",
            }
        )

    return records


def should_include(relative_path: str, include_patterns: list[str]) -> bool:
    return any(matches_pattern(relative_path, pattern) for pattern in include_patterns)


def should_exclude(relative_path: str, exclude_patterns: list[str]) -> bool:
    return any(matches_pattern(relative_path, pattern) for pattern in exclude_patterns)


def matches_pattern(relative_path: str, pattern: str) -> bool:
    normalized_path = relative_path.strip("./")
    return fnmatch.fnmatch(normalized_path, pattern) or fnmatch.fnmatch(
        Path(normalized_path).name, pattern
    )


def count_lines(file_path: Path) -> int:
    try:
        return len(file_path.read_text(encoding="utf-8").splitlines())
    except UnicodeDecodeError:
        return 0


def build_file_tree(repo_path: Path, file_records: list[dict[str, Any]]) -> dict[str, Any]:
    root: dict[str, Any] = {
        "children": [],
        "name": repo_path.name,
        "path": ".",
        "type": "directory",
    }
    directories: dict[str, dict[str, Any]] = {".": root}

    for record in file_records:
        parts = record["path"].split("/")
        parent_path = "."

        for part in parts[:-1]:
            current_path = part if parent_path == "." else f"{parent_path}/{part}"
            if current_path not in directories:
                node = {
                    "children": [],
                    "name": part,
                    "path": current_path,
                    "type": "directory",
                }
                directories[parent_path]["children"].append(node)
                directories[current_path] = node
            parent_path = current_path

        directories[parent_path]["children"].append(
            {
                "extension": record["extension"],
                "language": record["language"],
                "lines_of_code": record["lines_of_code"],
                "name": parts[-1],
                "path": record["path"],
                "type": "file",
            }
        )

    sort_tree(root)
    return root


def sort_tree(node: dict[str, Any]) -> None:
    children = node.get("children")
    if not children:
        return

    children.sort(key=lambda child: (child.get("type") != "directory", child["name"]))
    for child in children:
        sort_tree(child)


def analyze_files(repo_path: Path, file_records: list[dict[str, Any]]) -> dict[str, Any]:
    export_index: dict[str, list[str]] = {}
    exported_nodes_by_file: dict[str, list[dict[str, Any]]] = {}
    analyzed_files: list[dict[str, Any]] = []
    languages_found: set[str] = set()
    unsupported_files: list[dict[str, Any]] = []

    for record in file_records:
        language = record["language"]
        if language is None:
            continue

        if not record["supported"]:
            unsupported_files.append(
                {
                    "language": language,
                    "lines_of_code": record["lines_of_code"],
                    "path": record["path"],
                    "supported": False,
                }
            )
            continue

        file_path = repo_path / record["path"]
        source = file_path.read_text(encoding="utf-8")

        if language in {"typescript", "javascript"}:
            nodes = analyze_typescript_like_file(record["path"], source, language)
        elif language == "python":
            nodes = analyze_python_file(record["path"], source)
        else:
            nodes = []

        for node in nodes:
            export_index.setdefault(record["path"], []).append(node["id"])

        exported_nodes_by_file[record["path"]] = nodes
        analyzed_files.append(
            {
                "language": language,
                "lines_of_code": record["lines_of_code"],
                "path": record["path"],
                "supported": True,
            }
        )
        languages_found.add(language)

    all_nodes: list[dict[str, Any]] = []

    for record in analyzed_files:
        file_path = record["path"]
        language = record["language"]
        source = (repo_path / file_path).read_text(encoding="utf-8")
        imports = resolve_import_targets(repo_path, file_path, source, language)
        nodes = exported_nodes_by_file.get(file_path, [])

        depends_on = sorted(imports)
        for node in nodes:
            node["depends_on"] = depends_on
            all_nodes.append(node)

    return {
        "files": [*analyzed_files, *unsupported_files],
        "files_analyzed": len(analyzed_files),
        "functions": all_nodes,
        "languages_found": languages_found,
        "relationships": [],
        "unsupported_files": unsupported_files,
    }


def analyze_typescript_like_file(
    file_path: str,
    source: str,
    language: str,
) -> list[dict[str, Any]]:
    _parse_typescript_like_source(source, language)
    nodes: list[dict[str, Any]] = []

    for component_type, pattern in EXPORT_PATTERNS:
        for match in pattern.finditer(source):
            name = match.group(1)
            line_number = source.count("\n", 0, match.start()) + 1
            nodes.append(
                {
                    "component_type": component_type if not (component_type == "constant" and not name.isupper()) else "variable",
                    "depends_on": [],
                    "end_line": line_number,
                    "file_path": file_path,
                    "id": f"{file_path}:{name}",
                    "name": name,
                    "relative_path": file_path,
                    "start_line": line_number,
                }
            )

    nodes.sort(key=lambda node: (node["start_line"], node["name"]))
    return nodes


def analyze_python_file(file_path: str, source: str) -> list[dict[str, Any]]:
    nodes: list[dict[str, Any]] = []

    try:
        parsed = ast.parse(source)
    except SyntaxError:
        return nodes

    for node in parsed.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            nodes.append(
                {
                    "component_type": "function",
                    "depends_on": [],
                    "end_line": getattr(node, "end_lineno", node.lineno),
                    "file_path": file_path,
                    "id": f"{file_path}:{node.name}",
                    "name": node.name,
                    "relative_path": file_path,
                    "start_line": node.lineno,
                }
            )
        elif isinstance(node, ast.ClassDef):
            nodes.append(
                {
                    "component_type": "class",
                    "depends_on": [],
                    "end_line": getattr(node, "end_lineno", node.lineno),
                    "file_path": file_path,
                    "id": f"{file_path}:{node.name}",
                    "name": node.name,
                    "relative_path": file_path,
                    "start_line": node.lineno,
                }
            )

    nodes.sort(key=lambda node: (node["start_line"], node["name"]))
    return nodes


def resolve_import_targets(
    repo_path: Path,
    file_path: str,
    source: str,
    language: str,
) -> set[str]:
    if language not in {"javascript", "typescript"}:
        return set()

    current_directory = (repo_path / file_path).parent
    targets: set[str] = set()

    for pattern in IMPORT_PATTERNS:
        for match in pattern.finditer(source):
            import_path = match.group(1)
            if not import_path.startswith("."):
                continue

            target = resolve_relative_import(repo_path, current_directory, import_path)
            if target is not None:
                targets.add(target)

    return targets


def _parse_typescript_like_source(source: str, language: str) -> Any | None:
    parser = _get_tree_sitter_parser(language)

    if parser is None:
        return None

    try:
        return parser.parse(source.encode("utf-8"))
    except Exception:
        return None


def _get_tree_sitter_parser(language: str) -> Any | None:
    if language not in TREE_SITTER_PARSERS:
        TREE_SITTER_PARSERS[language] = _build_tree_sitter_parser(language)

    return TREE_SITTER_PARSERS[language]


def _build_tree_sitter_parser(language: str) -> Any | None:
    if Language is None or Parser is None:
        return None

    try:
        if language == "typescript" and tree_sitter_typescript is not None:
            language_capsule = tree_sitter_typescript.language_typescript()
        elif language == "javascript" and tree_sitter_javascript is not None:
            language_capsule = tree_sitter_javascript.language()
        else:
            return None

        parsed_language = Language(language_capsule)
        return Parser(parsed_language)
    except Exception:
        return None


def resolve_relative_import(
    repo_path: Path,
    current_directory: Path,
    import_path: str,
) -> str | None:
    base_candidate = (current_directory / import_path).resolve()
    candidates = [base_candidate]
    if base_candidate.suffix == "":
        candidates.extend(base_candidate.with_suffix(ext) for ext in [".ts", ".tsx", ".js", ".jsx", ".py"])
        candidates.extend(
            (base_candidate / "index").with_suffix(ext) for ext in [".ts", ".tsx", ".js", ".jsx", ".py"]
        )
    else:
        candidates.extend(
            base_candidate.with_suffix(ext)
            for ext in [".ts", ".tsx", ".js", ".jsx", ".py"]
        )
        stem_candidate = base_candidate.with_suffix("")
        candidates.extend(
            stem_candidate.with_suffix(ext)
            for ext in [".ts", ".tsx", ".js", ".jsx", ".py"]
        )

    for candidate in candidates:
        if candidate.exists() and candidate.is_file():
            try:
                return candidate.relative_to(repo_path).as_posix()
            except ValueError:
                return None

    return None


if __name__ == "__main__":
    raise SystemExit(main())
