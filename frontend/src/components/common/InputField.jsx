
import React from "react";

const InputField = ({ label, name, value, onChange, error, placeholder }) => {
  return (
    <div className="flex flex-col space-y-1">
      <label className="text-sm font-semibold text-blue-primary-dark dark:text-blue-primary-lighter">
        {label}
      </label>

      <input
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full px-4 py-2 bg-white dark:bg-black-primary-light border border-gray-300 dark:border-dark-border rounded-lg focus:ring focus:ring-blue-primary-light text-blue-primary-dark dark:text-white"
      />

      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
};


export default InputField;
