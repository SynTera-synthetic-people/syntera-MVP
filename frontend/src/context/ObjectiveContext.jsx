import { createContext, useContext, useState } from "react";

const ObjectiveContext = createContext();

export const ObjectiveProvider = ({ children }) => {
  const [objectives, setObjectives] = useState([
    {
      id: "1",
      title: "Consumer Behavior Study",
      description: "Understanding purchase patterns and decision-making process",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      title: "BMW Buyer Psychology",
      description: "Study Indian premium car buyers' aspirations and motivations",
      createdAt: new Date().toISOString(),
    },
  ]);
  const deleteObjective = (id) => {
    setObjectives((prev) => prev.filter((obj) => obj.id !== id));
  };

  return (
    <ObjectiveContext.Provider value={{ objectives, setObjectives, deleteObjective }}>
      {children}
    </ObjectiveContext.Provider>
  );
};

export const useObjectives = () => useContext(ObjectiveContext);
