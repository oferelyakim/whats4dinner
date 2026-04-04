import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey)

if (!isSupabaseConfigured) {
  console.warn('W4D: Supabase not configured. URL:', supabaseUrl, 'Key present:', !!supabaseAnonKey)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
