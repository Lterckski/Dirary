import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSupabase } from '@dirary/shared';

export const supabase = createSupabase(
  { url: process.env.EXPO_PUBLIC_SUPABASE_URL, key: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
  { storage: AsyncStorage },
);
