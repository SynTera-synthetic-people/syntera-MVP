// ══════════════════════════════════════════════════════════════════════════════
// Persona Builder - Data Configuration (TypeScript)
// Aligned with Figma design specifications
// ══════════════════════════════════════════════════════════════════════════════

import type { MainCategory } from './PersonaBuilderType';

// ── Attribute Options ─────────────────────────────────────────────────────────

export const optionData: Record<string, string[]> = {
  // ═══ Demographics ═══
  "Age": ["18 - 25", "26 - 34", "34 - 44", "45 - 54", "55 - 64"],
  
  "Gender": ["Male", "Female", "Non-binary"],
  
  "Income": [
    "< $10,000",
    "$10,000 - $24,999",
    "$25,000 - $49,999",
    "$50,000 - $74,999",
    "$75,000 - $99,999",
    "$100,000 - $149,999",
    "$150,000 - $199,999",
    ">$200,000"
  ],
  
  "Education Level": [
    "High School or below",
    "Some College",
    "Bachelor's Degree",
    "Master's Degree",
    "Doctoral/Professional Degree"
  ],
  
  "Occupation Level": [
    "Student",
    "Salaried",
    "Entrepreneur",
    "Homemaker",
    "Retired",
    "Freelancer",
    "Unemployed"
  ],
  
  "Marital Status": [
    "Single/Never Married",
    "In a relationship",
    "Married",
    "Separated/Divorced",
    "Widowed"
  ],
  
  "Family Structure": [
    "Single (Lives Alone)",
    "Couple (No Children)",
    "Couple (With Children)",
    "Joint Family",
    "Extended Family",
    "Extended family household"
  ],
  
  "Geography": ["India", "Gujarat", "Dahod"],

  // ═══ Additional Information ═══
  "Occupation": [
    "Student",
    "Salaried",
    "Entrepreneur",
    "Homemaker",
    "Retired",
    "Freelancer",
    "Unemployed"
  ],
  
  "Industry": [
    "Technology",
    "Finance",
    "Professional Services",
    "Healthcare",
    "Retail",
    "Manufacturing",
    "Media",
    "Education",
    "Government",
    "Hospitality"
  ],
  
  "Category Awareness": [
    "Unaware",
    "Exploring",
    "Active explorer",
    "Knowledgeable",
    "Expert"
  ],

  // ═══ Phycological (note: spelling from Figma) ═══
  "Lifestyle": [
    "Health-Focused (Fitness, Wellness)",
    "Family-Oriented (Home, Relationships)",
    "Career-Driven (Growth, Ambition)",
    "Status-Seeking (Luxury, Premium)",
    "Adventure-Seeking (Risk, Exploration)",
    "Traditional (Conservative, Stable)",
    "Tech-Savvy (Digital, Early Adopter)"
  ],
  
  "Values": [
    "Achievement-Oriented (Success, Goals)",
    "Security-Focused (Stability, Safety)",
    "Independence-Seeking (Freedom, Control)",
    "Altruistic (Helping, Giving)",
    "Tradition-Oriented (Culture, Religion)",
    "Innovation-Oriented (Change, Experimentation)",
    "Recognition-Seeking (Status, Validation)",
    "Equality-Focused (Fairness, Inclusion)",
    "Eco-Conscious (Sustainability, Climate)"
  ],
  
  "Personality": [
    "Open (Curious, Explorative)",
    "Conscientious (Organized, Reliable)",
    "Extroverted (Social, Outgoing)",
    "Agreeable (Cooperative, Kind)",
    "Sensitive (Reflective, Emotional)"
  ],
  
  "Interest": [
    "Fitness (Sports, Wellness)",
    "Travel (Exploration, Trips)",
    "Culture (Arts, Events)",
    "Tech (Gadgets, Innovation)",
    "Fashion (Style, Beauty)",
    "Food (Cooking, Dining)",
    "Money (Investing, Finance)",
    "Entertainment (Music, Movies)",
    "Gaming (Casual, Competitive)",
    "Social Impact (Causes, Volunteering)",
    "Family (Parenting, Activities)"
  ],
  
  "Motivation": [
    "Achievement-Driven (Success, Growth)",
    "Belonging-Driven (Community, Acceptance)",
    "Self-Expressive (Creativity, Identity)",
    "Efficiency-Focused (Speed, Convenience)",
    "Impact-Driven (Purpose, Learning)",
    "Experience-Seeking (Fun, Lifestyle)",
    "Power-Driven (Control, Influence)"
  ],

  // ═══ Behavioural ═══
  "Decision Making Style": [
    "Analytical (Data, Research)",
    "Emotional (Intuition, Feeling)",
    "Peer-Influenced (Reviews, Peers)",
    "Expert-Influenced (Expert, Reviews)",
    "Brand-Led (Trust, Reputation)",
    "Emotion-Driven (Instinct, Attitude, Instant)"
  ],
  
  "Consumption Frequency": [
    "Daily (Routine)",
    "Weekly (Regular)",
    "Frequent (Weekly, Regular)",
    "Occasional (Monthly, Frequent)",
    "Rare (Few Times Yearly)",
    "One-Time (As Needed)"
  ],
  
  "Purchase Channel": [
    "Online (Pure E-commerce)",
    "Omni-channel (Hybrid, Mix)",
    "Online (Marketplaces)",
    "Omni-channel (Store to Research)",
    "Offline"
  ],
  
  "Price Sensitivity": [
    "Highly Sensitive (Lower Price)",
    "Price-Conscious (Value for Money)",
    "Balanced (Price-Quality Mix)",
    "Price-Insensitive (Premium, No Constraint)",
    "Low Sensitivity (Quality First)"
  ],
  
  "Brand Sensitivity": [
    "Brand-loyal (Prefer known brands)",
    "Brand-Agnostic (Don't care much brands)",
    "Brand-loyal (Trust, consistency)",
    "Brand-Influenced (Aspirational)"
  ],
  
  "Switching Behaviour": [
    "Habitual (Stick to known)",
    "Reluctant (Rarely Switches)",
    "Considered (Switches but Effort)",
    "Exploratory (Tries New Options)",
    "Variety-Seeking (Switches Often)"
  ],
  
  "Purchase Triggers": [
    "Necessity (Driven by Routine)",
    "Need (Replacement, Utility)",
    "Recommendation (Friends, Reviews)",
    "Hard (Replacement, (Effort, Daily Life))",
    "Availability (Stock, Access)"
  ],
  
  "Purchase Barriers": [
    "High Cost (Unaffordable, Expensive)",
    "Quality Concern (Durability, Performance)",
    "Limited Information (Details, Clarity)",
    "Delivery Issues (Time, Availability)",
    "Return Concerns (Policy, Hassle)",
    "Limited Availability (Stock, Access)"
  ],
  
  "Media Consumption Patterns": [
    "Social Media (Instagram, Facebook)",
    "Video Content (YouTube, OTT)",
    "Television (TV, Broadcast)",
    "Streaming Audio (Music, Podcasts)",
    "Print Media (Newspaper, Magazines)"
  ],
  
  "Digital Behaviour": [
    "Always Online (High Engagement)",
    "Frequently Online (Regular Use)",
    "Occasionally Online (2-6 Hrs)",
    "Rarely Online (Specific Uses)",
    "Digitally Challenged"
  ]
};

// ── Multi-Select Attributes ───────────────────────────────────────────────────
// Attributes that allow multiple selections

export const multiSelectAttributes: string[] = [
  "Lifestyle",
  "Values", 
  "Personality",
  "Interest",
  "Motivation"
];

// ── Content Data (Category Structure) ─────────────────────────────────────────

export interface CategoryContent {
  items: string[];
  tooltip: string;
}

export const contentData: Record<string, CategoryContent> = {
  "Demographics": {
    items: [
      "Age",
      "Gender", 
      "Income",
      "Education Level",
      "Occupation Level",
      "Marital Status",
      "Family Structure",
      "Geography"
    ],
    tooltip: "Traits that define this persona's identity"
  },
  
  "Phycological": {
    items: [
      "Lifestyle",
      "Values",
      "Personality",
      "Interest",
      "Motivation"
    ],
    tooltip: "What drives their thinking and decisions"
  },
  
  "Behavioural": {
    items: [
      "Decision Making Style",
      "Consumption Frequency",
      "Purchase Channel",
      "Price Sensitivity",
      "Brand Sensitivity",
      "Switching Behaviour",
      "Purchase Triggers",
      "Purchase Barriers",
      "Media Consumption Patterns",
      "Digital Behaviour"
    ],
    tooltip: "How they act and operate"
  },
  
  "Additional Information": {
    items: [
      "Occupation",
      "Industry",
      "Category Awareness"
    ],
    tooltip: "Additional context about this persona"
  },
  
  "Formative Experience": {
    items: [],
    tooltip: "Backstories and scenarios - moments that shape how this persona thinks, decides, and behaves"
  }
};

// ── Attribute Tooltips ────────────────────────────────────────────────────────

export const attributeTooltips: Record<string, string> = {
  // Demographics
  "Age": "Choose the age band that best reflects this persona's life stage",
  "Gender": "Choose how this persona identifies themself",
  "Income": "Set an approximate income band to reflect this persona's spending power and price sensitivity",
  "Education Level": "Capture the highest education level reached—this often shapes knowledge, attitudes, and media habits",
  "Occupation Level": "Define the persona's main job or role to ground their daily context and decision-making power",
  "Marital Status": "Current relationship or marital situation",
  "Family Structure": "Specify how many people live in their household to reflect shared budgets and responsibilities",
  "Geography": "Pinpoint where they live (city/region) so cultural context, access, and costs feel realistic",
  
  // Additional Information
  "Occupation": "Specific occupation type",
  "Industry": "Industry sector they work in",
  "Category Awareness": "Level of knowledge about the product category",
  
  // Phycological
  "Lifestyle": "Overall way of living and daily habits",
  "Values": "Core beliefs and principles guiding decisions",
  "Personality": "Character traits and behavioral tendencies",
  "Interest": "Areas of personal curiosity and engagement",
  "Motivation": "Driving forces and underlying reasons for actions",
  
  // Behavioural
  "Decision Making Style": "Dominant decision-making style and shopping behavior",
  "Consumption Frequency": "How often they typically consume or purchase",
  "Purchase Channel": "Preferred platforms and venues for making purchases",
  "Price Sensitivity": "Reaction to price changes and general value perception",
  "Brand Sensitivity": "Degree of loyalty and awareness towards specific brands",
  "Switching Behaviour": "Tendency to stay with or switch between brands",
  "Purchase Triggers": "Factors and events that prompt a purchase",
  "Purchase Barriers": "Obstacles that prevent or delay a purchase",
  "Media Consumption Patterns": "Preferred types and frequency of media engagement",
  "Digital Behaviour": "Specific online habits and digital platform usage"
};

// ── Trait Group Mapping ───────────────────────────────────────────────────────
// Maps UI category names to backend API group names

export const traitGroupMapping: Record<string, string> = {
  "Demographics": "demographics",
  "Phycological": "psychographic",
  "Behavioural": "behavioral",
  "Additional Information": "additional_information"
};

// ── Trait Name Mapping ────────────────────────────────────────────────────────
// Maps UI attribute names to backend API field names

export const traitNameMapping: Record<string, string> = {
  // Demographics
  "Age": "age_range",
  "Gender": "gender",
  "Income": "income_range",
  "Education Level": "education_level",
  "Occupation Level": "occupation",
  "Marital Status": "marital_status",
  "Family Structure": "family_size",
  "Geography": "geography",
  
  // Additional Information
  "Occupation": "occupation",
  "Industry": "industry",
  "Category Awareness": "category_awareness",
  
  // Phycological
  "Lifestyle": "lifestyle",
  "Values": "values",
  "Personality": "personality",
  "Interest": "interests",
  "Motivation": "motivations",
  
  // Behavioural
  "Decision Making Style": "decision_making_style",
  "Consumption Frequency": "purchase_frequency",
  "Purchase Channel": "purchase_channel",
  "Price Sensitivity": "price_sensitivity",
  "Brand Sensitivity": "brand_sensitivity",
  "Switching Behaviour": "loyalty_behavior",
  "Purchase Triggers": "purchase_triggers",
  "Purchase Barriers": "purchase_barriers",
  "Media Consumption Patterns": "media_consumption",
  "Digital Behaviour": "digital_behavior"
};

// ── Option Tooltips (Hover descriptions) ──────────────────────────────────────

export const optionTooltips: Record<string, Record<string, string>> = {
  "Lifestyle": {
    "Health-Focused (Fitness, Wellness)": "Focused on diet, exercise, wellness routines",
    "Family-Oriented (Home, Relationships)": "Prioritize family needs, collective decision-making, nurturing role",
    "Career-Driven (Growth, Ambition)": "Achievement-focused, time-constrained, willing to sacrifice leisure",
    "Status-Seeking (Luxury, Premium)": "Aspiration-led, brand-conscious, appearance-focused",
    "Adventure-Seeking (Risk, Exploration)": "Thrill-seekers, explorers, try new things",
    "Traditional (Conservative, Stable)": "Rooted in culture, cautious, respect for norms",
    "Tech-Savvy (Digital, Early Adopter)": "Embraces innovation, enjoys experimenting with tech"
  },
  
  "Values": {
    "Achievement-Oriented (Success, Goals)": "Ambitious, goal-driven, results-focused",
    "Security-Focused (Stability, Safety)": "Risk-averse, future planner, prefers predictability",
    "Independence-Seeking (Freedom, Control)": "Values autonomy, dislikes rigid systems, prefers flexibility",
    "Altruistic (Helping, Giving)": "Caring, community-driven, empathetic",
    "Tradition-Oriented (Culture, Religion)": "Respectful of customs, faith-oriented, collectivist",
    "Innovation-Oriented (Change, Experimentation)": "Curious, experimental, embraces new tech/ideas",
    "Recognition-Seeking (Status, Validation)": "Prestige-seeking, brand-conscious, image-driven",
    "Equality-Focused (Fairness, Inclusion)": "Justice-driven, fairness-oriented, progressive",
    "Eco-Conscious (Sustainability, Climate)": "Conscious about sustainability, eco-friendly lifestyle"
  },
  
  "Personality": {
    "Open (Curious, Explorative)": "Imaginative, open to new experiences, adaptable",
    "Conscientious (Organized, Reliable)": "Detail-oriented, disciplined, reliable",
    "Extroverted (Social, Outgoing)": "Energetic, talkative, assertive",
    "Agreeable (Cooperative, Kind)": "Empathetic, collaborative, friendly",
    "Sensitive (Reflective, Emotional)": "Sensitive, self-aware, reactive to stress"
  },
  
  "Interest": {
    "Fitness (Sports, Wellness)": "Active, competitive, health-conscious",
    "Travel (Exploration, Trips)": "Curious, exploratory, thrill-seeking",
    "Culture (Arts, Events)": "Creative, expressive, heritage-oriented",
    "Tech (Gadgets, Innovation)": "Innovative, tech-savvy, experimental",
    "Fashion (Style, Beauty)": "Style-conscious, trend-following, self-expressive",
    "Food (Cooking, Dining)": "Experimental, family-oriented, sensory-driven",
    "Money (Investing, Finance)": "Analytical, risk-aware, future-focused",
    "Entertainment (Music, Movies)": "Expressive, fun-seeking, socially connected",
    "Gaming (Casual, Competitive)": "Competitive, immersive, tech-oriented",
    "Social Impact (Causes, Volunteering)": "Compassionate, justice-driven, community-oriented",
    "Family (Parenting, Activities)": "Nurturing, responsibility-driven, family-first"
  },
  
  "Motivation": {
    "Achievement-Driven (Success, Growth)": "Ambitious, results-oriented, competitive",
    "Belonging-Driven (Community, Acceptance)": "Relationship-focused, collaborative, people-centric",
    "Self-Expressive (Creativity, Identity)": "Independent, expressive, authentic",
    "Efficiency-Focused (Speed, Convenience)": "Time-conscious, optimization-driven",
    "Impact-Driven (Purpose, Learning)": "Purpose-driven, socially conscious, visionary",
    "Experience-Seeking (Fun, Lifestyle)": "Playful, adventurous, hedonistic",
    "Power-Driven (Control, Influence)": "Assertive, persuasive, ambitious"
  },
  
  "Decision Making Style": {
    "Analytical (Data, Research)": "Compare options, analyze features, look at reviews before buying",
    "Emotional (Intuition, Feeling)": "Driven by feelings, aesthetics, identity alignment",
    "Peer-Influenced (Reviews, Peers)": "Decisions shaped by family, friends, community",
    "Expert-Influenced (Expert, Reviews)": "Rely on authority, expert reviews, professional endorsements",
    "Brand-Led (Trust, Reputation)": "Reliability and trust on brand positioning",
    "Emotion-Driven (Instinct, Attitude, Instant)": "Spontaneous, emotional, quick decision-making"
  },
  
  "Purchase Channel": {
    "Online (Pure E-commerce)": "Digital-first shoppers, convenience-focused",
    "Omni-channel (Hybrid, Mix)": "Mix of online research and offline purchase",
    "Online (Marketplaces)": "Amazon, Flipkart, etc. - variety seekers, deal hunters",
    "Omni-channel (Store to Research)": "Browse in store, buy online or vice versa",
    "Offline": "Traditional retail, in-person shopping preference"
  },
  
  "Price Sensitivity": {
    "Highly Sensitive (Lower Price)": "Always looking for discounts, deals, promotions",
    "Price-Conscious (Value for Money)": "Want best quality at acceptable price",
    "Balanced (Price-Quality Mix)": "Balance between price and quality",
    "Price-Insensitive (Premium, No Constraint)": "Believe higher price = higher quality",
    "Low Sensitivity (Quality First)": "Quality over price, willing to pay premium"
  }
};

// ── Helper Function: Get Category Items ───────────────────────────────────────

export const getCategoryItems = (category: string): string[] => {
  return contentData[category]?.items || [];
};

// ── Helper Function: Get Attribute Options ────────────────────────────────────

export const getAttributeOptions = (attributeName: string): string[] => {
  return optionData[attributeName] || [];
};

// ── Helper Function: Check if Multi-Select ────────────────────────────────────

export const isMultiSelectAttribute = (attributeName: string): boolean => {
  return multiSelectAttributes.includes(attributeName);
};

// ── Main Categories (for Tab Navigation) ──────────────────────────────────────

export const mainCategories: MainCategory[] = [
  'Demographics',
  'Phycological',
  'Behavioural',
  'Additional Information',
  'Formative Experience'
];