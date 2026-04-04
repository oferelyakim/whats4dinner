import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zgebzhvbszhqvaryfiwk.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpnZWJ6aHZic3pocXZhcnlmaXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNTIxNTksImV4cCI6MjA5MDgyODE1OX0.QKrITenbJxm8QkxQpH14yRWjrsc8mx9ihmzaHQmO1zk'

export const isSupabaseConfigured = true

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
