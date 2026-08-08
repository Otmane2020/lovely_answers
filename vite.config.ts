import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";
import path from "path";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://pnohfokjlhpzrkczruju.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBub2hmb2tqbGhwenJrY3pydWp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcwMjY3MTcsImV4cCI6MjA4MjYwMjcxN30.AArRVf5Fsgu1_qCSqbGQz0fFaN3qy1DTiLqeb92umKA";

const supabaseProjectId =
  process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  "pnohfokjlhpzrkczruju";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mcpPlugin()],
  define: {
    "process.env.NEXT_PUBLIC_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
    "process.env.NEXT_PUBLIC_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabasePublishableKey),
    "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Shim Next.js imports for Vite preview
      "next/link": path.resolve(__dirname, "./src/shims/next-link.tsx"),
      "next/navigation": path.resolve(__dirname, "./src/shims/next-navigation.ts"),
      "next/image": path.resolve(__dirname, "./src/shims/next-image.tsx"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
}));
