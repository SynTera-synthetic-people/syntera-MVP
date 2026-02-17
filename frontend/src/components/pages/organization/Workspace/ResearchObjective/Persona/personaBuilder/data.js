export const optionData = {
  "Age": ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"],
  "Gender": ["Male", "Female", "Non-binary", "Prefer not to say"],
  "Income Level": ["< 25,000/month (Low)", "25,000-50,000/month (Lower-Middle)", "50,000-75,000/month (Middle)", "75,000-1,00,000/month (Upper-Middle)", "1,00,000-2,00,000/month (High)", "> 2,00,000/month (Very High)"],
  "Education Level": ["High School or below", "Some College", "Bachelor’s Degree", "Master’s Degree", "Doctoral/Professional Degree"],
  "Occupation / Employment Type": ["Student", "Employed Full-time", "Employed Part-time", "Self-employed/Entrepreneur", "Homemaker", "Retired", "Unemployed/Job-seeking"],
  "Family Structure": ["Single, no dependents", "Single with dependents", "Married/Partnered, no children", "Married/Partnered with children (young)", "Married/Partnered with children (grown)", "Extended family household"],
  "Geography": ["Metro (Mumbai, Delhi, Bangalore, etc.)", "Tier 2 City (Pune, Jaipur, Chandigarh, etc.)", "Tier 3 City/Town", "Rural", "International (specify country)"],
  "Lifestyle": ["Health-conscious / Fitness-oriented", "Family-oriented", "Career-driven / Ambitious", "Luxury / Status-seeking", "Eco-friendly / Sustainability-driven", "Convenience-seeker", "Adventurous / Risk-taking", "Traditional / Conservative", "Tech-savvy / Early adopter"],
  "Values": ["Achievement / Success", "Security / Stability", "Independence / Freedom", "Altruism / Helping others", "Tradition / Religion / Culture", "Innovation / Openness to change", "Status / Recognition", "Equality / Fairness", "Environmental concern"],
  "Personality": ["Openness (Creative, Curious)", "Conscientiousness (Organized, Responsible)", "Extraversion (Outgoing, Sociable)", "Agreeableness (Cooperative, Compassionate)", "Neuroticism (Emotional, Anxious, Resilient)"],
  "Interests": ["Sports & Fitness", "Travel & Adventure", "Arts & Culture", "Technology & Gadgets", "Fashion & Beauty", "Food & Cooking", "Finance & Investing", "Music & Entertainment", "Gaming", "Social causes & Volunteering", "Parenting & Family activities"],
  "Motivations": ["Achievement (success, recognition, career growth)", "Belonging (social acceptance, relationships, community)", "Self-expression (creativity, freedom, individuality)", "Security (financial stability, safety, predictability)", "Enjoyment (fun, leisure, experiences)", "Influence (power, leadership, control)", "Impact (making a difference, leaving a legacy)", "Achievement", "Security", "Growth", "Social Connection"],
  "Decision Making Style": ["Impulse purchase", "Considered purchase", "Peer-Influenced Buyers", "Expert-Dependent Buyers", "Brand-Driven Buyers", "Emotional Buyers"],
  "Purchase Frequency": ["Daily user", "Weekly user", "Monthly user", "Occasional user", "One-time/Trial user", "Non-user (considering)"],
  "Purchase Channel": ["Online (Marketplaces)", "Offline Retail (Kirana / Mom-and-Pop)", "Modern Trade (Supermarkets / Hypermarkets)", "D2C (Brand-owned stores/websites)", "Subscription Model", "Informal Channel (Street vendors, flea markets)"],
  "Price Sensitivity": ["Bargain-seeker", "Value-for-money seekers", "Premium willing / Quality conscious", "Indifferent / Price Inelastic"],
  "Brand Sensitivity": ["Brand-loyal (prefer known brands)", "Brand-conscious (aware but flexible)", "Brand-agnostic (don’t care about brand)", "Anti-brand (prefer generic/local)"],
  "Price Sensitivity Profile": ["Premium buyer (quality over price)", "Value-conscious (balance quality & price)", "Budget-driven (price is primary factor)", "Deal-seeker (buys on discounts only)"],
  "Loyalty / Switching Behavior": ["Highly loyal (rarely switch)", "Moderately loyal (switch for better value)", "Promiscuous (frequently switch)", "First-time buyer"],
  "Purchase Triggers & Occasions": ["Need-based (problem-driven)", "Impulse (emotion-driven)", "Promotional (discount-driven)", "Seasonal/Event-based", "Social influence (recommendation)", "FOMO (fear of missing out)"],
  "Purchase Barriers": ["Price/Cost", "Time scarcity", "Information overload", "Fear of wrong choice", "Lack of trust", "Complexity/Learning curve", "Access/Availability"],
  "Decision-Making Style": ["Emotional (gut feeling)", "Rational (data-driven)", "Convenience-seeking (easiest option)", "Research-driven (extensive comparison)", "Social (influenced by others)", "Independent (self-reliant)"],
  "Media Consumption Patterns": ["Heavy social media user", "Moderate social media user", "Light/No social media", "TV viewer", "YouTube/streaming consumer", "Podcast listener", "News reader", "Blog/article reader"],
  "Digital Behavior": ["Heavy e-commerce user", "Occasional online shopper", "Prefer offline shopping", "Mobile-first", "Desktop-preferred", "Digitally savvy", "Digitally challenged"],
  "Purchase patterns": ["daily", "weekly", "monthly", "rarely"],
  "Purchase channel": ["online", "offline retail", "D2C", "Modern Trade", "Subscription model", "Informal channel"],
  "Price sensitivity": ["Bargain-seeker", "Value-for-money seekers", "Premium willing / Quality conscious", "Indifferent / Price Inelastic"],
  "Mobility": ["Car owner", "Public transport", "Bicycle", "Walks"],
  "Home Ownership": ["Rent", "Owned"],
  "Marital Status": ["Single/Never married", "In a relationship", "Married", "Separated/Divorced", "Widowed"],
  "Daily Rhythm": ["Early bird", "Night owl"],
  "Hobbies & Interests": ["Reading", "Gaming", "Hiking", "Cooking", "Gardening"],
  "Professional Traits": ["Leader", "Team Player", "Innovator", "Mentor"],
  "Digital Activity": ["High", "Medium", 'Low'],
  "Preferences": ["Online shopping", "In-store shopping", "Hybrid"],
};

export const multiSelectAttributes = ["Personality", "Values"];


// Update your data.js file or wherever contentData is defined
export const contentData = {
  "Demographics": {
    items: ["Age", "Gender", "Income Level", "Education Level", "Occupation / Employment Type", "Family Structure", "Geography"],
    tooltip: "Foundational profile of persona—who they are"
  },
  "Psychographic Traits": {
    items: ["Lifestyle", "Values", "Personality", "Interests", "Motivations"],
    tooltip: "Internal psychological characteristics and mindset"
  },
  "Behavioral Traits": {
    items: [
      "Decision Making Style", "Purchase Frequency", "Purchase Channel",
      "Price Sensitivity", "Brand Sensitivity", "Price Sensitivity Profile",
      "Loyalty / Switching Behavior", "Purchase Triggers & Occasions",
      "Purchase Barriers", "Decision-Making Style", "Media Consumption Patterns",
      "Digital Behavior"
    ],
    tooltip: "Observable actions and decision-making patterns"
  },
  "Lifestyle Traits": {
    items: ["Mobility", "Home Ownership", "Marital Status", "Daily Rhythm"],
    tooltip: "Day-to-day living patterns and life circumstances"
  },
  "Hobbies & Interests": {
    items: ["Hobbies & Interests"],
    tooltip: "Leisure activities and personal pursuits"
  },
  "Professional Traits": {
    items: ["Professional Traits"],
    tooltip: "Career-related characteristics and work behaviors"
  },
  "Digital Activity": {
    items: ["Digital Activity"],
    tooltip: "Online behavior and digital engagement patterns"
  },
  "Preferences": {
    items: ["Preferences"],
    tooltip: "Personal likes, dislikes, and choice patterns"
  },
};

// Add tooltips for individual attributes
export const attributeTooltips = {
  "Age": "Choose the age band that best reflects this persona’s life stage",
  "Gender": "Choose how this persona identifies themself",
  "Income Level": "Set an approximate income band to reflect this persona’s spending power and price sensitivity",
  "Education Level": "Capture the highest education level reached—this often shapes knowledge, attitudes, and media habits",
  "Occupation / Employment Type": "Define the persona’s main job or role to ground their daily context and decision-making power",
  "Family Structure": "Specify how many people live in their household to reflect shared budgets and responsibilities",
  "Geography": "Pinpoint where they live (city/region) so cultural context, access, and costs feel realistic",
  "Lifestyle": "Overall way of living and daily habits",
  "Values": "Core beliefs and principles guiding decisions",
  "Personality": "Character traits and behavioral tendencies",
  "Interests": "Areas of personal curiosity and engagement",
  "Motivations": "Driving forces and underlying reasons for actions",
  "Brand sensitivity": "Importance placed on brand names vs. generic products",
  "Price sensitivity": "Reaction to price changes and value perception",
  "Mobility": "Movement patterns and transportation preferences",
  "Home Ownership": "Living arrangements and housing situation",
  "Marital Status": "Current relationship or marital situation",
  "Daily Rhythm": "Typical daily schedule and time allocation",
  "Hobbies & Interests": "Leisure activities and personal passions",
  "Professional Traits": "Work-related skills and career attributes",
  "Digital Activity": "Online behavior and technology usage",
  "Preferences": "Specific likes, dislikes, and choices",
  "Decision Making Style": "Dominant decision-making style and shopping behavior",
  "Purchase Frequency": "How often the persona typically buys products in this category",
  "Purchase Channel": "Preferred platforms and venues for making purchases",
  "Price Sensitivity": "Reaction to price changes and general value perception",
  "Brand Sensitivity": "Degree of loyalty and awareness towards specific brands",
  "Price Sensitivity Profile": "Specific buyer profile based on price-quality balance",
  "Loyalty / Switching Behavior": "Tendency to stay with or switch between brands",
  "Purchase Triggers & Occasions": "Factors and events that prompt a purchase",
  "Purchase Barriers": "Obstacles that prevent or delay a purchase",
  "Decision-Making Style": "Psychological approach to making final choices",
  "Media Consumption Patterns": "Preferred types and frequency of media engagement",
  "Digital Behavior": "Specific online habits and digital platform usage"
};

export const traitGroupMapping = {
  "Demographics": "demographics",
  "Psychographic Traits": "psychographic",
  "Behavioral Traits": "behavioral",
  "Lifestyle Traits": "lifestyle",
  "Hobbies & Interests": "hobbies",
  "Professional Traits": "professional",
  "Digital Activity": "digital",
  "Preferences": "preferences"
};

export const traitNameMapping = {
  // Demographics
  "Age": "age",
  "Gender": "gender",
  "Income Level": "income",
  "Education Level": "education",
  "Occupation / Employment Type": "occupation",
  "Family Structure": "family_size",
  "Geography": "geography",

  // Psychographic Traits
  "Lifestyle": "lifestyle_type",
  "Values": "values",
  "Personality": "personality_type",
  "Interests": "interests",
  "Motivations": "motivations",

  // Behavioral Traits
  "Brand sensitivity": "brand_sensitivity",
  "Price sensitivity": "price_sensitivity",

  // Lifestyle Traits
  "Mobility": "mobility",
  "Home Ownership": "accommodation",
  "Marital Status": "marital_status",
  "Daily Rhythm": "daily_rhythm",

  // Hobbies & Interests
  "Hobbies & Interests": "hobbies",

  // Professional Traits
  "Professional Traits": "professional_traits",

  "Digital Activity": "digital_activity",

  // Preferences
  "Preferences": "preferences",

  "Decision Making Style": "decision_making_style_1",
  "Purchase Frequency": "purchase_frequency",
  "Purchase Channel": "purchase_channel_detailed",
  "Price Sensitivity": "price_sensitivity_general",
  "Brand Sensitivity": "brand_sensitivity_detailed",
  "Price Sensitivity Profile": "price_sensitivity_profile",
  "Loyalty / Switching Behavior": "loyalty_behavior",
  "Purchase Triggers & Occasions": "purchase_triggers",
  "Purchase Barriers": "purchase_barriers",
  "Decision-Making Style": "decision_making_style_2",
  "Media Consumption Patterns": "media_consumption",
  "Digital Behavior": "digital_behavior_detailed"
};

export const optionTooltips = {
  "Lifestyle": {
    "Health-conscious / Fitness-oriented": "Focused on diet, exercise, wellness routines.",
    "Family-oriented": "Prioritize family needs, collective decision-making, nurturing role.",
    "Career-driven / Ambitious": "Achievement-focused, time-constrained, willing to sacrifice leisure.",
    "Luxury / Status-seeking": "Aspiration-led, brand-conscious, appearance-focused.",
    "Eco-friendly / Sustainability-driven": "Conscious of environment, prefers ethical/sustainable brands.",
    "Convenience-seeker": "Time-poor, efficiency-driven, prioritizes ease",
    "Adventurous / Risk-taking": "Thrill-seekers, explorers, try new things.",
    "Traditional / Conservative": "Rooted in culture, cautious, respect for norms.",
    "Tech-savvy / Early adopter": "Embraces innovation, enjoys experimenting with tech."
  },
  "Values": {
    "Achievement / Success": "Ambitious, goal-driven, results-focused.",
    "Security / Stability": "Risk-averse, future planner, prefers predictability.",
    "Independence / Freedom": "Values autonomy, dislikes rigid systems, prefers flexibility.",
    "Altruism / Helping others": "Caring, community-driven, empathetic.",
    "Tradition / Religion / Culture": "Respectful of customs, faith-oriented, collectivist.",
    "Innovation / Openness to change": "Curious, experimental,embraces new tech/ideas",
    "Status / Recognition": "Prestige-seeking, brand-conscious, image-driven.",
    "Equality / Fairness": "Justice-driven, fairness-oriented, progressive.",
    "Environmental concern": "Conscious about sustainability, eco-friendly lifestyle.",
  },
  "Personality": {
    "Openness (Creative, Curious)": "Imaginative, open to new experiences, adaptable.",
    "Conscientiousness (Organized, Responsible)": "Detail-oriented, disciplined, reliable.",
    "Extraversion (Outgoing, Sociable)": "Energetic, talkative, assertive.",
    "Agreeableness (Cooperative, Compassionate)": "Empathetic, collaborative, friendly.",
    "Neuroticism (Emotional, Anxious, Resilient)": "Sensitive, self-aware, reactive to stress (can also build resilience)."
  },
  "Interests": {
    "Sports & Fitness": "Active, competitive, health-conscious.",
    "Travel & Adventure": "Curious, exploratory, thrill-seeking.",
    "Arts & Culture": "Creative, expressive, heritage-oriented.",
    "Technology & Gadgets": "Innovative, tech-savvy, experimental.",
    "Fashion & Beauty": "Style-conscious, trend-following, self-expressive.",
    "Food & Cooking": "Experimental, family-oriented, sensory-driven.",
    "Finance & Investing": "Analytical, risk-aware, future-focused.",
    "Music & Entertainment": "Expressive, fun-seeking, socially connected.",
    "Gaming": "Competitive, immersive, tech-oriented.",
    "Social causes & Volunteering": "Compassionate, justice-driven, community-oriented.",
    "Parenting & Family activities": "Nurturing, responsibility-driven, family-first."
  },
  "Motivations": {
    "Achievement (success, recognition, career growth)": "Ambitious, results-oriented, competitive.",
    "Belonging (social acceptance, relationships, community)": "Relationship-focused, collaborative, people-centric.",
    "Self-expression (creativity, freedom, individuality)": "Independent, expressive, authentic.",
    "Security (financial stability, safety, predictability)": "Risk-averse, cautious, stability-seeking.",
    "Enjoyment (fun, leisure, experiences)": "Playful, adventurous, hedonistic.",
    "Influence (power, leadership, control)": "Assertive, persuasive, ambitious.",
    "Impact (making a difference, leaving a legacy)": "Purpose-driven, socially conscious, visionary."
  },
  "BEHAVIORAL TRAITS": {
    "Impulse purchase": "Spontaneous, emotional, quick decision-making.",
    "Considered purchase": "Compare options, analyze features, look at reviews before buying.",
    "Peer-Influenced Buyers": "Decisions shaped by family, friends, community.",
    "Expert-Dependent Buyers": "Rely on authority, expert reviews, professional endorsements.",
    "Brand-Driven Buyers": "Reliability and trust on brand positioning.",
    "Emotional Buyers": "Driven by feelings, aesthetics, identity alignment."
  },
  "Purchase patterns": {
    "daily": "Habitual, routine-driven, necessity buyers.",
    "weekly": "Planned but regular buyers, budget-balancing.",
    "monthly": "Bulk buyers, planners, stable consumption.",
    "rarely": "Low engagement, high consideration, major investments."
  },
  "Purchase channel": {
    "online": "Marketplaces (Amazon, Flipkart, etc.), Price-sensitive, variety seekers, deal hunters.",
    "offline retail": "Kirana / General Trade, Trust-driven, convenience-focused, community-based relationships.",
    "Modern Trade": "Supermarkets / Hypermarkets, Value seekers, bulk buyers, promotion-driven.",
    "Subscription model": "Meal kits, SaaS, OTT, curated boxes. Predictable, routine-driven, convenience-focused.",
    "Informal channel": "Street Vendors / Flea Markets / Community Sales. Bargain hunters, spontaneous buyers",
    "D2C": "Brand-owned D2C websites or stores. Brand loyalists, quality-focused, direct engagement.",
  },
  "Price sensitivity": {
    "Bargain-seeker": "Always looking for discounts, deals, promotions.",
    "Value-for-money seekers": "Not just about the cheapest option — want best quality at acceptable price.",
    "Premium willing / Quality conscious": "Believe higher price = higher quality.",
    "Indifferent / Price Inelastic": "Do not care much about price at all."
  }
};