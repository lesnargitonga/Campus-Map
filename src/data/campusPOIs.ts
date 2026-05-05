export type CampusPOI = {
  id: string;
  name: string;
  category: 'academic' | 'service' | 'food' | 'sports' | 'residence' | 'health' | 'security' | 'other';
  coords: [number, number]; // [lng, lat]
  tags?: string[];
  description?: string;
};

export const CAMPUS_POIS: CampusPOI[] = [
  // Core academic & services (updated coordinates will override earlier rough guesses when possible)
  { id: 'gate_a', name: 'University Gate A', category: 'security', coords: [36.8792948, -1.2197484], tags:['entry','gate'] },
  { id: 'gate_b', name: 'University Gate B', category: 'security', coords: [36.8798788, -1.2138972], tags:['entry','gate'] },
  { id: 'ict_parking', name: 'ICT Center Parking Lot', category: 'service', coords: [36.8788591, -1.2184508], tags:['parking'] },
  { id: 'lib_parking', name: 'Library Parking Lot', category: 'service', coords: [36.8792899, -1.2162271], tags:['parking'] },
  { id: 'auditorium_parking', name: 'Auditorium Parking Lot', category: 'service', coords: [36.8782067, -1.2162582], tags:['parking','auditorium'] },
  { id: 'science_parking', name: 'Science Complex Parking Lot', category: 'service', coords: [36.8784483, -1.2155931], tags:['parking','science'] },
  { id: 'humanities_parking', name: 'Humanities Parking Lot', category: 'service', coords: [36.879588, -1.213963], tags:['parking','humanities'] },
  { id: 'admin_finance', name: 'Admin & Finance Offices', category: 'service', coords: [36.879137, -1.218747], tags:['administration','finance'] },
  { id: 'cafelatta', name: 'Cafelatta Cafe', category: 'food', coords: [36.878073, -1.218036], tags:['cafe','coffee'] },
  { id: 'bus_parking', name: 'Bus Parking Lot', category: 'service', coords: [36.877812, -1.217604], tags:['transport','parking'] },
  { id: 'library', name: 'USIU Library', category: 'academic', coords: [36.8789134, -1.2165420], tags:['study','quiet'] },
  { id: 'grad_square', name: 'Graduation Square', category: 'other', coords: [36.87867, -1.2170163], tags:['events','ceremony'] },
  { id: 'auditorium', name: 'Auditorium', category: 'academic', coords: [36.8783533, -1.2167502], tags:['events','lecture'] },
  { id: 'basketball', name: 'Basketball Court', category: 'sports', coords: [36.8777776, -1.2170091], tags:['sports'] },
  { id: 'stud_center', name: 'Student Center', category: 'service', coords: [36.8777366, -1.2156204], tags:['students','hub'] },
  { id: 'freida_brown', name: 'Freida Brown Student Centre', category: 'service', coords: [36.8776414, -1.2156737], tags:['students','social'] },
  { id: 'main_campus', name: 'Main Campus (Central)', category: 'other', coords: [36.8792139, -1.2180945], tags:['campus'] },
  { id: 'cs_business', name: 'Chandaria School of Business', category: 'academic', coords: [36.8794685, -1.2173365], tags:['business'] },
  { id: 'grad_studies', name: 'School of Graduate Studies', category: 'academic', coords: [36.8791321, -1.2170449], tags:['graduate'] },
  { id: 'main_comp_lab', name: 'Main Computer Lab', category: 'academic', coords: [36.8794685, -1.2183654], tags:['computers','lab'] },
  { id: 'humanities', name: 'School of Humanities & Social Sciences', category: 'academic', coords: [36.8786545, -1.2141527], tags:['humanities','social'] },
  { id: 'science_building', name: 'Science Building', category: 'academic', coords: [36.87867, -1.2150795], tags:['science'] },
  { id: 'swimming_pool', name: 'Swimming Pool', category: 'sports', coords: [36.8777691, -1.2149567], tags:['sports','recreation'] },
  { id: 'metrocare_clinic', name: 'Metrocare Health Clinic', category: 'health', coords: [36.8791, -1.2184], tags:['health','clinic'] },
  { id: 'sironi_cafe', name: 'Sironi Cafeteria', category: 'food', coords: [36.8788588, -1.2135371], tags:['food','dining'] },
  { id: 'playing_field', name: 'Playing Field', category: 'sports', coords: [36.8798467, -1.2100982], tags:['sports','field'] },
  { id: 'student_hostels', name: 'Student Hostels', category: 'residence', coords: [36.8782498, -1.2179309], tags:['housing','residence'] },
];

export const CATEGORIES: { key: CampusPOI['category']; label: string }[] = [
  { key: 'academic', label: 'Academic' },
  { key: 'service', label: 'Services' },
  { key: 'food', label: 'Food' },
  { key: 'sports', label: 'Sports' },
  { key: 'residence', label: 'Residence' },
  { key: 'health', label: 'Health' },
  { key: 'security', label: 'Security' },
  { key: 'other', label: 'Other' }
];

// Shared category color palette (kept in sync with map layer styling)
export const CATEGORY_COLORS: Record<CampusPOI['category'], string> = {
  academic: '#1f77b4',
  service: '#2ca02c',
  food: '#ff7f0e',
  sports: '#d62728',
  residence: '#9467bd',
  health: '#17becf',
  security: '#8c564b',
  other: '#7f7f7f',
};
