// ══════════════════════════════════════════════════════════════════════════════
// Persona Builder Manual Flow - Configuration & Data
// ══════════════════════════════════════════════════════════════════════════════

import type { AttributeOption, SubTab, MainCategory } from './PersonaBuilderType';

// ── Multi-Select Attributes ───────────────────────────────────────────────────

export const multiSelectAttributes = [
  'lifestyle',
  'values',
  'personality',
  'interests',
  'motivations',
];

// ── Main Categories ───────────────────────────────────────────────────────────

export const mainCategories: MainCategory[] = [
  'Demographics',
  'Psychological',
  'Behavioural',
  'Additional Information',
  'Formative Experience',
];

// ── Sub-Tab Configurations ────────────────────────────────────────────────────

export const subTabsByCategory: Record<MainCategory, SubTab[]> = {
  'Demographics': [
    { id: 'age', label: 'Age', attributeName: 'age' },
    { id: 'gender', label: 'Gender', attributeName: 'gender' },
    { id: 'income', label: 'Income', attributeName: 'income' },
    { id: 'educationLevel', label: 'Education Level', attributeName: 'educationLevel' },
    { id: 'occupationLevel', label: 'Occupation Level', attributeName: 'occupationLevel' },
    { id: 'maritalStatus', label: 'Marital Status', attributeName: 'maritalStatus' },
    { id: 'familyStructure', label: 'Family Structure', attributeName: 'familyStructure' },
    { id: 'geography', label: 'Geography', attributeName: 'geography' },
  ],
  'Psychological': [
    { id: 'lifestyle', label: 'Lifestyle', attributeName: 'lifestyle' },
    { id: 'values', label: 'Values', attributeName: 'values' },
    { id: 'personality', label: 'Personality', attributeName: 'personality' },
    { id: 'interests', label: 'Interest', attributeName: 'interests' },
    { id: 'motivations', label: 'Motivation', attributeName: 'motivations' },
  ],
  'Behavioural': [
    { id: 'decisionMakingStyle', label: 'Decision Making Style', attributeName: 'decisionMakingStyle' },
    { id: 'consumptionFrequency', label: 'Consumption Frequency', attributeName: 'consumptionFrequency' },
    { id: 'purchaseChannel', label: 'Purchase Channel', attributeName: 'purchaseChannel' },
    { id: 'priceSensitivity', label: 'Price Sensitivity', attributeName: 'priceSensitivity' },
    { id: 'brandSensitivity', label: 'Brand Sensitivity', attributeName: 'brandSensitivity' },
    { id: 'switchingBehaviour', label: 'Switching Behaviour', attributeName: 'switchingBehaviour' },
    { id: 'purchaseTriggers', label: 'Purchase Triggers', attributeName: 'purchaseTriggers' },
    { id: 'purchaseBarriers', label: 'Purchase Barriers', attributeName: 'purchaseBarriers' },
    { id: 'mediaConsumption', label: 'Media Consumption Patterns', attributeName: 'mediaConsumption' },
    { id: 'digitalBehaviour', label: 'Digital Behaviour', attributeName: 'digitalBehaviour' },
  ],
  'Additional Information': [
    { id: 'occupation', label: 'Occupation', attributeName: 'occupation' },
    { id: 'industry', label: 'Industry', attributeName: 'industry' },
    { id: 'categoryAwareness', label: 'Category Awareness', attributeName: 'categoryAwareness' },
  ],
  'Formative Experience': [],
};

// ── Attribute Options ─────────────────────────────────────────────────────────

export const attributeOptions: Record<string, AttributeOption[]> = {
  // Demographics
  age: [
    { label: '18 - 25', value: '18-25' },
    { label: '26 - 34', value: '26-34' },
    { label: '34 - 44', value: '34-44' },
    { label: '45 - 54', value: '45-54' },
    { label: '55 - 64', value: '55-64' },
  ],
  
  gender: [
    { label: 'Male', value: 'Male' },
    { label: 'Female', value: 'Female' },
    { label: 'Non-binary', value: 'Non-binary' },
  ],
  
  income: [
    { label: '< $10,000', value: '<$10,000' },
    { label: '$10,000 - $24,999', value: '$10,000-$24,999' },
    { label: '$25,000 - $49,999', value: '$25,000-$49,999' },
    { label: '$50,000 - $74,999', value: '$50,000-$74,999' },
    { label: '$75,000 - $99,999', value: '$75,000-$99,999' },
    { label: '$100,000 - $149,999', value: '$100,000-$149,999' },
    { label: '$150,000 - $199,999', value: '$150,000-$199,999' },
    { label: '>$200,000', value: '>$200,000' },
  ],
  
  educationLevel: [
    { label: 'High School or below', value: 'High School or below' },
    { label: 'Some College', value: 'Some College' },
    { label: "Bachelor's Degree", value: "Bachelor's Degree" },
    { label: "Master's Degree", value: "Master's Degree" },
    { label: 'Doctoral/Professional Degree', value: 'Doctoral/Professional Degree' },
  ],
  
  maritalStatus: [
    { label: 'Single/Never Married', value: 'Single/Never Married' },
    { label: 'In a relationship', value: 'In a relationship' },
    { label: 'Married', value: 'Married' },
    { label: 'Separated/Divorced', value: 'Separated/Divorced' },
    { label: 'Widowed', value: 'Widowed' },
  ],
  
  familyStructure: [
    { label: 'Single (Lives Alone)', value: 'Single (Lives Alone)' },
    { label: 'Couple (No Children)', value: 'Couple (No Children)' },
    { label: 'Couple (With Children)', value: 'Couple (With Children)' },
    { label: 'Joint Family', value: 'Joint Family' },
    { label: 'Extended Family', value: 'Extended Family' },
    { label: 'Extended family household', value: 'Extended family household' },
  ],
  
  geography: [
    { label: 'India', value: 'India' },
    { label: 'Gujarat', value: 'Gujarat' },
    { label: 'Dahod', value: 'Dahod' },
  ],
  
  // Additional Information
  occupation: [
    { label: 'Student', value: 'Student' },
    { label: 'Salaried', value: 'Salaried' },
    { label: 'Entrepreneur', value: 'Entrepreneur' },
    { label: 'Homemaker', value: 'Homemaker' },
    { label: 'Retired', value: 'Retired' },
    { label: 'Freelancer', value: 'Freelancer' },
    { label: 'Unemployed', value: 'Unemployed' },
  ],
  
  industry: [
    { label: 'Technology', value: 'Technology' },
    { label: 'Finance', value: 'Finance' },
    { label: 'Professional Services', value: 'Professional Services' },
    { label: 'Healthcare', value: 'Healthcare' },
    { label: 'Retail', value: 'Retail' },
    { label: 'Manufacturing', value: 'Manufacturing' },
    { label: 'Media', value: 'Media' },
    { label: 'Education', value: 'Education' },
    { label: 'Government', value: 'Government' },
    { label: 'Hospitality', value: 'Hospitality' },
  ],
  
  categoryAwareness: [
    { label: 'Unaware', value: 'Unaware' },
    { label: 'Exploring', value: 'Exploring' },
    { label: 'Active explorer', value: 'Active explorer' },
    { label: 'Knowledgeable', value: 'Knowledgeable' },
    { label: 'Expert', value: 'Expert' },
  ],
  
  // Psychological
  lifestyle: [
    { label: 'Health-Focused (Fitness, Wellness)', value: 'Health-Focused (Fitness, Wellness)' },
    { label: 'Family-Oriented (Home, Relationships)', value: 'Family-Oriented (Home, Relationships)' },
    { label: 'Career-Driven (Growth, Ambition)', value: 'Career-Driven (Growth, Ambition)' },
    { label: 'Status-Seeking (Luxury, Premium)', value: 'Status-Seeking (Luxury, Premium)' },
    { label: 'Adventure-Seeking (Risk, Exploration)', value: 'Adventure-Seeking (Risk, Exploration)' },
    { label: 'Traditional (Conservative, Stable)', value: 'Traditional (Conservative, Stable)' },
    { label: 'Tech-Savvy (Digital, Early Adopter)', value: 'Tech-Savvy (Digital, Early Adopter)' },
  ],
  
  values: [
    { label: 'Achievement-Oriented (Success, Goals)', value: 'Achievement-Oriented (Success, Goals)' },
    { label: 'Security-Focused (Stability, Safety)', value: 'Security-Focused (Stability, Safety)' },
    { label: 'Independence-Seeking (Freedom, Control)', value: 'Independence-Seeking (Freedom, Control)' },
    { label: 'Altruistic (Helping, Giving)', value: 'Altruistic (Helping, Giving)' },
    { label: 'Tradition-Oriented (Culture, Religion)', value: 'Tradition-Oriented (Culture, Religion)' },
    { label: 'Innovation-Oriented (Change, Experimentation)', value: 'Innovation-Oriented (Change, Experimentation)' },
    { label: 'Recognition-Seeking (Status, Validation)', value: 'Recognition-Seeking (Status, Validation)' },
    { label: 'Equality-Focused (Fairness, Inclusion)', value: 'Equality-Focused (Fairness, Inclusion)' },
    { label: 'Eco-Conscious (Sustainability, Climate)', value: 'Eco-Conscious (Sustainability, Climate)' },
  ],
  
  personality: [
    { label: 'Open (Curious, Explorative)', value: 'Open (Curious, Explorative)' },
    { label: 'Conscientious (Organized, Reliable)', value: 'Conscientious (Organized, Reliable)' },
    { label: 'Extroverted (Social, Outgoing)', value: 'Extroverted (Social, Outgoing)' },
    { label: 'Agreeable (Cooperative, Kind)', value: 'Agreeable (Cooperative, Kind)' },
    { label: 'Sensitive (Reflective, Emotional)', value: 'Sensitive (Reflective, Emotional)' },
  ],
  
  interests: [
    { label: 'Fitness (Sports, Wellness)', value: 'Fitness (Sports, Wellness)' },
    { label: 'Travel (Exploration, Trips)', value: 'Travel (Exploration, Trips)' },
    { label: 'Culture (Arts, Events)', value: 'Culture (Arts, Events)' },
    { label: 'Tech (Gadgets, Innovation)', value: 'Tech (Gadgets, Innovation)' },
    { label: 'Fashion (Style, Beauty)', value: 'Fashion (Style, Beauty)' },
    { label: 'Food (Cooking, Dining)', value: 'Food (Cooking, Dining)' },
    { label: 'Money (Investing, Finance)', value: 'Money (Investing, Finance)' },
    { label: 'Entertainment (Music, Movies)', value: 'Entertainment (Music, Movies)' },
    { label: 'Gaming (Casual, Competitive)', value: 'Gaming (Casual, Competitive)' },
    { label: 'Social Impact (Causes, Volunteering)', value: 'Social Impact (Causes, Volunteering)' },
    { label: 'Family (Parenting, Activities)', value: 'Family (Parenting, Activities)' },
  ],
  
  motivations: [
    { label: 'Achievement-Driven (Success, Growth)', value: 'Achievement-Driven (Success, Growth)' },
    { label: 'Belonging-Driven (Community, Acceptance)', value: 'Belonging-Driven (Community, Acceptance)' },
    { label: 'Self-Expressive (Creativity, Identity)', value: 'Self-Expressive (Creativity, Identity)' },
    { label: 'Efficiency-Focused (Speed, Convenience)', value: 'Efficiency-Focused (Speed, Convenience)' },
    { label: 'Impact-Driven (Purpose, Learning)', value: 'Impact-Driven (Purpose, Learning)' },
    { label: 'Experience-Seeking (Fun, Lifestyle)', value: 'Experience-Seeking (Fun, Lifestyle)' },
    { label: 'Power-Driven (Control, Influence)', value: 'Power-Driven (Control, Influence)' },
  ],
  
  // Behavioural
  decisionMakingStyle: [
    { label: 'Analytical (Data, Research)', value: 'Analytical (Data, Research)' },
    { label: 'Emotional (Intuition, Feeling)', value: 'Emotional (Intuition, Feeling)' },
    { label: 'Peer-Influenced (Reviews, Peers)', value: 'Peer-Influenced (Reviews, Peers)' },
    { label: 'Expert-Influenced (Expert, Reviews)', value: 'Expert-Influenced (Expert, Reviews)' },
    { label: 'Brand-Led (Trust, Reputation)', value: 'Brand-Led (Trust, Reputation)' },
    { label: 'Emotion-Driven (Instinct, Attitude, Instant)', value: 'Emotion-Driven (Instinct, Attitude, Instant)' },
  ],
  
  consumptionFrequency: [
    { label: 'Daily (Routine)', value: 'Daily (Routine)' },
    { label: 'Weekly (Regular)', value: 'Weekly (Regular)' },
    { label: 'Frequent (Weekly, Regular)', value: 'Frequent (Weekly, Regular)' },
    { label: 'Occasional (Monthly, Frequent)', value: 'Occasional (Monthly, Frequent)' },
    { label: 'Rare (Few Times Yearly)', value: 'Rare (Few Times Yearly)' },
    { label: 'One-Time (As Needed)', value: 'One-Time (As Needed)' },
  ],
  
  purchaseChannel: [
    { label: 'Online (Pure E-commerce)', value: 'Online (Pure E-commerce)' },
    { label: 'Omni-channel (Hybrid, Mix)', value: 'Omni-channel (Hybrid, Mix)' },
    { label: 'Online (Marketplaces)', value: 'Online (Marketplaces)' },
    { label: 'Omni-channel (Store to Research)', value: 'Omni-channel (Store to Research)' },
    { label: 'Offline', value: 'Offline' },
  ],
  
  priceSensitivity: [
    { label: 'Highly Sensitive (Lower Price)', value: 'Highly Sensitive (Lower Price)' },
    { label: 'Price-Conscious (Value for Money)', value: 'Price-Conscious (Value for Money)' },
    { label: 'Balanced (Price-Quality Mix)', value: 'Balanced (Price-Quality Mix)' },
    { label: 'Price-Insensitive (Premium, No Constraint)', value: 'Price-Insensitive (Premium, No Constraint)' },
    { label: 'Low Sensitivity (Quality First)', value: 'Low Sensitivity (Quality First)' },
  ],
  
  brandSensitivity: [
    { label: 'Brand-loyal (Prefer known brands)', value: 'Brand-loyal (Prefer known brands)' },
    { label: 'Brand-Agnostic (Don\'t care much brands)', value: 'Brand-Agnostic (Don\'t care much brands)' },
    { label: 'Brand-loyal (Trust, consistency)', value: 'Brand-loyal (Trust, consistency)' },
    { label: 'Brand-Influenced (Aspirational)', value: 'Brand-Influenced (Aspirational)' },
  ],
  
  switchingBehaviour: [
    { label: 'Habitual (Stick to known)', value: 'Habitual (Stick to known)' },
    { label: 'Reluctant (Rarely Switches)', value: 'Reluctant (Rarely Switches)' },
    { label: 'Considered (Switches but Effort)', value: 'Considered (Switches but Effort)' },
    { label: 'Exploratory (Tries New Options)', value: 'Exploratory (Tries New Options)' },
    { label: 'Variety-Seeking (Switches Often)', value: 'Variety-Seeking (Switches Often)' },
  ],
  
  purchaseTriggers: [
    { label: 'Necessity (Driven by Routine)', value: 'Necessity (Driven by Routine)' },
    { label: 'Need (Replacement, Utility)', value: 'Need (Replacement, Utility)' },
    { label: 'Recommendation (Friends, Reviews)', value: 'Recommendation (Friends, Reviews)' },
    { label: 'Hard (Replacement, (Effort, Daily Life))', value: 'Hard (Replacement, (Effort, Daily Life))' },
    { label: 'Availability (Stock, Access)', value: 'Availability (Stock, Access)' },
  ],
  
  purchaseBarriers: [
    { label: 'High Cost (Unaffordable, Expensive)', value: 'High Cost (Unaffordable, Expensive)' },
    { label: 'Quality Concern (Durability, Performance)', value: 'Quality Concern (Durability, Performance)' },
    { label: 'Limited Information (Details, Clarity)', value: 'Limited Information (Details, Clarity)' },
    { label: 'Delivery Issues (Time, Availability)', value: 'Delivery Issues (Time, Availability)' },
    { label: 'Return Concerns (Policy, Hassle)', value: 'Return Concerns (Policy, Hassle)' },
    { label: 'Limited Availability (Stock, Access)', value: 'Limited Availability (Stock, Access)' },
  ],
  
  mediaConsumption: [
    { label: 'Social Media (Instagram, Facebook)', value: 'Social Media (Instagram, Facebook)' },
    { label: 'Video Content (YouTube, OTT)', value: 'Video Content (YouTube, OTT)' },
    { label: 'Television (TV, Broadcast)', value: 'Television (TV, Broadcast)' },
    { label: 'Streaming Audio (Music, Podcasts)', value: 'Streaming Audio (Music, Podcasts)' },
    { label: 'Print Media (Newspaper, Magazines)', value: 'Print Media (Newspaper, Magazines)' },
  ],
  
  digitalBehaviour: [
    { label: 'Always Online (High Engagement)', value: 'Always Online (High Engagement)' },
    { label: 'Frequently Online (Regular Use)', value: 'Frequently Online (Regular Use)' },
    { label: 'Occasionally Online (2-6 Hrs)', value: 'Occasionally Online (2-6 Hrs)' },
    { label: 'Rarely Online (Specific Uses)', value: 'Rarely Online (Specific Uses)' },
    { label: 'Digitally Challenged', value: 'Digitally Challenged' },
  ],
};

// ── Category to Attribute Mapping ─────────────────────────────────────────────

export const categoryAttributeMapping: Record<MainCategory, string[]> = {
  'Demographics': [
    'age', 
    'gender', 
    'income', 
    'educationLevel', 
    'occupationLevel', 
    'maritalStatus', 
    'familyStructure', 
    'geography'
  ],
  'Psychological': [
    'lifestyle', 
    'values', 
    'personality', 
    'interests', 
    'motivations'
  ],
  'Behavioural': [
    'decisionMakingStyle',
    'consumptionFrequency',
    'purchaseChannel',
    'priceSensitivity',
    'brandSensitivity',
    'switchingBehaviour',
    'purchaseTriggers',
    'purchaseBarriers',
    'mediaConsumption',
    'digitalBehaviour',
  ],
  'Additional Information': [
    'occupation', 
    'industry', 
    'categoryAwareness'
  ],
  'Formative Experience': ['formativeExperience'],
};

// ── Display Names ─────────────────────────────────────────────────────────────

export const attributeDisplayNames: Record<string, string> = {
  age: 'Age',
  gender: 'Gender',
  income: 'Income',
  educationLevel: 'Education Level',
  occupationLevel: 'Occupation Level',
  maritalStatus: 'Marital Status',
  familyStructure: 'Family Structure',
  geography: 'Geography',
  occupation: 'Occupation',
  industry: 'Industry',
  categoryAwareness: 'Category Awareness',
  lifestyle: 'Lifestyle',
  values: 'Values',
  personality: 'Personality',
  interests: 'Interests',
  motivations: 'Motivations',
  decisionMakingStyle: 'Decision Making Style',
  consumptionFrequency: 'Consumption Frequency',
  purchaseChannel: 'Purchase Channel',
  priceSensitivity: 'Price Sensitivity',
  brandSensitivity: 'Brand Sensitivity',
  switchingBehaviour: 'Switching Behaviour',
  purchaseTriggers: 'Purchase Triggers',
  purchaseBarriers: 'Purchase Barriers',
  mediaConsumption: 'Media Consumption Patterns',
  digitalBehaviour: 'Digital Behaviour',
  formativeExperience: 'Formative Experience',
};