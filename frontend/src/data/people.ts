const BASE = 'https://images.pexels.com/photos';
const PARAMS = '?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop';

const ids = [
  614810, 774909, 1222271, 1239291, 733872, 1065084, 1043471, 415829,
  2379004, 1181519, 1462980, 697509, 1036623, 1181686, 2182970, 1516680,
  1587009, 1898555, 2128807, 3778603, 3763188, 91227, 2709388, 3785079,
  3775534, 874158, 839011, 3776932, 2380794, 3771089, 1130626, 1681010,
  3184611, 2381069, 1300402, 1121796, 3756616, 3792581, 3769021, 3831645,
  1212984, 3785074, 3775087, 3783716, 3770254, 3789888, 3782235, 3789104,
  3786525, 3778966, 428364, 834863, 1024311, 1043474, 1081685, 1239288,
  1270076, 1382731, 1382734, 1542085, 1559486, 1580271, 1587014, 1681007,
  1820656, 1821095, 1848565, 1858175, 1933873, 2007647, 2050994, 2104252,
  2169434, 2380795, 2589653, 2613260, 2690323, 2726111, 2770600, 2774292,
  1516680, 1587009, 614810, 774909, 1222271, 733872, 1065084, 1043471,
  415829, 2379004, 1181519, 1462980, 697509, 1036623, 2182970, 1898555,
  2128807, 3778603, 3763188, 91227, 2709388, 3785079, 3775534, 874158,
  839011, 3776932, 2380794, 3771089, 1130626, 1681010, 3184611, 2381069,
  1300402, 1121796, 3756616, 3792581, 3769021, 3831645, 1212984, 3785074,
  3775087, 3783716, 3770254, 3789888, 3782235, 3789104, 3786525, 3778966,
  428364, 834863, 1024311, 1043474, 1081685, 1239288, 1270076, 1382731,
  1382734, 1542085, 1559486, 1580271, 1587014, 1681007, 1820656, 1821095,
  1848565, 1858175, 1933873, 2007647, 2050994, 2104252, 2169434, 2380795,
  2589653, 2613260, 2690323, 2726111, 2770600, 2774292, 1239291, 1181686,
] as const;

export const PEOPLE_IMAGES = ids.map(
  (id) => `${BASE}/${id}/pexels-photo-${id}.jpeg${PARAMS}`
) as readonly string[];

export const PERSON_NAMES = [
  'Sarah Chen', 'Marcus Johnson', 'Aiko Tanaka', 'Priya Sharma', 'James Wilson',
  'Elena Rodriguez', 'Kofi Asante', 'Marie Laurent', 'Hiroshi Yamamoto', 'Fatima Al-Rashid',
  'Lucas Silva', 'Anna Petrov', 'David Kim', 'Sofia Morales', 'Thomas Mueller',
  'Amara Okafor', 'Isabella Costa', 'Raj Patel', 'Emma Larsson', 'Miguel Santos',
  'Yuki Watanabe', 'Olivia Hart', 'Ahmed Hassan', 'Chloe Dubois', 'Daniel Osei',
  'Hannah Berg', 'Carlos Mendez', 'Lily Nguyen', 'Omar Diallo', 'Natasha Volkov',
  'Wei Zhang', 'Grace Muthoni', 'Liam O\'Brien', 'Zara Khan', 'Felix Braun',
  'Maya Johal', 'Samuel Tetteh', 'Ines Guerrero', 'Kenji Ito', 'Eva Lindqvist',
  'Ryan Cooper', 'Nadia Benali', 'Victor Almeida', 'Suki Park', 'Elias Roth',
  'Ayumi Sato', 'Noah Fischer', 'Camila Vargas', 'Ivan Kozlov', 'Leah Thompson',
  'Arjun Desai', 'Freya Olsen', 'Mateo Ruiz', 'Hana Kato', 'Ben Archer',
  'Rosa Bianchi', 'Tariq Mansour', 'Ingrid Dahl', 'Jorge Castillo', 'Mei Lin',
] as const;

export const PERSON_PROFESSIONS = [
  'Software Engineer', 'Product Designer', 'Data Scientist', 'Marketing Director',
  'UX Researcher', 'Financial Analyst', 'Startup Founder', 'Content Strategist',
  'AI Engineer', 'Brand Consultant', 'Operations Manager', 'Creative Director',
  'Full-Stack Developer', 'Growth Strategist', 'Behavioral Economist', 'Product Manager',
  'Venture Capitalist', 'Neuroscientist', 'Supply Chain Analyst', 'Copywriter',
  'DevOps Engineer', 'Investment Banker', 'Clinical Psychologist', 'Architect',
  'Blockchain Developer', 'Sustainability Consultant', 'Biotech Researcher', 'Art Director',
  'Cybersecurity Analyst', 'Journalist', 'Forensic Accountant', 'Civil Engineer',
  'Pharmacist', 'Film Director', 'Translator', 'Economist',
] as const;

export const PERSON_COUNTRIES = [
  'United States', 'Japan', 'Germany', 'India', 'Brazil',
  'United Kingdom', 'France', 'South Korea', 'Nigeria', 'Canada',
  'Australia', 'Mexico', 'Italy', 'Kenya', 'Sweden',
  'Singapore', 'South Africa', 'Netherlands', 'Colombia', 'Egypt',
  'Spain', 'Thailand', 'Russia', 'Argentina', 'Morocco',
  'Indonesia', 'Norway', 'Chile', 'Turkey', 'Ghana',
  'Portugal', 'Vietnam', 'Poland', 'Peru', 'New Zealand',
  'Philippines', 'Denmark', 'Malaysia', 'Israel', 'Switzerland',
] as const;