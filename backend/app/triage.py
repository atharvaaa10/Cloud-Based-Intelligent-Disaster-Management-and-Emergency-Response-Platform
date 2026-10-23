"""
Deterministic, rule-based emergency incident triage scoring module.
Pure Python standard library implementation — shared across backend API,
Lambda triage consumer, and test suites. No external AI dependencies.
"""

import re
from typing import Any, Dict, List, Tuple

# ── Category Weights (0 to 35 points) ─────────────────────────
CATEGORY_WEIGHTS: Dict[str, int] = {
    "rescue": 35,
    "medical": 35,
    "food_water": 15,
    "shelter": 15,
    "other": 5,
}

# ── People Affected Scoring Tiers (5 to 40 points) ────────────
def calculate_people_score(people_count: int) -> Tuple[int, str]:
    """Computes points based on population scale."""
    if people_count is None or people_count <= 2:
        return 5, "1-2 people"
    elif people_count <= 5:
        return 15, "3-5 people"
    elif people_count <= 15:
        return 25, "6-15 people"
    elif people_count <= 50:
        return 35, "16-50 people"
    else:
        # Capped for large values to prevent unbounded integer growth
        return 40, "50+ people"


# ── Keyword Signals and Severity Weights ──────────────────────
# Critical life-threatening emergencies (15 points each)
CRITICAL_KEYWORDS: Dict[str, int] = {
    "trapped": 15,
    "drowning": 15,
    "unconscious": 15,
    "bleeding": 15,
    "collapse": 15,
    "collapsed": 15,
    "fire": 15,
    "electrocution": 15,
    "suffocating": 15,
    "crushed": 15,
    "explosion": 15,
    "cardiac": 15,
}

# High-vulnerability demographics (10 points each)
VULNERABILITY_KEYWORDS: Dict[str, int] = {
    "infant": 10,
    "child": 10,
    "children": 10,
    "baby": 10,
    "elderly": 10,
    "pregnant": 10,
    "disabled": 10,
    "oxygen": 10,
}

# Urgency and environmental hazard modifiers (5 points each)
URGENCY_KEYWORDS: Dict[str, int] = {
    "urgent": 5,
    "critical": 5,
    "severe": 5,
    "hazard": 5,
    "danger": 5,
    "rising water": 5,
    "hypothermia": 5,
    "smoke": 5,
    "gas leak": 5,
}

ALL_KEYWORDS: Dict[str, int] = {
    **CRITICAL_KEYWORDS,
    **VULNERABILITY_KEYWORDS,
    **URGENCY_KEYWORDS,
}

MAX_KEYWORD_SCORE = 45


def extract_keyword_signals(description: str | None) -> Tuple[int, List[str]]:
    """
    Extracts regex word-boundary keyword matches case-insensitively.
    Returns (total_keyword_score, matched_keywords_list).
    """
    if not description:
        return 0, []

    text = description.lower()
    matched: List[str] = []
    accumulated_score = 0

    for keyword, points in ALL_KEYWORDS.items():
        # Match word boundaries (or space for multi-word like 'rising water')
        pattern = r"\b" + re.escape(keyword) + r"\b"
        if re.search(pattern, text):
            matched.append(keyword)
            accumulated_score += points

    # Cap keyword score
    final_kw_score = min(accumulated_score, MAX_KEYWORD_SCORE)
    return final_kw_score, matched


def map_score_to_priority(total_score: int) -> str:
    """
    Priority Thresholds:
      - Critical: score >= 75
      - High:     50 <= score < 75
      - Medium:   25 <= score < 50
      - Low:      score < 25
    """
    if total_score >= 75:
        return "critical"
    elif total_score >= 50:
        return "high"
    elif total_score >= 25:
        return "medium"
    else:
        return "low"


def triage_incident(
    category: str,
    people_affected: int,
    description: str | None,
) -> Dict[str, Any]:
    """
    Pure triage calculation function.
    Returns:
      {
        "priority": "low" | "medium" | "high" | "critical",
        "score": int,
        "reason": str,
        "breakdown": {
            "category_score": int,
            "people_score": int,
            "keyword_score": int,
            "matched_keywords": list[str]
        }
      }
    """
    cat_key = (category or "").lower().strip()
    cat_score = CATEGORY_WEIGHTS.get(cat_key, CATEGORY_WEIGHTS["other"])

    people_score, people_tier = calculate_people_score(people_affected)
    kw_score, matched_kw = extract_keyword_signals(description)

    total_score = cat_score + people_score + kw_score
    priority = map_score_to_priority(total_score)

    # Build human-readable reason string
    kw_summary = f", signals: {', '.join(matched_kw)}" if matched_kw else ""
    reason = (
        f"Score {total_score} ({priority.upper()}): "
        f"Category '{cat_key}' (+{cat_score}), "
        f"{people_tier} (+{people_score})"
        f"{kw_summary} (+{kw_score} kw)"
    )

    return {
        "priority": priority,
        "score": total_score,
        "reason": reason,
        "breakdown": {
            "category_score": cat_score,
            "people_score": people_score,
            "keyword_score": kw_score,
            "matched_keywords": matched_kw,
        },
    }
