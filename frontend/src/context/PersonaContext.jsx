import { createContext, useContext, useState, useEffect } from "react";

const PersonaContext = createContext();

export const usePersonas = () => useContext(PersonaContext);

export const PersonaProvider = ({ children }) => {
  const [personas, setPersonas] = useState([]);

  // Fetch all personas
  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        const res = await fetch("/api/personas");
        const data = await res.json();
        setPersonas(data);
      } catch (err) {
        console.error("Error fetching personas:", err);
      }
    };
    fetchPersonas();
  }, []);

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
