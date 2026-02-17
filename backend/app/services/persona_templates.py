from typing import List, Optional

TEMPLATES = [
    {
        "id": 1,
        "name": "Urban FMCG Shopper",
        "age_range": "26-35",
        "gender": "Any",
        "location_country": "India",
        "location_state": "Karnataka",
        "education_level": "Graduate",
        "occupation": "Working Professional",
        "income_range": "3-6Lpa",
        "family_size": "3-5",
        "geography": "Urban",

        "lifestyle": "Fitness-focused, Time-conscious",
        "values": "Convenience, Family well-being, Reliability",
        "personality": "Practical, Goal-driven",
        "interests": "Quick meals, Home care, Grocery deals",
        "motivations": "Value for money, Convenience, Health-conscious choices",

        "brand_sensitivity": "Prefers known brands",
        "price_sensitivity": "High",

        "mobility": "Public transport + occasional ride-share",
        "accommodation": "Renting in metro city",
        "marital_status": "Single",
        "daily_rhythm": "Fast-paced, long commute",

        "hobbies": "Cooking, Fitness, Travel, Streaming content",
        "professional_traits": "Organized, Team player, Work-life conscious, Detail-oriented",

        "digital_activity": "Instagram, YouTube, Swiggy, Amazon (Mobile-first, Moderate to high usage)",
        "preferences": "Online grocery shopping, Quick delivery apps, Amazon, BigBasket, Short videos, How-to guides",

        # "sample_size": 50,
    },

    {
        "id": 2,
        "name": "EdTech Skill Seeker",
        "age_range": "18-25",
        "gender": "Any",
        "location_country": "India",
        "location_state": "Tamil Nadu",
        "education_level": "Undergraduate",
        "occupation": "Student / Entry-level",
        "income_range": "<3Lpa",
        "family_size": "4",
        "geography": "Urban",

        "lifestyle": "Tech-savvy, Growth-oriented",
        "values": "Career advancement, Learning, Achievement",
        "personality": "Curious, Ambitious",
        "interests": "Coding, Online courses, Certifications",
        "motivations": "Career growth, Skill mastery",

        "brand_sensitivity": "EdTech influencers, Mentor recommendations",
        "price_sensitivity": "Medium",

        "mobility": "City travel",
        "accommodation": "Hostel / PG",
        "marital_status": "Single",
        "daily_rhythm": "Study-work balance",

        "hobbies": "Gaming, Watching tutorials, Online challenges",
        "professional_traits": "Fast learner, Adaptable, Self-driven",

        "digital_activity": "LinkedIn, Udemy, Coursera, YouTube (Laptop+Mobile, High usage)",
        "preferences": "Discounted courses, Subscriptions, Coursera, Udemy, Google Courses, Career advice",

        # "sample_size": 40,
    },

    {
        "id": 3,
        "name": "FinTech Power User",
        "age_range": "26-40",
        "gender": "Any",
        "location_country": "India",
        "location_state": "Delhi",
        "education_level": "Postgraduate",
        "occupation": "Finance / Tech Professional",
        "income_range": "12-24Lpa",
        "family_size": "2-4",
        "geography": "Urban",

        "lifestyle": "Tech-driven, Minimalist",
        "values": "Security, Efficiency, Premium quality",
        "personality": "Analytical, Data-driven",
        "interests": "Investing, FinTech apps, Crypto",
        "motivations": "Convenience, Security",

        "brand_sensitivity": "Trust-based",
        "price_sensitivity": "Low",

        "mobility": "Car / Cab",
        "accommodation": "Modern apartment",
        "marital_status": "Married / Single",
        "daily_rhythm": "Structured, high workload",

        "hobbies": "Reading finance, Gym, Travel",
        "professional_traits": "Strategic, High attention to detail, Leadership",

        "digital_activity": "LinkedIn, X, Groww, CoinSwitch (Heavy usage, Mobile+Desktop)",
        "preferences": "Premium products, Apple, Zerodha, Amazon, Podcasts, Financial reports",

        # "sample_size": 30,
    }
]


def list_templates() -> List[dict]:
    return TEMPLATES


def get_template_by_id(template_id: int) -> Optional[dict]:
    for t in TEMPLATES:
        if t["id"] == template_id:
            return t
    return None
