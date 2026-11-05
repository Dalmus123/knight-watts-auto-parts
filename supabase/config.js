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
  // Supabase project URL
  url: 'https://selvxrprxbkznxtfesxe.supabase.co',
  
  // Supabase anon/public key (safe for client-side use)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNlbHZ4cnByeGJrem54dGZlc3hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4MDExNTYsImV4cCI6MjEwOTM3NzE1Nn0.c5uB-kHqw0UbWlYF6OlcvZumm7q2KaOF4iHKUPoxiT4',
  
  // Storage bucket names
  buckets: {
    products: 'products',
    customRequests: 'custom_requests',
    printJobs: 'print_jobs'
  }
};

// Initialize Supabase client (requires @supabase/supabase-js)
function initSupabase() {
  if (typeof window !== 'undefined' && window.supabase && window.supabase.createClient) {
    return window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  }
  console.error('Supabase client library not loaded. Include: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  return null;
}

// Check if config is set up
function isConfigured() {
  return supabaseConfig.url && 
         supabaseConfig.url.includes('supabase.co') &&
         supabaseConfig.anonKey && 
         supabaseConfig.anonKey.length > 20;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { supabaseConfig, initSupabase, isConfigured };
}
