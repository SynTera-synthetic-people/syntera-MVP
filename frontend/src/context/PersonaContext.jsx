import { createContext, useContext, useState } from "react";

const PersonaContext = createContext();

export const usePersonas = () => useContext(PersonaContext);

export const PersonaProvider = ({ children }) => {
  const [personas, setPersonas] = useState([]);

  // Add persona
  const addPersona = (persona) => {
    setPersonas((prev) => [...prev, persona]);
  };

  // Update persona
  const updatePersona = (id, updated) => {
    setPersonas((prev) =>
      prev.map((p) => (p.id === id ? updated : p))
    );
  };

  return (
    <PersonaContext.Provider value={{ personas, addPersona, updatePersona }}>
      {children}
    </PersonaContext.Provider>
  );
};
