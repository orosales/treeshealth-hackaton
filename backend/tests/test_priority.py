from app.models import Priority, VisionFindings
from app.priority import inspection_priority, score_findings


def findings(**changes):
    values = {"confidence": 0.8, "summary": "Visible evidence reviewed."}
    values.update(changes)
    return VisionFindings(**values)


def test_high_priority_for_multiple_significant_visible_findings():
    score, signs = score_findings(findings(dead_branches=True, possible_cavity=True, crown_loss=True))
    assert score == 7
    assert inspection_priority(score) == Priority.HIGH
    assert "Possible trunk cavity" in signs


def test_medium_and_low_thresholds_are_deterministic():
    medium, _ = score_findings(findings(dead_branches=True, leaning="possible"))
    low, _ = score_findings(findings())
    assert inspection_priority(medium) == Priority.MEDIUM
    assert inspection_priority(low) == Priority.LOW
