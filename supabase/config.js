/**
 * Supabase Configuration
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a Supabase project at https://supabase.com
 * 2. Copy your project URL and anon key from Project Settings > API
 * 3. Replace the placeholder values below with your actual credentials
 * 4. NEVER commit real keys to Git - use environment variables in production
 */

const supabaseConfig = {
  // Replace with your Supabase project URL
  url: process.env.SUPABASE_URL || 'YOUR_SUPABASE_URL_HERE',
  
  // Replace with your Supabase anon/public key (safe for client-side)
  anonKey: process.env.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY_HERE',
  
  // Storage bucket names
  buckets: {
    products: 'products',
    customRequests: 'custom_requests',
    printJobs: 'print_jobs'
  }
};

// Initialize Supabase client (requires @supabase/supabase-js)
let supabase = null;

function initSupabase() {
  if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
    supabase = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
    return supabase;
  }
  console.error('Supabase client library not loaded. Include: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  return null;
}

// Check if config is set up
function isConfigured() {
  return supabaseConfig.url !== 'YOUR_SUPABASE_URL_HERE' && 
         supabaseConfig.anonKey !== 'YOUR_SUPABASE_ANON_KEY_HERE';
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { supabaseConfig, initSupabase, isConfigured };
}
