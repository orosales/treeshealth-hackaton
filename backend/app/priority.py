from .models import Priority, VisionFindings


DISCLAIMER = (
    "This tool provides an AI-assisted visual screening only. It does not replace an "
    "assessment by a qualified arborist or municipal inspector."
)


def score_findings(f: VisionFindings) -> tuple[int, list[str]]:
    score, signs = 0, []
    def add(condition: bool, points: int, text: str) -> None:
        nonlocal score
        if condition:
            score += points
            signs.append(text)
    add(f.dead_branches, 2, "Visible dead or missing branches")
    add(f.broken_limbs, 3, "Visible broken limb")
    add(f.crown_loss or f.crown_condition == "poor", 2, "Crown deterioration or loss")
    add(f.trunk_damage, 2, "Visible trunk or bark damage")
    add(f.possible_cavity, 3, "Possible trunk cavity")
    add(f.leaning == "significant", 2, "Significant visible lean")
    add(f.leaning == "possible", 1, "Possible visible lean")
    add(f.fungal_growth == "visible", 2, "Visible possible fungal growth")
    add(f.fungal_growth == "possible", 1, "Possible fungal growth")
    add(f.base_or_root_damage, 2, "Visible base or root damage")
    return score, signs


def hrm_signals(fcode: str | None, wires: str | None) -> tuple[int, list[str]]:
    """Deterministic bonus from HRM's own asset record, independent of the AI vision score."""
    score, signs = 0, []
    if fcode == "LCDS":
        score += 10
        signs.append("HRM records already list this as a dead tree")
    if wires == "Y":
        score += 2
        signs.append("Located near overhead wires")
    return score, signs


def inspection_priority(score: int) -> Priority:
    if score >= 6:
        return Priority.HIGH
    if score >= 3:
        return Priority.MEDIUM
    return Priority.LOW


def recommendation(priority: Priority) -> str:
    if priority == Priority.HIGH:
        return "Multiple visible warning signs detected. Professional arborist or municipal inspection recommended."
    if priority == Priority.MEDIUM:
        return "Potential visible warning signs detected. Professional arborist inspection is recommended."
    return "No major visible warning signs were detected in the submitted imagery. Continue routine observation and seek professional advice if conditions change."

