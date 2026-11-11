import Constants from 'expo-constants';

/** false, wenn der Build ohne GOOGLE_MAPS_API_KEY erstellt wurde */
export const mapsConfigured: boolean = Constants.expoConfig?.extra?.mapsConfigured !== false;
