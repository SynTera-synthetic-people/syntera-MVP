import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from 'react-redux';
import { createPersonaStart } from "../../../../../../redux/slices/personaSlice";

const AddPersona = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { workspaceId, objectiveId } = useParams();
  
  const { loading, error } = useSelector((state) => state.persona);

  const [personaData, setPersonaData] = useState({
    name: "",
    age_range: "",
    gender: "",
    location_country: "",
    education_level: "",
    occupation: "",
    income_range: "",
    sample_size: 50,
    research_objective_id: objectiveId || "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPersonaData({
      ...personaData,
      [name]: value,
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    console.log('Creating persona with data:', personaData);
    console.log('API will be called: POST /workspaces/' + workspaceId + '/research/objectives/' + objectiveId + '/personas');
    
    // Dispatch the create persona action - this triggers the API
    dispatch(createPersonaStart({
      workspaceId,
      objectiveId,
      data: personaData
    }));
  };

  return (
    <div className="p-6 bg-white dark:bg-black-primary-light min-h-screen">
      <h1 className="text-2xl mb-6 text-blue-primary-dark dark:text-white font-bold">Create New Persona</h1>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Persona Name *
          </label>
          <input
            type="text"
            name="name"
            value={personaData.name}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
            placeholder="e.g., Urban Millennial Shopper"
          />
        </div>

        {/* Age Range */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Age Range *
          </label>
          <input
            type="text"
            name="age_range"
            value={personaData.age_range}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
            placeholder="e.g., 26-35"
          />
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Gender *
          </label>
          <select
            name="gender"
            value={personaData.gender}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
          >
            <option value="">Select Gender</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Any">Any</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Location Country */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Location (Country) *
          </label>
          <input
            type="text"
            name="location_country"
            value={personaData.location_country}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
            placeholder="e.g., India"
          />
        </div>

        {/* Education Level */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Education Level *
          </label>
          <select
            name="education_level"
            value={personaData.education_level}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
          >
            <option value="">Select Education Level</option>
            <option value="High School">High School</option>
            <option value="Graduate">Graduate</option>
            <option value="Post Graduate">Post Graduate</option>
            <option value="Doctorate">Doctorate</option>
          </select>
        </div>

        {/* Occupation */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Occupation *
          </label>
          <input
            type="text"
            name="occupation"
            value={personaData.occupation}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
            placeholder="e.g., Working Professional"
          />
        </div>

        {/* Income Range */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Income Range *
          </label>
          <input
            type="text"
            name="income_range"
            value={personaData.income_range}
            onChange={handleChange}
            required
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
            placeholder="e.g., 3-6Lpa"
          />
        </div>

        {/* Sample Size */}
        <div>
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Sample Size *
          </label>
          <input
            type="number"
            name="sample_size"
            value={personaData.sample_size}
            onChange={handleChange}
            required
            min="1"
            className="w-full p-3 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-primary"
            placeholder="e.g., 50"
          />
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-red-100 dark:bg-red-900/20 border border-red-400 dark:border-red-900 rounded-lg text-red-700 dark:text-red-400">
            {error.message || 'An error occurred while creating the persona'}
          </div>
        )}

        {/* Submit Button */}
        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-gradient-to-r from-blue-primary to-blue-primary-dark dark:from-primary dark:to-primary-dark text-white rounded-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            {loading ? 'Creating Persona...' : 'Create Persona'}
          </button>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:scale-105 transition-transform font-medium"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default AddPersona;