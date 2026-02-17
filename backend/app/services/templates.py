from typing import List, Optional

TEMPLATES = [
    {
        "id": 1,
        # "name": "Market Validation",
        "description": (
            "Our research aims to understand the current market landscape, providing context "
            "around emerging customer needs and competitive offerings. We hypothesize that "
            "there is a growing demand for solutions in this space, particularly among digitally "
            "active consumers. The primary audience includes potential customers, early adopters, "
            "and market influencers who shape purchase decisions. The objective of this study is "
            "to validate whether a real market opportunity exists, assess willingness to pay, "
            "and identify barriers to adoption. This research will be conducted across major "
            "urban regions within the selected geoscope to ensure demographic representation. "
            "Other considerations include evaluating behavioral triggers, unmet needs, and any "
            "external factors that could influence market acceptance."
        )
    },
    {
        "id": 2,
        # "name": "Consumer Perception",
        "description": (
            "This study explores the broader context of how consumers currently perceive our brand "
            "and competing products within the category. Our hypothesis is that perception is heavily "
            "influenced by recent trends, social proof, and evolving expectations around usability "
            "and value. The audience for this research includes active customers, lapsed customers, "
            "and potential consumers within the targeted demographic group. The objective is to "
            "uncover the key perception drivers, emotional responses, and decision-making factors "
            "that influence brand preference. The research will be carried out across selected "
            "regions in our geoscope to capture cultural and behavioral differences. Other important "
            "elements include identifying negative perception triggers, awareness gaps, and brand "
            "associations that may require strategic improvement."
        )
    },
    {
        "id": 3,
        # "name": "Product Adoption",
        "description": (
            "This research outlines the context of our product’s current adoption performance, "
            "including user motivations, pain points, and feature gaps. We hypothesize that adoption "
            "is strongly affected by onboarding experience, price expectations, and trust factors. "
            "Our target audience consists of first-time users, trial users who dropped off, and "
            "long-term users who can provide insight into adoption patterns. The primary objective "
            "is to identify friction points in the adoption funnel, measure retention behavior, and "
            "understand what drives repeat usage. The study focuses on a specific geoscope that "
            "represents our highest potential growth regions. Additional considerations include "
            "competitive alternatives, switching behavior, and external influences that could affect "
            "overall product adoption."
        )
    }
]


def list_templates() -> List[dict]:
    return TEMPLATES


def get_template_by_id(template_id: int) -> Optional[dict]:
    return next((t for t in TEMPLATES if t["id"] == template_id), None)
