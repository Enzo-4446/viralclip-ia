"""Security regression tests for the fail-closed commercial export gate."""
import ast
from pathlib import Path

SOURCE = Path(__file__).with_name("app.py").read_text(encoding="utf-8")

def test_all_legacy_export_routes_are_gated():
    tree = ast.parse(SOURCE)
    targets = {
        "/clips", "/clips/batch", "/clips/youtube",
        "/youtube/download", "/media/import", "/jobs/upload"
    }
    gate = next(node for node in tree.body
                if isinstance(node, ast.Assign)
                and any(isinstance(t, ast.Name) and t.id == "LEGACY_EXPORT_PATHS"
                        for t in node.targets))
    actual = set(ast.literal_eval(gate.value.args[0]))
    assert targets <= actual

def test_strict_mode_fails_closed_before_handler():
    assert 'COMMERCIAL_ENFORCEMENT == "strict" and path in LEGACY_EXPORT_PATHS' in SOURCE
    assert 'status_code=503' in SOURCE
    assert 'Nenhum crédito foi cobrado.' in SOURCE

def test_mode_is_validated():
    assert 'if COMMERCIAL_ENFORCEMENT not in ("off", "strict"):' in SOURCE
