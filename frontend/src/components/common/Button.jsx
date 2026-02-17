// src/components/Button.jsx
import React from "react";

const Button = ({ label, onClick, type = "button" }) => {
  return (
    <button
      type={type}
      onClick={onClick}
      className="w-full bg-gradient-to-r from-primary to-primary-dark hover:shadow-glow text-white font-semibold py-2.5 px-4 rounded-lg transition duration-300 transform hover:scale-[1.02] shadow-lg mt-5"
    >
      {label}
    </button>
  );
};

export default Button;
