import React, { useState, useEffect } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { usePersonaPreview, useDeletePersona, usePersonas } from "../../../../../../hooks/usePersonaBuilder";
import { useTheme } from "../../../../../../context/ThemeContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  TbArrowLeft,
  TbTrash,
  TbUser,
  TbTarget,
  TbChartBar,
  TbTent,
  TbBallpen,
  TbBriefcase,
  TbDeviceLaptop,
  TbHeart,
  TbQuote,
  TbStar,
  TbInfoCircle,
  TbCheck,
  TbAlertCircle,
  TbChevronRight,
  TbChevronDown,
  TbLoader,
  TbScale,
  TbRefresh
} from "react-icons/tb";
import GlassCard from "../../../../../common/GlassCard";
import PremiumButton from "../../../../../common/PremiumButton";

// Import Recharts components
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend
} from 'recharts';

// Content data mapping - same as in personaBuilder
const contentData = {
  "Demographics": ["Age", "Gender", "Income Level", "Education Level", "Occupation / Employment Type", "Family Structure", "Geography"],
  "Psychographic Traits": ["Lifestyle", "Values", "Personality", "Interests", "Motivations"],
  "Behavioral Traits": [
    "Decision Making Style", "Purchase Frequency", "Purchase Channel",
    "Price Sensitivity", "Brand Sensitivity", "Price Sensitivity Profile",
    "Loyalty / Switching Behavior", "Purchase Triggers & Occasions",
    "Purchase Barriers", "Decision-Making Style", "Media Consumption Patterns",
    "Digital Behavior"
  ],
  "Lifestyle Traits": ["Mobility", "Home Ownership", "Marital Status", "Daily Rhythm"],
  "Hobbies & Interests": ["Hobbies & Interests"],
  "Professional Traits": ["Professional Traits"],
  "Digital Activity": ["Digital Activity"],
  "Preferences": ["Preferences"],
  "Additional Traits": [], // Populated dynamically
};

const TraitIcon = ({ trait, className }) => {
  const icons = {
    "Demographics": <TbUser className={className} />,
    "Psychographic Traits": <TbTarget className={className} />,
    "Behavioral Traits": <TbChartBar className={className} />,
    "Lifestyle Traits": <TbTent className={className} />,
    "Hobbies & Interests": <TbBallpen className={className} />,
    "Professional Traits": <TbBriefcase className={className} />,
    "Digital Activity": <TbDeviceLaptop className={className} />,
    "Preferences": <TbHeart className={className} />,
  };
  return icons[trait] || <TbChevronRight className={className} />;
  return icons[trait] || <TbChevronRight className={className} />;
};

// Helper for smart merging: only overwrites if value is non-empty
const smartMerge = (base, ...overlays) => {
  const result = { ...base }; // Start with base (lowest priority)

  overlays.forEach(overlay => {
    if (!overlay) return;
    Object.keys(overlay).forEach(key => {
      const val = overlay[key];
      // Check if value is "meaningful" (not null, undefined, empty string, or empty array)
      const isNonEmpty = val !== "" && val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0);

      if (isNonEmpty) {
        result[key] = val;
      }
    });
  });
  return result;
};

const PersonaPreview = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const { workspaceId, objectiveId, personaId } = useParams();
  const location = useLocation();

  const {
    data: previewData,
    isLoading: isPreviewLoading,
    error: previewError,
    refetch: refetchPreview
  } = usePersonaPreview(workspaceId, objectiveId, personaId, {
    enabled: !!(workspaceId && objectiveId && personaId)
  });

  const { data: manualPersonasData } = usePersonas(workspaceId, objectiveId);

  const isLoading = isPreviewLoading;
  const error = previewError;
  const refetch = refetchPreview;

  // Add delete hook
  const deletePersonaMutation = useDeletePersona(workspaceId, objectiveId);

  // Add state for delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState("Persona");
  const [personaData, setPersonaData] = useState({});
  const [selectedPersona, setSelectedPersona] = useState("");
  const [personas, setPersonas] = useState([]);
  const [showPersonaDropdown, setShowPersonaDropdown] = useState(false);
  const [isTraitLoading, setIsTraitLoading] = useState(false);

  const handleTabChange = (tab) => {
    if (tab === activeTab) return;
    console.log('Switching to tab:', tab);
    setIsTraitLoading(true);
    setActiveTab(tab);
    setShowPersonaDropdown(false);

    // Simulate loading for smoother transition
    setTimeout(() => {
      setIsTraitLoading(false);
    }, 600);
  };

  // Refetch data when component mounts or ID changes
  useEffect(() => {
    if (workspaceId && objectiveId && personaId) {
      refetch();
    }
  }, [workspaceId, objectiveId, personaId, refetch]);

  // Sync personas list and data structure
  useEffect(() => {
    const personasList = Array.isArray(manualPersonasData)
      ? manualPersonasData
      : (manualPersonasData?.data && Array.isArray(manualPersonasData.data) ? manualPersonasData.data : []);

    const realPersonasNames = personasList.map(p => p.name || p.title) || [];

    setPersonas(realPersonasNames);

    const mapApiTraitsToUi = (traits) => {
      if (!traits) return {};

      const mapped = {
        "Age": Array.isArray(traits.age_range || traits.Age) ? (traits.age_range || traits.Age).join(', ') : (traits.age_range || traits.Age),
        "Gender": Array.isArray(traits.gender || traits.Gender) ? (traits.gender || traits.Gender).join(', ') : (traits.gender || traits.Gender),
        "Income Level": Array.isArray(traits.income_range || traits.income || traits["Income Level"]) ? (traits.income_range || traits.income || traits["Income Level"]).join(', ') : (traits.income_range || traits.income || traits["Income Level"]),
        "Education Level": Array.isArray(traits.education_level || traits.education || traits["Education Level"]) ? (traits.education_level || traits.education || traits["Education Level"]).join(', ') : (traits.education_level || traits.education || traits["Education Level"]),
        "Occupation / Employment Type": Array.isArray(traits.occupation || traits["Occupation / Employment Type"]) ? (traits.occupation || traits["Occupation / Employment Type"]).join(', ') : (traits.occupation || traits["Occupation / Employment Type"]),
        "Family Structure": Array.isArray(traits.family_size || traits.family_structure || traits["Family Structure"]) ? (traits.family_size || traits.family_structure || traits["Family Structure"]).join(', ') : (traits.family_size || traits.family_structure || traits["Family Structure"]),
        "Geography": Array.isArray(traits.geography || traits.location_country || traits.Geography) ? (traits.geography || traits.location_country || traits.Geography).join(', ') : (traits.geography || traits.location_country || traits.Geography),
        "Lifestyle": Array.isArray(traits.lifestyle || traits.lifestyle_type || traits.Lifestyle) ? (traits.lifestyle || traits.lifestyle_type || traits.Lifestyle).join(', ') : (traits.lifestyle || traits.lifestyle_type || traits.Lifestyle),
        "Values": Array.isArray(traits.values || traits.Values) ? (traits.values || traits.Values).join(', ') : (traits.values || traits.Values),
        "Personality": Array.isArray(traits.personality || traits.personality_type || traits.personality_traits || traits.Personality) ? (traits.personality || traits.personality_type || traits.personality_traits || traits.Personality).join(', ') : (traits.personality || traits.personality_type || traits.personality_traits || traits.Personality),
        "Interests": Array.isArray(traits.interests || traits.Interests) ? (traits.interests || traits.Interests).join(', ') : (traits.interests || traits.Interests),
        "Motivations": Array.isArray(traits.motivations || traits.Motivations) ? (traits.motivations || traits.Motivations).join(', ') : (traits.motivations || traits.Motivations),
        "Brand Sensitivity": Array.isArray(traits.brand_sensitivity_detailed || traits.brand_sensitivity || traits["Brand Sensitivity"]) ? (traits.brand_sensitivity_detailed || traits.brand_sensitivity || traits["Brand Sensitivity"]).join(', ') : (traits.brand_sensitivity_detailed || traits.brand_sensitivity || traits["Brand Sensitivity"]),
        "Price Sensitivity": Array.isArray(traits.price_sensitivity_general || traits.price_sensitivity || traits["Price Sensitivity"]) ? (traits.price_sensitivity_general || traits.price_sensitivity || traits["Price Sensitivity"]).join(', ') : (traits.price_sensitivity_general || traits.price_sensitivity || traits["Price Sensitivity"]),
        "Mobility": Array.isArray(traits.mobility || traits.Mobility) ? (traits.mobility || traits.Mobility).join(', ') : (traits.mobility || traits.Mobility),
        "Home Ownership": Array.isArray(traits.accommodation || traits.home_ownership || traits["Home Ownership"]) ? (traits.accommodation || traits.home_ownership || traits["Home Ownership"]).join(', ') : (traits.accommodation || traits.home_ownership || traits["Home Ownership"]),
        "Marital Status": Array.isArray(traits.marital_status || traits["Marital Status"]) ? (traits.marital_status || traits["Marital Status"]).join(', ') : (traits.marital_status || traits["Marital Status"]),
        "Daily Rhythm": Array.isArray(traits.daily_rhythm || traits["Daily Rhythm"]) ? (traits.daily_rhythm || traits["Daily Rhythm"]).join(', ') : (traits.daily_rhythm || traits["Daily Rhythm"]),
        "Hobbies & Interests": Array.isArray(traits.hobbies || traits["Hobbies & Interests"]) ? (traits.hobbies || traits["Hobbies & Interests"]).join(', ') : (traits.hobbies || traits["Hobbies & Interests"]),
        "Decision Making Style": Array.isArray(traits.decision_making_style_1 || traits["Decision Making Style"]) ? (traits.decision_making_style_1 || traits["Decision Making Style"]).join(', ') : (traits.decision_making_style_1 || traits["Decision Making Style"]),
        "Purchase Frequency": Array.isArray(traits.purchase_frequency || traits["Purchase Frequency"]) ? (traits.purchase_frequency || traits["Purchase Frequency"]).join(', ') : (traits.purchase_frequency || traits["Purchase Frequency"]),
        "Purchase Channel": Array.isArray(traits.purchase_channel_detailed || traits.purchase_channel || traits["Purchase Channel"]) ? (traits.purchase_channel_detailed || traits.purchase_channel || traits["Purchase Channel"]).join(', ') : (traits.purchase_channel_detailed || traits.purchase_channel || traits["Purchase Channel"]),
        "Price Sensitivity Profile": Array.isArray(traits.price_sensitivity_profile || traits["Price Sensitivity Profile"]) ? (traits.price_sensitivity_profile || traits["Price Sensitivity Profile"]).join(', ') : (traits.price_sensitivity_profile || traits["Price Sensitivity Profile"]),
        "Loyalty / Switching Behavior": Array.isArray(traits.loyalty_behavior || traits["Loyalty / Switching Behavior"]) ? (traits.loyalty_behavior || traits["Loyalty / Switching Behavior"]).join(', ') : (traits.loyalty_behavior || traits["Loyalty / Switching Behavior"]),
        "Purchase Triggers & Occasions": Array.isArray(traits.purchase_triggers || traits["Purchase Triggers & Occasions"]) ? (traits.purchase_triggers || traits["Purchase Triggers & Occasions"]).join(', ') : (traits.purchase_triggers || traits["Purchase Triggers & Occasions"]),
        "Purchase Barriers": Array.isArray(traits.purchase_barriers || traits["Purchase Barriers"]) ? (traits.purchase_barriers || traits["Purchase Barriers"]).join(', ') : (traits.purchase_barriers || traits["Purchase Barriers"]),
        "Decision-Making Style": Array.isArray(traits.decision_making_style_2 || traits["Decision-Making Style"]) ? (traits.decision_making_style_2 || traits["Decision-Making Style"]).join(', ') : (traits.decision_making_style_2 || traits["Decision-Making Style"]),
        "Media Consumption Patterns": Array.isArray(traits.media_consumption || traits["Media Consumption Patterns"]) ? (traits.media_consumption || traits["Media Consumption Patterns"]).join(', ') : (traits.media_consumption || traits["Media Consumption Patterns"]),
        "Digital Behavior": Array.isArray(traits.digital_behavior_detailed || traits["Digital Behavior"]) ? (traits.digital_behavior_detailed || traits["Digital Behavior"]).join(', ') : (traits.digital_behavior_detailed || traits["Digital Behavior"]),
        "Purchase patterns": Array.isArray(traits.purchase_patterns || traits["Purchase patterns"]) ? (traits.purchase_patterns || traits["Purchase patterns"]).join(', ') : (traits.purchase_patterns || traits["Purchase patterns"]),
        "Purchase channel": Array.isArray(traits.purchase_channel || traits["Purchase channel"]) ? (traits.purchase_channel || traits["Purchase channel"]).join(', ') : (traits.purchase_channel || traits["Purchase channel"]),
        "backstory": traits.backstory || "",
        "isAI": !!(traits.isAI || traits.auto_generated_persona || personaId?.toString().toLowerCase().includes('ai') || false)
      };

      // Identify additional traits (keys not in standard mapping)
      const standardKeys = [
        // Core Demographics
        'name', 'age_range', 'gender', 'income_range', 'education_level',
        'occupation', 'family_size', 'location_country', 'location_state', 'geography',

        // Psychographic Traits
        'lifestyle', 'values', 'personality', 'personality_traits', 'interests', 'motivations',

        // Behavioral Traits
        'brand_sensitivity', 'price_sensitivity', 'decision_making_style', 'purchase_patterns', 'purchase_channel',

        // Lifestyle Traits
        'mobility', 'accommodation', 'marital_status', 'daily_rhythm',

        // Other standard fields
        'hobbies', 'professional_traits', 'digital_activity', 'preferences', 'backstory',

        // System/Meta fields (always exclude)
        'isAI', 'id', 'research_objective_id', 'exploration_id', 'sample_size',
        'auto_generated_persona', 'created_at', 'created_by', 'workspace_id',

        // Complex nested objects that are handled separately
        'persona_details', 'behaviors', 'attitudes_toward_category',
        'barriers_pain_points', 'triggers_opportunities', 'journey_stage_mapping',
        'ocean_profile', 'persona_generation_method', 'reference_sites_with_usage',
        'confidence_scoring', 'researched_sites'
      ];

      const additionalTraitKeys = [];


      Object.keys(traits).forEach(key => {
        const value = traits[key];
        const isStandard = standardKeys.includes(key);
        const isValidType = (typeof value === 'string' || typeof value === 'number' || Array.isArray(value));
        const isNotEmpty = Array.isArray(value) ? value.length > 0 : value !== '';
        const isNotId = !key.toLowerCase().includes('id');
        const isNotObject = typeof value !== 'object' || Array.isArray(value);

        if (!isStandard && isValidType && isNotEmpty && isNotId && isNotObject) {
          const label = key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

          if (Array.isArray(traits[key])) {
            mapped[label] = traits[key].join(', ');
          } else {
            mapped[label] = traits[key];
          }

          additionalTraitKeys.push(label);
        }
      });

      mapped._additionalTraitKeys = additionalTraitKeys;
      return mapped;
    };

    // Build fresh personaData state
    const newPersonaData = {};

    // If we have previewData from the API, add it
    if (previewData?.data) {
      const traits = previewData.data.traits || previewData.data || {};
      const personaDetails = previewData.data.persona_details || {};

      // Find the persona in manualPersonasData to get the absolute latest user edits
      // (The List API often has fresher data than the Preview API for user-edited fields)
      const personasList = Array.isArray(manualPersonasData)
        ? manualPersonasData
        : (manualPersonasData?.data && Array.isArray(manualPersonasData.data) ? manualPersonasData.data : []);

      const manualPersona = personasList.find(p => p.id === personaId);

      // Merge traits and persona_details for comprehensive data
      // Use smartMerge to ensure empty user edits don't wipe out AI details
      const mergedTraits = smartMerge(
        personaDetails,
        (previewData.data.traits || {}),
        previewData.data,
        (manualPersona || {})
      );

      const apiPersonaName = mergedTraits.name || "Real Persona";
      newPersonaData[apiPersonaName] = mapApiTraitsToUi(mergedTraits);
    } else {
    }

    setPersonaData(newPersonaData);
  }, [previewData, manualPersonasData]);

  // Handle selection synchronization separately to avoid "fighting"
  useEffect(() => {
    if (personaId && previewData?.data?.traits) {
      const apiName = previewData.data.traits.name;

      // Sync from API data if available
      if (apiName && selectedPersona !== apiName) {
        setSelectedPersona(apiName);
      }
    }
  }, [previewData, personaId, selectedPersona]);

  const handleDeletePersona = async () => {
    if (!personaId || isDeleting) return;

    setIsDeleting(true);
    try {
      await deletePersonaMutation.mutateAsync(personaId);

      // Navigate back to personas list
      navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`);

    } catch (error) {
      console.error("Failed to delete persona:", error);
      // Optionally show an error toast/notification
      alert("Failed to delete persona. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Simple delete confirmation
  const handleDeleteClick = () => {
    const personaName = previewData?.data?.traits?.name || previewData?.data?.title?.split(":")[0] || "this persona";
    const confirmed = window.confirm(
      `Are you sure you want to delete "${personaName}"? This action cannot be undone.`
    );

    if (confirmed) {
      handleDeletePersona();
    }
  };

  const currentPersonaData = personaData[selectedPersona] || {};
  // Consolidate data for easier access
  const rawTraits = previewData?.data?.traits || previewData?.data || {};
  const personaDetails = previewData?.data?.persona_details || rawTraits.persona_details || {};

  // Find manual persona for render-time fallback
  const personasList = Array.isArray(manualPersonasData)
    ? manualPersonasData
    : (manualPersonasData?.data && Array.isArray(manualPersonasData.data) ? manualPersonasData.data : []);
  const manualPersona = personasList.find(p => p.id === personaId);


  const mergedTraits = smartMerge(
    personaDetails,
    (previewData?.data?.traits || {}),
    (previewData?.data || {}),
    (manualPersona || {})
  );

  const confidence = mergedTraits.confidence_scoring || previewData?.data?.confidence || {};
  const evidenceSnapshot = previewData?.data?.evidence_snapshot ||
    previewData?.evidence_snapshot ||
    mergedTraits?.evidence_snapshot || {};

  const confidenceDetail = evidenceSnapshot?.confidence_calculation_detail ||
    evidenceSnapshot?.confidence_breakdown ||
    previewData?.confidence_calculation_detail ||
    previewData?.data?.confidence_calculation_detail ||
    previewData?.data?.traits?.confidence_calculation_detail ||
    previewData?.data?.persona?.confidence_calculation_detail ||
    mergedTraits?.confidence_calculation_detail ||
    confidence?.confidence_calculation_detail ||
    mergedTraits?.confidence_scoring?.confidence_calculation_detail ||
    rawTraits?.confidence_calculation_detail ||
    personaDetails?.confidence_calculation_detail;

  // Consolidate the confidence score for display
  const finalScore = (confidenceDetail && confidenceDetail.weighted_total !== undefined)
    ? Math.round(confidenceDetail.weighted_total * 100)
    : (parseInt(confidence.score) || parseInt(mergedTraits.confidence_score) || 0);

  const confidenceLevel = confidenceDetail?.level || confidence?.reliability || mergedTraits?.confidence_level || "High";
  const starRating = confidenceDetail?.stars || confidence?.stars || 0;

  // Add a debug log to help identify where the data is located if it's still missing
  useEffect(() => {
    if (previewData) {
      console.log('Persona Preview Data:', {
        hasData: !!previewData.data,
        rootKeys: Object.keys(previewData),
        dataKeys: previewData.data ? Object.keys(previewData.data) : [],
        traitsKeys: previewData.data?.traits ? Object.keys(previewData.data.traits) : [],
        confidenceDetail: !!confidenceDetail
      });
    }
  }, [previewData, confidenceDetail]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <TbLoader className="animate-spin" size={20} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <TbAlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <p className="text-red-600 dark:text-red-400">Failed to load persona preview</p>
          <button
            onClick={() => navigate(-1)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }


  const barriersSource = mergedTraits.barriers_pain_points || {};
  const triggersSource = mergedTraits.triggers_opportunities || {};

  // Directly target researched_sites from all known locations
  const evidenceSitesRaw = evidenceSnapshot?.sources ||
    mergedTraits.researched_sites ||
    previewData?.data?.researched_sites ||
    mergedTraits.researched_platforms ||
    rawTraits.researched_sites ||
    personaDetails.researched_sites ||
    confidence.researched_sites || [];

  // Platform name mapping for better UI display
  const platformMapping = {
    'quora.com': 'Quora',
    'reddit.com': 'Reddit',
    'youtube.com': 'YouTube',
    'x.com': 'X (Twitter)',
    'twitter.com': 'X (Twitter)',
    'capterra': 'Capterra',
    'linkedin.com': 'LinkedIn',
    'medium.com': 'Medium',
    'producthunt.com': 'Product Hunt',
    'trustpilot.com': 'Trustpilot',
    'yelp.com': 'Yelp'
  };

  const processEvidenceSite = (site) => {
    if (typeof site !== 'string') return null;
    const lowerSite = site.toLowerCase();

    // Check if the site matches any known platform
    for (const [domain, name] of Object.entries(platformMapping)) {
      if (lowerSite.includes(domain)) {
        return name;
      }
    }

    // Try making URLs pretty
    try {
      if (lowerSite.startsWith('http') || lowerSite.includes('www.')) {
        const url = new URL(lowerSite.startsWith('http') ? lowerSite : `https://${lowerSite}`);
        const domain = url.hostname.replace('www.', '');
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      }
    } catch (e) {
      // Not a valid URL
    }

    return site; // Return original if no match
  };

  let formattedSites = [];

  if (Array.isArray(evidenceSitesRaw)) {
    evidenceSitesRaw.forEach(site => {
      if (typeof site === 'object' && site !== null) {
        const name = processEvidenceSite(site.platform || site.name || site.site);
        if (name) {
          const num = Number(site.threads_or_posts || site.count || site.value) || 1;
          formattedSites.push({ name, count: num });
        }
      } else {
        const name = processEvidenceSite(site);
        if (name) formattedSites.push({ name, count: 1 });
      }
    });
  } else if (typeof evidenceSitesRaw === 'object' && evidenceSitesRaw !== null) {
    Object.entries(evidenceSitesRaw).forEach(([site, count]) => {
      const name = processEvidenceSite(site);
      if (name) {
        const num = Number(count) || 1;
        formattedSites.push({ name, count: num });
      }
    });
  } else if (typeof evidenceSitesRaw === 'string') {
    evidenceSitesRaw.split(',').forEach(s => {
      const name = processEvidenceSite(s.trim());
      if (name) formattedSites.push({ name, count: 1 });
    });
  }

  // Merge duplicates and sum counts
  const evidenceSites = formattedSites.reduce((acc, curr) => {
    const existing = acc.find(item => item.name === curr.name);
    if (existing) {
      existing.count += curr.count;
    } else {
      acc.push(curr);
    }
    return acc;
  }, []).sort((a, b) => b.count - a.count);

  const totalEvidenceCount = evidenceSnapshot.total_conversations || evidenceSites.reduce((sum, item) => sum + item.count, 0);

  // Helper to flatten nested object values into a single list
  const getFlattenedTraits = (obj) => {
    if (!obj) return [];
    if (Array.isArray(obj)) return obj;
    if (typeof obj === 'string') return [obj];
    return Object.values(obj).flat().filter(item => typeof item === 'string' && item !== '');
  };

  const barriersList = getFlattenedTraits(barriersSource);
  const triggersList = getFlattenedTraits(triggersSource);

  const oceanProfile = previewData?.data?.traits?.ocean_profile || {};

  // Get persona name from API or use default
  const personaName = selectedPersona;
  const personaTitle = `Persona Insights: ${selectedPersona}`;
  const summaryLine = "Persona details and insights from Omi AI";

  const traitTabs = Object.keys(contentData);
  const activeTraitTabs = ["Persona", ...traitTabs];

  // Prepare data for Radar Chart
  const prepareRadarData = (oceanScores) => {
    if (!oceanScores) return [];

    return [
      { subject: 'Openness', A: oceanScores.openness || 0, fullMark: 1 },
      { subject: 'Conscientiousness', A: oceanScores.conscientiousness || 0, fullMark: 1 },
      { subject: 'Extraversion', A: oceanScores.extraversion || 0, fullMark: 1 },
      { subject: 'Agreeableness', A: oceanScores.agreeableness || 0, fullMark: 1 },
      { subject: 'Neuroticism', A: oceanScores.neuroticism || 0, fullMark: 1 },
    ];
  };

  const radarData = prepareRadarData(oceanProfile?.scores);

  // Stats for the sidebar
  const stats = [
    { label: "Age", value: currentPersonaData["Age"] || "Any" },
    { label: "Gender", value: currentPersonaData["Gender"] || "Any" },
    { label: "Occupation", value: currentPersonaData["Occupation"] || "Any" },
    { label: "Location", value: currentPersonaData["Geography"] || "Any" },
  ];

  return (
    <div className="p-4 md:p-8 relative">
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
        >
          <div>
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-builder`)}
                className="p-3 rounded-2xl bg-white/50 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 shadow-sm hover:bg-white dark:hover:bg-white/10 transition-colors"
                title="Go Back"
              >
                <TbArrowLeft className="w-6 h-6" />
              </button>
              <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                {personaTitle}
              </h1>
            </div>
            {/* <p className="text-gray-500 dark:text-gray-400 mt-1">
            {summaryLine}
          </p> */}
          </div>

          <div className="flex items-center gap-3">
            <PremiumButton
              variant="ghost"
              onClick={handleDeleteClick}
              className="text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
              icon={isDeleting ? <TbLoader className="animate-spin" size={20} /> : <TbTrash size={20} />}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Persona"}
            </PremiumButton>
          </div>
        </motion.div>

        {/* Main Card */}
        <div className="bg-white dark:bg-white/5 backdrop-blur-xl border-2 border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl overflow-hidden min-h-[700px] flex flex-col relative z-10">
          <div className="px-8 pt-6 border-b border-gray-100 dark:border-white/5 bg-white/50 dark:bg-white/[0.02]">
            <div className="flex items-center">
              {/* Persona Selector - Fixed/Stationary */}
              <div className="relative flex-shrink-0 border-r border-gray-100 dark:border-white/5 pr-8 mr-8">
                <button
                  onClick={() => setShowPersonaDropdown(!showPersonaDropdown)}
                  className={`flex items-center gap-2 pb-4 whitespace-nowrap text-sm font-extrabold transition-all duration-300 ${activeTab === "Persona"
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    }`}
                >
                  <TbUser className="w-4 h-4" />
                  <span>{selectedPersona}</span>
                  <TbChevronDown className={`w-3 h-3 transition-transform duration-200 ${showPersonaDropdown ? "rotate-180" : ""}`} />
                  {activeTab === "Persona" && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"
                    />
                  )}
                </button>

                <AnimatePresence>
                  {showPersonaDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full left-0 mt-2 p-2 w-[240px] bg-white dark:bg-[#1a1c1e] border border-gray-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden ring-1 ring-black/5"
                    >
                      <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-white/5 mb-2">
                        Switch Persona
                      </div>
                      <div className="space-y-1">
                        {personas.map(pName => (
                          <button
                            key={pName}
                            onClick={() => {
                              const personasList = Array.isArray(manualPersonasData)
                                ? manualPersonasData
                                : (manualPersonasData?.data && Array.isArray(manualPersonasData.data) ? manualPersonasData.data : []);

                              const realPersona = personasList.find(p => p.name === pName || p.title === pName);
                              if (realPersona) {
                                // Set name immediately for UI feedback
                                setSelectedPersona(pName);
                                navigate(`/main/organization/workspace/research-objectives/${workspaceId}/${objectiveId}/persona-preview/${realPersona.id}`);
                              } else {
                                setSelectedPersona(pName);
                              }
                              setActiveTab("Persona");
                              setShowPersonaDropdown(false);
                            }}
                            className={`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all truncate ${selectedPersona === pName
                              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                              : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5"
                              }`}
                          >
                            {pName}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Trait Tabs - Only this area scrolls */}
              <div className="flex items-center gap-8 overflow-x-auto scrollbar-none flex-grow">
                {traitTabs
                  .map(tab => {
                    // Comment out Additional Traits globally as per request
                    if (tab === "Additional Traits") {
                      return null;
                    }
                    return (
                      <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        className={`relative flex items-center gap-2 pb-4 whitespace-nowrap text-sm font-bold transition-all duration-300 ${activeTab === tab
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                          }`}
                      >
                        <TraitIcon trait={tab} className="w-4 h-4" />
                        <span>{tab}</span>
                        {activeTab === tab && (
                          <motion.div
                            layoutId="activeTab"
                            className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"
                          />
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row flex-grow">
            {/* Sidebar: Persona Identity */}
            <div className="w-full lg:w-80 border-r border-gray-100 dark:border-white/5 p-8 flex flex-col">

              <div className="flex flex-col items-center text-center">
                <div className="relative group">
                  <div className="absolute inset-0 bg-blue-500 rounded-full blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" />
                  <div className="w-40 h-40 rounded-full flex items-center justify-center bg-gray-50 dark:bg-white/5 border-4 border-white dark:border-white/10 shadow-2xl relative z-10">
                    <TbUser className="w-20 h-20 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <h2 className="mt-6 text-2xl font-bold text-gray-900 dark:text-white">{personaName}</h2>
                <p className="text-blue-600 dark:text-blue-400 font-bold text-sm tracking-wide uppercase mt-1">
                  {currentPersonaData["Occupation"] || "Target Persona"}
                </p>

                {/* Confidence Score */}
                {(finalScore > 0 || confidenceDetail) && (
                  <div className="w-full mt-8">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Confidence Score</span>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{finalScore}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-white/5 rounded-full h-2 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${finalScore}%` }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                      />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">
                      Reliability: {confidenceLevel}
                    </p>

                    {/* Star Rating */}
                    {starRating > 0 && (
                      <div className="flex gap-1 justify-center mt-2">
                        {[...Array(5)].map((_, i) => (
                          <TbStar
                            key={i}
                            className={`w-4 h-4 ${i < starRating ? "text-yellow-500 fill-yellow-500" : "text-gray-300 dark:text-gray-600"}`}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-grow p-8 bg-gray-100 dark:bg-black/10 min-h-[600px] relative">
              <AnimatePresence mode="wait">
                {isTraitLoading ? (
                  <motion.div
                    key="loader"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-gray-100/50 dark:bg-black/20 backdrop-blur-sm"
                  >
                    <TbLoader className="animate-spin text-blue-600 dark:text-blue-400 mb-4" size={48} />
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400 animate-pulse">Loading insights...</p>
                  </motion.div>
                ) : (
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                    className="h-full"
                  >
                    {activeTab === 'Persona' ? (
                      <div className="space-y-8">
                        {/* Showcase Traits Grid */}
                        <section>
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Core Attributes Showcase</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {Object.keys(contentData).map((category) => {
                              // Comment out Additional Traits globally
                              if (category === "Additional Traits") {
                                return null;
                              }

                              let categoryTraits = [];
                              if (category === "Additional Traits") {
                                categoryTraits = currentPersonaData._additionalTraitKeys || [];
                              } else {
                                categoryTraits = contentData[category].filter(trait => currentPersonaData[trait]);
                              }

                              if (categoryTraits.length === 0) return null;

                              //  for Additional Traits - split into two cards
                              if (category === "Additional Traits" && categoryTraits.length > 0) {
                                const midpoint = Math.ceil(categoryTraits.length / 2);
                                const firstHalf = categoryTraits.slice(0, midpoint);
                                const secondHalf = categoryTraits.slice(midpoint);

                                return (
                                  <React.Fragment key={category}>
                                    {/* First Additional Traits Card */}
                                    <GlassCard className="p-5 flex flex-col gap-4 group hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors bg-white dark:bg-white/5 shadow-md border-gray-200 dark:border-white/10 ring-1 ring-gray-100 dark:ring-transparent">
                                      <div className="flex items-center gap-2 border-b border-gray-100 dark:border-white/5 pb-2">
                                        <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                                          <TbChevronRight className="w-4 h-4" />
                                        </div>
                                        <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                          {category}
                                        </h4>
                                      </div>
                                      <div className="grid grid-cols-1 gap-y-3">
                                        {firstHalf.map(trait => (
                                          <div key={trait} className="grid grid-cols-[160px_1fr] gap-4 items-start text-sm border-b border-gray-50 dark:border-white/5 pb-2 last:border-0 last:pb-0">
                                            <span className="font-semibold text-gray-500 dark:text-gray-400 break-words">{trait}</span>
                                            <span className="font-bold text-gray-900 dark:text-white leading-tight">{currentPersonaData[trait]}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </GlassCard>

                                    {/* Second Additional Traits Card */}
                                    {secondHalf.length > 0 && (
                                      <GlassCard className="p-5 flex flex-col gap-4 group hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors bg-white dark:bg-white/5 shadow-md border-gray-200 dark:border-white/10 ring-1 ring-gray-100 dark:ring-transparent">
                                        <div className="flex items-center gap-2 border-b border-gray-100 dark:border-white/5 pb-2">
                                          <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                                            <TbChevronRight className="w-4 h-4" />
                                          </div>
                                          <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            {category} (continued)
                                          </h4>
                                        </div>
                                        <div className="grid grid-cols-1 gap-y-3">
                                          {secondHalf.map(trait => (
                                            <div key={trait} className="grid grid-cols-[160px_1fr] gap-4 items-start text-sm border-b border-gray-50 dark:border-white/5 pb-2 last:border-0 last:pb-0">
                                              <span className="font-semibold text-gray-500 dark:text-gray-400 break-words">{trait}</span>
                                              <span className="font-bold text-gray-900 dark:text-white leading-tight">{currentPersonaData[trait]}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </GlassCard>
                                    )}
                                  </React.Fragment>
                                );
                              }

                              // Regular rendering for other categories
                              return (
                                <GlassCard key={category} className="p-5 flex flex-col gap-4 group hover:border-blue-300 dark:hover:border-blue-500/50 transition-colors bg-white dark:bg-white/5 shadow-md border-gray-200 dark:border-white/10 ring-1 ring-gray-100 dark:ring-transparent">
                                  <div className="flex items-center gap-2 border-b border-gray-100 dark:border-white/5 pb-2">
                                    <div className="p-2 bg-blue-50 dark:bg-blue-500/10 rounded-lg text-blue-600 dark:text-blue-400">
                                      <TraitIcon trait={category} className="w-4 h-4" />
                                    </div>
                                    <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                      {category}
                                    </h4>
                                  </div>
                                  <div className="grid grid-cols-1 gap-y-3">
                                    {categoryTraits.map(trait => (
                                      <div key={trait} className="grid grid-cols-[160px_1fr] gap-4 items-start text-sm border-b border-gray-50 dark:border-white/5 pb-2 last:border-0 last:pb-0">
                                        <span className="font-semibold text-gray-500 dark:text-gray-400 break-words">{trait}</span>
                                        <span className="font-bold text-gray-900 dark:text-white leading-tight">{currentPersonaData[trait]}</span>
                                      </div>
                                    ))}
                                  </div>
                                </GlassCard>
                              );
                            })}
                          </div>
                        </section>

                        {/* Backstory Section - Hidden for Omi (AI) Personas */}
                        {!currentPersonaData.isAI && (
                          <section>
                            <div className="flex items-center gap-2 mb-4 text-blue-600 dark:text-blue-400">
                              <TbQuote size={24} />
                              <h3 className="text-xl font-bold">Backstory</h3>
                            </div>
                            <GlassCard className="p-6 bg-white dark:bg-blue-500/5 border-gray-200 dark:border-blue-500/20 italic text-gray-700 dark:text-gray-300 leading-relaxed text-lg shadow-xl ring-1 ring-gray-100 dark:ring-transparent">
                              {currentPersonaData.backstory || "No backstory provided for this persona. The generated AI will use the selected traits to form its own narrative background."}
                            </GlassCard>
                          </section>
                        )}

                        {oceanProfile && (
                          <section className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10 shadow-lg relative overflow-hidden">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                              <TbChartBar className="text-blue-500" />
                              OCEAN Personality Profile
                            </h3>

                            <div className="flex flex-col md:flex-row items-center gap-8">
                              {/* Radar Chart using Recharts */}
                              <div className="w-64 h-64 flex-shrink-0">
                                <ResponsiveContainer width="100%" height="100%">
                                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                    <PolarGrid
                                      stroke={theme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}
                                      strokeWidth={1}
                                    />
                                    <PolarAngleAxis
                                      dataKey="subject"
                                      tick={{
                                        fill: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                                        fontSize: 12,
                                        fontWeight: 'bold'
                                      }}
                                    />
                                    <PolarRadiusAxis
                                      angle={30}
                                      domain={[0, 1]}
                                      tickCount={6}
                                      tick={{
                                        fill: theme === 'dark' ? '#9CA3AF' : '#6B7280',
                                        fontSize: 10
                                      }}
                                    />
                                    <Radar
                                      name={personaName}
                                      dataKey="A"
                                      stroke="#3b82f6"
                                      fill="#3b82f6"
                                      fillOpacity={0.5}
                                      strokeWidth={2}
                                    />
                                    <Legend
                                      verticalAlign="bottom"
                                      height={36}
                                      formatter={(value) => <span style={{ color: theme === 'dark' ? '#E5E7EB' : '#374151' }}>{value}</span>}
                                    />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </div>

                              <div className="flex-grow space-y-6">
                                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
                                  This radar chart visualizes the persona's Big Five personality traits based on the OCEAN model.
                                  <span className="font-bold text-blue-600 dark:text-blue-400"> {personaName}</span> shows a personality profile with
                                  <span className="font-bold"> {currentPersonaData["Personality"] || "balanced"}</span> traits across all dimensions.
                                  Each axis represents one of the five personality dimensions, with 0 being the minimum and 1 being the maximum.
                                </p>

                                {/* OCEAN Scores */}
                                {oceanProfile.scores && (
                                  <div className="grid grid-cols-2 gap-4">
                                    {Object.entries(oceanProfile.scores).map(([trait, score]) => (
                                      <div key={trait} className="space-y-1">
                                        <div className="flex justify-between items-center">
                                          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">
                                            {trait}
                                          </span>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                                              {Math.round(score * 100)}%
                                            </span>
                                            <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                              <div
                                                className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full"
                                                style={{ width: `${score * 100}%` }}
                                              />
                                            </div>
                                          </div>
                                        </div>
                                        <div className="text-xs text-gray-400 dark:text-gray-500">
                                          {oceanProfile.labels?.[trait] || "Medium"} (Score: {score.toFixed(2)}/1)
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Score Interpretation */}
                                {oceanProfile.scores && (
                                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800">
                                    <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-2">Score Interpretation</h4>
                                    <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
                                      <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-1">•</span>
                                        <span><strong>Openness ({oceanProfile.scores.openness?.toFixed(2) || 0}/1):</strong> Creativity, curiosity, appreciation for art and adventure</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-1">•</span>
                                        <span><strong>Conscientiousness ({oceanProfile.scores.conscientiousness?.toFixed(2) || 0}/1):</strong> Organization, dependability, discipline</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-1">•</span>
                                        <span><strong>Extraversion ({oceanProfile.scores.extraversion?.toFixed(2) || 0}/1):</strong> Sociability, assertiveness, enthusiasm</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-1">•</span>
                                        <span><strong>Agreeableness ({oceanProfile.scores.agreeableness?.toFixed(2) || 0}/1):</strong> Compassion, cooperation, trust</span>
                                      </li>
                                      <li className="flex items-start gap-2">
                                        <span className="text-blue-500 mt-1">•</span>
                                        <span><strong>Neuroticism ({oceanProfile.scores.neuroticism?.toFixed(2) || 0}/1):</strong> Emotional stability vs. emotional reactivity</span>
                                      </li>
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          </section>
                        )}

                        {/* Confidence Insights Section */}
                        {(barriersList.length > 0 || triggersList.length > 0) && (
                          <section className="bg-white dark:bg-white/5 rounded-2xl p-6 border border-gray-200 dark:border-white/10 shadow-lg">
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 flex items-center gap-2">
                              <TbInfoCircle className="text-blue-500" />
                              Barriers & Motivators
                            </h3>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Primary Barriers */}
                              {barriersList.length > 0 && (
                                <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <TbCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                                    <h4 className="font-bold text-green-700 dark:text-green-400">Primary Barriers</h4>
                                  </div>
                                  <ul className="space-y-2">
                                    {barriersList.map((barrier, index) => (
                                      <li key={index} className="text-sm text-green-700 dark:text-green-300 flex items-start gap-2">
                                        <span className="text-green-500 mt-1">•</span>
                                        <span>{barrier}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Key Triggers */}
                              {triggersList.length > 0 && (
                                <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-4">
                                  <div className="flex items-center gap-2 mb-3">
                                    <TbAlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                                    <h4 className="font-bold text-orange-700 dark:text-orange-400">Key Triggers</h4>
                                  </div>
                                  <ul className="space-y-2">
                                    {triggersList.map((trigger, index) => (
                                      <li key={index} className="text-sm text-orange-700 dark:text-orange-300 flex items-start gap-2">
                                        <span className="text-orange-500 mt-1">•</span>
                                        <span>{trigger}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>

                            {/* Evidence Base */}
                            {totalEvidenceCount > 0 && (
                              <div className="mt-6 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                                <div className="text-sm text-blue-700 dark:text-blue-300">
                                  <span className="font-bold block mb-2">Evidence Base: {totalEvidenceCount} real conversations analyzed from</span>
                                  {evidenceSites.length > 0 ? (
                                    <div className="flex flex-col gap-2">

                                      <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
                                        {evidenceSites.map((site, idx) => (
                                          <li key={idx} className="flex justify-between items-center text-xs">
                                            <span>{site.name}</span>
                                            <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1.5 rounded text-[10px]">{site.count}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ) : (
                                    confidence.improvements
                                  )}
                                </div>
                              </div>
                            )}
                          </section>
                        )}

                        {/* Confidence Breakdown Card */}
                        {(confidenceDetail || evidenceSnapshot.summary) && (
                          <section className="bg-white dark:bg-white/5 rounded-2xl p-8 shadow-xl overflow-hidden relative mt-8">
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-6 flex items-center gap-3">
                              <TbScale className="text-blue-600 dark:text-blue-400 w-7 h-7" />
                              Confidence Breakdown
                            </h3>

                            {/* Generation Method / Approach / Summary */}
                            {(evidenceSnapshot.summary || evidenceSnapshot.method || confidenceDetail?.method || confidenceDetail?.approach) && (
                              <div className="mb-8 p-5 bg-blue-50/50 dark:bg-blue-500/5 rounded-2xl shadow-sm border border-blue-100/30 dark:border-blue-500/10">
                                <div className="flex items-start gap-4">
                                  <div className="p-2.5 bg-blue-100 dark:bg-blue-500/10 rounded-xl text-blue-600 dark:text-blue-400">
                                    <TbInfoCircle className="w-6 h-6" />
                                  </div>
                                  <div>
                                    <h4 className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-[0.2em] mb-1">
                                      {evidenceSnapshot.summary ? "Generation Summary" : "Generation Method"}
                                    </h4>
                                    <p className="text-sm text-blue-700 dark:text-blue-400 font-medium italic leading-relaxed">
                                      "{evidenceSnapshot.summary || evidenceSnapshot.method || confidenceDetail?.method || confidenceDetail?.approach}"
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Assumptions & Notes */}
                            {Array.isArray(evidenceSnapshot.assumptions_notes) && evidenceSnapshot.assumptions_notes.length > 0 && (
                              <div className="mb-8 p-5 bg-amber-50/50 dark:bg-amber-500/5 rounded-2xl shadow-sm border border-amber-100/50 dark:border-amber-900/20">
                                <div className="flex items-start gap-4">
                                  <div className="p-2.5 bg-amber-100 dark:bg-amber-500/10 rounded-xl text-amber-600 dark:text-amber-400">
                                    <TbBallpen className="w-6 h-6" />
                                  </div>
                                  <div className="flex-1">
                                    <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-[0.2em] mb-3">Key Evidence Assumptions</h4>
                                    <ul className="space-y-2">
                                      {evidenceSnapshot.assumptions_notes.map((note, idx) => (
                                        <li key={idx} className="text-sm text-amber-700 dark:text-amber-400 flex items-start gap-2 leading-relaxed">
                                          <span className="text-amber-400 mt-1 flex-shrink-0">•</span>
                                          <span>{note}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                              {Object.entries(
                                confidenceDetail.components ||
                                Object.fromEntries(Object.entries(confidenceDetail).filter(([k, v]) => k.endsWith('_score') && typeof v === 'number'))
                              ).map(([key, score]) => {
                                const label = key.replace('_score', '').split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
                                const assessment = confidenceDetail.assessments?.[key.replace('_score', '')];

                                return (
                                  <div key={key} className="group flex flex-col gap-2">
                                    <div className="flex justify-between items-end">
                                      <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.1em] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                        {label}
                                      </span>
                                      <span className="text-sm font-black text-gray-900 dark:text-white">
                                        {Math.round(score * 100)}%
                                      </span>
                                    </div>
                                    <div className="w-full bg-gray-100 dark:bg-white/5 rounded-full h-2.5 overflow-hidden ring-1 ring-gray-200 dark:ring-transparent">
                                      <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${score * 100}%` }}
                                        transition={{ duration: 1.5, ease: "circOut" }}
                                        className={`h-full rounded-full ${score > 0.8 ? 'bg-gradient-to-r from-blue-600 to-indigo-600' :
                                          score > 0.5 ? 'bg-gradient-to-r from-blue-500 to-blue-600' :
                                            'bg-gradient-to-r from-blue-400 to-blue-500'
                                          } shadow-[0_0_10px_rgba(59,130,246,0.2)]`}
                                      />
                                    </div>
                                    {assessment && (
                                      <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                                        {assessment}
                                      </p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {confidenceDetail.weighted_total !== undefined && (
                              <div className="mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-6">
                                <div>
                                  <h4 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest">Weighted Total Impact</h4>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Final calculated confidence based on weighted components</p>
                                </div>
                                <div className="flex items-center gap-6 bg-gray-50 dark:bg-white/5 px-8 py-4 rounded-3xl border border-gray-100 dark:border-white/10 shadow-inner">
                                  <div className="flex flex-col items-end">
                                    <span className="text-3xl font-black text-blue-600 dark:text-blue-400">
                                      {Math.round(confidenceDetail.weighted_total * 100)}%
                                    </span>
                                  </div>
                                  <div className="w-40 bg-gray-200 dark:bg-gray-800 rounded-full h-4 overflow-hidden p-1 shadow-inner ring-1 ring-white/10">
                                    <motion.div
                                      initial={{ width: 0 }}
                                      animate={{ width: `${confidenceDetail.weighted_total * 100}%` }}
                                      transition={{ duration: 2, ease: "backOut" }}
                                      className="h-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 rounded-full shadow-lg"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </section>
                        )}
                      </div>
                    ) : (
                      <div className="h-full">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-500/20">
                            <TraitIcon trait={activeTab} className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{activeTab}</h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Detailed trait analysis for this category</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(activeTab === "Additional Traits"
                            ? (currentPersonaData._additionalTraitKeys || [])
                            : (contentData[activeTab] || [])
                          ).map(item => (
                            <div
                              key={item}
                              className={`flex flex-col p-5 rounded-2xl border transition-all ${currentPersonaData[item]
                                ? "bg-white dark:bg-white/5 border-gray-200 dark:border-blue-500/20 shadow-md"
                                : "bg-gray-50 dark:bg-white/[0.02] border-gray-200 dark:border-white/5 opacity-60"
                                }`}
                            >
                              <span className="text-xs font-extrabold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-1">{item}</span>
                              <div className="flex items-center justify-between">
                                <span className={`text-lg font-bold ${currentPersonaData[item] ? "text-gray-900 dark:text-white" : "text-gray-400 dark:text-gray-600"}`}>
                                  {currentPersonaData[item] || "Not Defined"}
                                </span>
                                {currentPersonaData[item] && (
                                  <div className="bg-blue-500/10 text-blue-600 dark:text-blue-400 p-1.5 rounded-full">
                                    <TbChevronRight size={16} />
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {((activeTab === "Additional Traits"
                          ? (currentPersonaData._additionalTraitKeys || [])
                          : (contentData[activeTab] || [])
                        ).length === 0) && (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-600">
                              <TbUser size={64} className="opacity-10 mb-4" />
                              <p className="font-medium">No traits available in this category</p>
                            </div>
                          )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
      .scrollbar-none::-webkit-scrollbar { display: none; }
      .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
    `}} />
    </div>
  );
};

export default PersonaPreview;