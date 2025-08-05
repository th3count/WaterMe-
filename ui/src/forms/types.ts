// Shared form types and interfaces
export interface PlantEntry {
  plant_id: number;
  common_name: string;
  watering_frequency?: string[];
  preferred_time?: string[];
  alternative_name?: string;
  latin_name?: string;
  compatible_watering_frequencies?: string[];
  compatible_watering_times?: string[];
  watering_cycles?: number[];
  root_area_sqft?: number;
  water_optimal_in_week?: number;
  tolerance_min_in_week?: number;
  tolerance_max_in_week?: number;
  usda_zones?: string;
  soil_preference?: string;
  soil_type?: string;
  soil_ph?: string;
  sun_exposure?: string;
  fruiting_period?: string;
  planting_time?: string;
  spacing_inches?: number;
  growth_type?: string;
}

export interface AssignedPlant {
  plant: PlantEntry;
  quantity: number;
  emitterSize: number;
  zoneId: number;
  location_id: number;
  instanceId: string;
  comments?: string;
}

export interface Location {
  location_id: number;
  name: string;
  description: string;
  zones: number[];
  assignedPlants?: AssignedPlant[];
}

export interface Zone {
  zone_id: number;
  comment: string;
  period: string;
  cycles: number;
  mode?: string;
  scheduleMode?: string;
  times?: { start_time: string; duration: string }[];
  time?: { start_time: string; duration: string };
  startDay?: string;
  pin?: number;
}

export interface GardenSettings {
  garden_name: string;
  gps_lat: number;
  gps_lon: number;
  city: string;
  timezone: string;
  timer_multiplier: number;
  mode: string;
  simulate?: boolean;
}

export interface GpioConfig {
  channels: { [key: string]: number };
  mode: string;
  pumpIndex?: number;
  activeLow?: boolean;
  zoneCount?: number;
  pins?: number[];
}

export interface FormValidationErrors {
  [key: string]: string;
}

export interface FormProps {
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  initialData?: any;
  loading?: boolean;
  error?: string;
  isTopLayer?: boolean;
  onLayerChange?: (formId: string, isTop: boolean) => void;
}

export interface FormLayerState {
  activeFormId: string | null;
  formStack: string[];
} 