"""
Rule-based scoring function for incident priority.
Calculates transparent, deterministic urgency scores and breakdowns without AI.
"""

from typing import Dict, Any, List

CRITICAL_KEYWORDS = [
    "child", "children", "baby", "infant", "kid", "kids",
    "trapped", "stuck", "buried", "collapse", "collapsed",
    "elderly", "senior", "old person", "old woman", "old man",
    "unconscious", "bleeding", "cardiac", "heart", "stroke",
    "drowning", "submerged", "fire", "smoke", "burn", "explosion",
    "suffocating", "oxygen", "amputation", "critical",
]

WARNING_KEYWORDS = [
    "flood", "flooded", "waterlogging", "rising water", "stranded",
    "injured", "wound", "fracture", "pain", "fever", "diabetic",
    "urgent", "danger", "hazard", "leaking", "gas", "electricity",
    "short circuit", "blocked", "overflow", "cut off",
]


def calculate_rule_based_priority(
    people_affected: int | None,
    category: str | None,
    description: str | None,
    address: str | None = None,
) -> Dict[str, Any]:
    """
    Computes a deterministic priority score (0-100) and breakdown based on:
    1. People affected (up to 35 pts)
    2. Category urgency (up to 35 pts)
    3. Severe keyword detection in description/address (up to 30 pts)
    """
    text = f"{description or ''} {address or ''}".lower()

    # 1. People Affected (0 - 35 points)
    count = people_affected if (people_affected is not None and people_affected >= 0) else 1
    if count >= 15:
        people_score = 35
    elif count >= 6:
        people_score = 25
    elif count >= 2:
        people_score = 15
    else:
        people_score = 5

    # 2. Category Urgency (0 - 35 points)
    cat_norm = (category or "").lower().strip()
    if cat_norm in ("rescue", "fire"):
        cat_score = 35
    elif cat_norm == "medical":
        cat_score = 30
    elif cat_norm in ("waterlogging", "flood"):
        cat_score = 25
    elif cat_norm in ("shelter", "food_water"):
        cat_score = 15
    else:
        cat_score = 10

    # 3. Keywords Severity (0 - 30 points)
    matched_critical = [kw for kw in CRITICAL_KEYWORDS if kw in text]
    matched_warning = [kw for kw in WARNING_KEYWORDS if kw in text and kw not in matched_critical]

    # Critical keyword: 10 pts each, Warning: 5 pts each (capped at 30)
    raw_kw_score = (len(matched_critical) * 10) + (len(matched_warning) * 5)
    kw_score = min(30, raw_kw_score)

    total_score = min(100, people_score + cat_score + kw_score)

    if total_score >= 70:
        suggested_priority = "critical"
    elif total_score >= 50:
        suggested_priority = "high"
    elif total_score >= 30:
        suggested_priority = "medium"
    else:
        suggested_priority = "low"

    all_matched = matched_critical + matched_warning

    explanation = (
        f"Rule-based score: {total_score}/100 "
        f"({cat_norm.replace('_', ' ').title() if cat_norm else 'General'}: {cat_score}pts, "
        f"{count} affected: {people_score}pts, "
        f"Keywords {all_matched[:4] if all_matched else 'none'}: {kw_score}pts)"
    )

    return {
        "suggested_priority": suggested_priority,
        "score": total_score,
        "max_score": 100,
        "breakdown": {
            "people_affected_score": people_score,
            "people_affected_count": count,
            "category_score": cat_score,
            "category": cat_norm,
            "keyword_score": kw_score,
            "matched_keywords": all_matched,
            "explanation": explanation,
        },
    }

