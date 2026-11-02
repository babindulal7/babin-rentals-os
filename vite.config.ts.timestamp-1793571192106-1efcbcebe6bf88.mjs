// vite.config.ts
import { defineConfig } from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { VitePWA } from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\use\\Desktop\\babin-rentals-os";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "robots.txt", "icons/*.png"],
      manifest: {
        name: "Babin Rentals OS",
        short_name: "Babin",
        id: "/",
        start_url: "/?source=pwa",
        scope: "/",
        display: "standalone",
        display_override: ["window-controls-overlay", "standalone"],
        orientation: "any",
        /* DESIGN_DIRECTION_SPEC_v4.2 §2.1/§3 — the installed app opens LIGHT,
           so the splash and window chrome are the cream canvas, matching
           index.html's <meta name="theme-color">. These two must be changed
           together with that meta tag: they are what the OS paints BEFORE the
           app has run, and #0F1420 left the installed app flashing a full
           screen of dark navy into a cream app on every cold launch. (#0F1420
           was not even the dark canvas — that is #050B12.) */
        background_color: "#FDEFDC",
        theme_color: "#FDEFDC",
        lang: "en",
        dir: "ltr",
        categories: ["business", "productivity"],
        icons: [
          { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ],
        shortcuts: [
          { name: "Scan", url: "/scan", icons: [{ src: "/icons/scan-96.png", sizes: "96x96" }] },
          { name: "Today", url: "/today" },
          { name: "New Rental", url: "/rentals/new" },
          { name: "Packing", url: "/operations/packing" }
        ]
      },
      workbox: {
        /*
         * Workbox's default `globPatterns` is `**' + '/*.{js,wasm,css,html}` — no
         * font formats. That silently left all 30+ `.woff2`/`.woff` files out of
         * the precache manifest, including `hind-devanagari-*` and
         * `asar-devanagari-*`, while their @font-face stylesheets WERE precached.
         * Offline, the shell painted, the CSS asked for the Devanagari faces, and
         * nothing answered — so Nepali fell back to a system face on the one
         * device class that needs it most. Foundation §3.3 requires Devanagari
         * month names (`साउन`) under the Nepali toggle, and the whole reason the
         * fonts were self-hosted in the first place (4 Aug) was that a CDN
         * `<link>` fails silently in exactly this situation.
         *
         * `ico`/`png`/`svg` join it so the manifest icons and favicon survive a
         * cold offline launch too.
         *
         * Cost: the four self-hosted families are ~740 KB of woff2 in `dist`,
         * which is now downloaded once at install rather than lazily. That is
         * the correct trade for an app whose stated premise is that the
         * warehouse has no signal.
         */
        globPatterns: ["**/*.{js,wasm,css,html,ico,png,svg,woff2}"],
        globIgnores: [
          "**/*.woff",
          "**/*-cyrillic-*",
          "**/*-greek-*",
          "**/*-vietnamese-*",
          "**/*-latin-ext-*"
        ],
        navigationPreload: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(equipment|clients|bundles|categories|warehouses|settings)/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "supabase-reference-data",
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60
                // 1 week
              }
            }
          },
          {
            urlPattern: /^https:\/\/[^/]+\.supabase\.co\/rest\/v1\/(bookings|booking_items)/,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-operational-data",
              expiration: {
                maxEntries: 1e3,
                maxAgeSeconds: 24 * 60 * 60
                // 1 day
              },
              networkTimeoutSeconds: 3
            }
          }
        ]
      }
    })
  ],
  build: {
    /* Explicitly off, not merely defaulted. Rentman ships `*.js.map` with
       `sourcesContent` in its production bundle, which is how the 30 Aug 2026
       forensics pack reconstructed 1,500 of their source paths, their whole
       route tree, and their enum values. Same stack as ours. Keep this pinned
       so no config edit or Capacitor template flips it silently, and re-verify
       the wrapped bundle before any store upload. */
    sourcemap: false,
    rollupOptions: {
      /* Two documents, deliberately. `marketing.html` is the public site; it
         must not pull the ops app's bundle (Supabase, dexie, the router, every
         module) down to a first-time visitor, and its Tailwind stylesheet must
         not reach the app — see src/marketing/marketing.css for why that
         isolation is load-bearing. */
      input: {
        main: path.resolve(__vite_injected_original_dirname, "index.html"),
        marketing: path.resolve(__vite_injected_original_dirname, "marketing.html")
      },
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-icons": ["@tabler/icons-react"],
          "vendor-scanner": ["@zxing/browser", "@zxing/library"],
          "vendor-dexie": ["dexie"],
          "vendor-gsap": ["gsap", "@gsap/react"],
          "vendor-charts": ["recharts"],
          "vendor-base-ui": ["@base-ui/react"]
        }
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
      "@babin-rentals/design-tokens": path.resolve(__vite_injected_original_dirname, "./packages/design-tokens/src/index.ts")
    }
  },
  server: {
    // Managed checkouts can share dependencies; allow their self-hosted fonts.
    fs: { allow: [__vite_injected_original_dirname, fs.realpathSync(path.resolve(__vite_injected_original_dirname, "node_modules"))] },
    port: process.env["PORT"] ? Number(process.env["PORT"]) : 3e3,
    host: true,
    allowedHosts: [
      ".ngrok-free.app",
      ".ngrok-free.dev",
      ".ngrok.app",
      ".ngrok.io",
      /* Pinggy hands out a different suffix per tunnel type — a free tunnel
         returns BOTH `*.free.pinggy.net` and `*.run.pinggy-free.link`, and paid
         subdomains land on `*.pinggy.link`. Allow all of them; a missing suffix
         fails as a bare 403 "Blocked request" that looks like a tunnel fault. */
      ".pinggy.net",
      ".pinggy-free.link",
      ".pinggy.link",
      ".pinggy.io",
      ".pinggy.online",
      ".trycloudflare.com"
    ],
    watch: {
      ignored: ["**/tmp/**", "**/__rar_*", "**/*.rartemp", "**/*.rar", "**/*.zip", "**/*.7z", "**/*.tar*", "**/.tmp-*", "**/.claude/**", "**/artifacts/**", "**/.system_generated/**", "**/.worktrees/**"]
    }
  },
  preview: {
    /* `vite preview` carries its own host check (Vite >= 5.4.12), separate from
       `server.allowedHosts` above. The tunnel hits preview, not dev, whenever the
       offline layer is under test — the dev server registers no service worker at
       all (`devOptions` is unset), so airplane-mode behaviour is only observable
       against a built bundle. */
    allowedHosts: [
      ".ngrok-free.app",
      ".ngrok-free.dev",
      ".ngrok.app",
      ".ngrok.io",
      /* Pinggy hands out a different suffix per tunnel type — a free tunnel
         returns BOTH `*.free.pinggy.net` and `*.run.pinggy-free.link`, and paid
         subdomains land on `*.pinggy.link`. Allow all of them; a missing suffix
         fails as a bare 403 "Blocked request" that looks like a tunnel fault. */
      ".pinggy.net",
      ".pinggy-free.link",
      ".pinggy.link",
      ".pinggy.io",
      ".pinggy.online",
      ".trycloudflare.com"
    ]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VcXFxcRGVza3RvcFxcXFxiYWJpbi1yZW50YWxzLW9zXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VcXFxcRGVza3RvcFxcXFxiYWJpbi1yZW50YWxzLW9zXFxcXHZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy91c2UvRGVza3RvcC9iYWJpbi1yZW50YWxzLW9zL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tICdAdGFpbHdpbmRjc3Mvdml0ZSdcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCBmcyBmcm9tICdub2RlOmZzJ1xuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gJ3ZpdGUtcGx1Z2luLXB3YSdcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgdGFpbHdpbmRjc3MoKSxcbiAgICBWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5jbHVkZUFzc2V0czogWydmYXZpY29uLmljbycsICdyb2JvdHMudHh0JywgJ2ljb25zLyoucG5nJ10sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnQmFiaW4gUmVudGFscyBPUycsXG4gICAgICAgIHNob3J0X25hbWU6ICdCYWJpbicsXG4gICAgICAgIGlkOiAnLycsXG4gICAgICAgIHN0YXJ0X3VybDogJy8/c291cmNlPXB3YScsXG4gICAgICAgIHNjb3BlOiAnLycsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgZGlzcGxheV9vdmVycmlkZTogWyd3aW5kb3ctY29udHJvbHMtb3ZlcmxheScsICdzdGFuZGFsb25lJ10sXG4gICAgICAgIG9yaWVudGF0aW9uOiAnYW55JyxcbiAgICAgICAgLyogREVTSUdOX0RJUkVDVElPTl9TUEVDX3Y0LjIgXHUwMEE3Mi4xL1x1MDBBNzMgXHUyMDE0IHRoZSBpbnN0YWxsZWQgYXBwIG9wZW5zIExJR0hULFxuICAgICAgICAgICBzbyB0aGUgc3BsYXNoIGFuZCB3aW5kb3cgY2hyb21lIGFyZSB0aGUgY3JlYW0gY2FudmFzLCBtYXRjaGluZ1xuICAgICAgICAgICBpbmRleC5odG1sJ3MgPG1ldGEgbmFtZT1cInRoZW1lLWNvbG9yXCI+LiBUaGVzZSB0d28gbXVzdCBiZSBjaGFuZ2VkXG4gICAgICAgICAgIHRvZ2V0aGVyIHdpdGggdGhhdCBtZXRhIHRhZzogdGhleSBhcmUgd2hhdCB0aGUgT1MgcGFpbnRzIEJFRk9SRSB0aGVcbiAgICAgICAgICAgYXBwIGhhcyBydW4sIGFuZCAjMEYxNDIwIGxlZnQgdGhlIGluc3RhbGxlZCBhcHAgZmxhc2hpbmcgYSBmdWxsXG4gICAgICAgICAgIHNjcmVlbiBvZiBkYXJrIG5hdnkgaW50byBhIGNyZWFtIGFwcCBvbiBldmVyeSBjb2xkIGxhdW5jaC4gKCMwRjE0MjBcbiAgICAgICAgICAgd2FzIG5vdCBldmVuIHRoZSBkYXJrIGNhbnZhcyBcdTIwMTQgdGhhdCBpcyAjMDUwQjEyLikgKi9cbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyNGREVGREMnLFxuICAgICAgICB0aGVtZV9jb2xvcjogJyNGREVGREMnLFxuICAgICAgICBsYW5nOiAnZW4nLFxuICAgICAgICBkaXI6ICdsdHInLFxuICAgICAgICBjYXRlZ29yaWVzOiBbJ2J1c2luZXNzJywgJ3Byb2R1Y3Rpdml0eSddLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnL2ljb25zLzE5Mi5wbmcnLCBzaXplczogJzE5MngxOTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zLzUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL21hc2thYmxlLTUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ21hc2thYmxlJyB9XG4gICAgICAgIF0sXG4gICAgICAgIHNob3J0Y3V0czogW1xuICAgICAgICAgIHsgbmFtZTogJ1NjYW4nLCB1cmw6ICcvc2NhbicsIGljb25zOiBbeyBzcmM6ICcvaWNvbnMvc2Nhbi05Ni5wbmcnLCBzaXplczogJzk2eDk2JyB9XSB9LFxuICAgICAgICAgIHsgbmFtZTogJ1RvZGF5JywgdXJsOiAnL3RvZGF5JyB9LFxuICAgICAgICAgIHsgbmFtZTogJ05ldyBSZW50YWwnLCB1cmw6ICcvcmVudGFscy9uZXcnIH0sXG4gICAgICAgICAgeyBuYW1lOiAnUGFja2luZycsIHVybDogJy9vcGVyYXRpb25zL3BhY2tpbmcnIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIHdvcmtib3g6IHtcbiAgICAgICAgLypcbiAgICAgICAgICogV29ya2JveCdzIGRlZmF1bHQgYGdsb2JQYXR0ZXJuc2AgaXMgYCoqJyArICcvKi57anMsd2FzbSxjc3MsaHRtbH1gIFx1MjAxNCBub1xuICAgICAgICAgKiBmb250IGZvcm1hdHMuIFRoYXQgc2lsZW50bHkgbGVmdCBhbGwgMzArIGAud29mZjJgL2Aud29mZmAgZmlsZXMgb3V0IG9mXG4gICAgICAgICAqIHRoZSBwcmVjYWNoZSBtYW5pZmVzdCwgaW5jbHVkaW5nIGBoaW5kLWRldmFuYWdhcmktKmAgYW5kXG4gICAgICAgICAqIGBhc2FyLWRldmFuYWdhcmktKmAsIHdoaWxlIHRoZWlyIEBmb250LWZhY2Ugc3R5bGVzaGVldHMgV0VSRSBwcmVjYWNoZWQuXG4gICAgICAgICAqIE9mZmxpbmUsIHRoZSBzaGVsbCBwYWludGVkLCB0aGUgQ1NTIGFza2VkIGZvciB0aGUgRGV2YW5hZ2FyaSBmYWNlcywgYW5kXG4gICAgICAgICAqIG5vdGhpbmcgYW5zd2VyZWQgXHUyMDE0IHNvIE5lcGFsaSBmZWxsIGJhY2sgdG8gYSBzeXN0ZW0gZmFjZSBvbiB0aGUgb25lXG4gICAgICAgICAqIGRldmljZSBjbGFzcyB0aGF0IG5lZWRzIGl0IG1vc3QuIEZvdW5kYXRpb24gXHUwMEE3My4zIHJlcXVpcmVzIERldmFuYWdhcmlcbiAgICAgICAgICogbW9udGggbmFtZXMgKGBcdTA5MzhcdTA5M0VcdTA5MDlcdTA5MjhgKSB1bmRlciB0aGUgTmVwYWxpIHRvZ2dsZSwgYW5kIHRoZSB3aG9sZSByZWFzb24gdGhlXG4gICAgICAgICAqIGZvbnRzIHdlcmUgc2VsZi1ob3N0ZWQgaW4gdGhlIGZpcnN0IHBsYWNlICg0IEF1Zykgd2FzIHRoYXQgYSBDRE5cbiAgICAgICAgICogYDxsaW5rPmAgZmFpbHMgc2lsZW50bHkgaW4gZXhhY3RseSB0aGlzIHNpdHVhdGlvbi5cbiAgICAgICAgICpcbiAgICAgICAgICogYGljb2AvYHBuZ2AvYHN2Z2Agam9pbiBpdCBzbyB0aGUgbWFuaWZlc3QgaWNvbnMgYW5kIGZhdmljb24gc3Vydml2ZSBhXG4gICAgICAgICAqIGNvbGQgb2ZmbGluZSBsYXVuY2ggdG9vLlxuICAgICAgICAgKlxuICAgICAgICAgKiBDb3N0OiB0aGUgZm91ciBzZWxmLWhvc3RlZCBmYW1pbGllcyBhcmUgfjc0MCBLQiBvZiB3b2ZmMiBpbiBgZGlzdGAsXG4gICAgICAgICAqIHdoaWNoIGlzIG5vdyBkb3dubG9hZGVkIG9uY2UgYXQgaW5zdGFsbCByYXRoZXIgdGhhbiBsYXppbHkuIFRoYXQgaXNcbiAgICAgICAgICogdGhlIGNvcnJlY3QgdHJhZGUgZm9yIGFuIGFwcCB3aG9zZSBzdGF0ZWQgcHJlbWlzZSBpcyB0aGF0IHRoZVxuICAgICAgICAgKiB3YXJlaG91c2UgaGFzIG5vIHNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyx3YXNtLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYyfSddLFxuICAgICAgICBnbG9iSWdub3JlczogW1xuICAgICAgICAgICcqKi8qLndvZmYnLFxuICAgICAgICAgICcqKi8qLWN5cmlsbGljLSonLFxuICAgICAgICAgICcqKi8qLWdyZWVrLSonLFxuICAgICAgICAgICcqKi8qLXZpZXRuYW1lc2UtKicsXG4gICAgICAgICAgJyoqLyotbGF0aW4tZXh0LSonLFxuICAgICAgICBdLFxuICAgICAgICBuYXZpZ2F0aW9uUHJlbG9hZDogdHJ1ZSxcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL1teL10rXFwuc3VwYWJhc2VcXC5jb1xcL3Jlc3RcXC92MVxcLyhlcXVpcG1lbnR8Y2xpZW50c3xidW5kbGVzfGNhdGVnb3JpZXN8d2FyZWhvdXNlc3xzZXR0aW5ncykvLFxuICAgICAgICAgICAgaGFuZGxlcjogJ1N0YWxlV2hpbGVSZXZhbGlkYXRlJyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc3VwYWJhc2UtcmVmZXJlbmNlLWRhdGEnLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogNTAwLFxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDcgKiAyNCAqIDYwICogNjAgLy8gMSB3ZWVrXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvW14vXStcXC5zdXBhYmFzZVxcLmNvXFwvcmVzdFxcL3YxXFwvKGJvb2tpbmdzfGJvb2tpbmdfaXRlbXMpLyxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdzdXBhYmFzZS1vcGVyYXRpb25hbC1kYXRhJyxcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDEwMDAsXG4gICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogMjQgKiA2MCAqIDYwIC8vIDEgZGF5XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogM1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfVxuICAgIH0pXG4gIF0sXG4gIGJ1aWxkOiB7XG4gICAgLyogRXhwbGljaXRseSBvZmYsIG5vdCBtZXJlbHkgZGVmYXVsdGVkLiBSZW50bWFuIHNoaXBzIGAqLmpzLm1hcGAgd2l0aFxuICAgICAgIGBzb3VyY2VzQ29udGVudGAgaW4gaXRzIHByb2R1Y3Rpb24gYnVuZGxlLCB3aGljaCBpcyBob3cgdGhlIDMwIEF1ZyAyMDI2XG4gICAgICAgZm9yZW5zaWNzIHBhY2sgcmVjb25zdHJ1Y3RlZCAxLDUwMCBvZiB0aGVpciBzb3VyY2UgcGF0aHMsIHRoZWlyIHdob2xlXG4gICAgICAgcm91dGUgdHJlZSwgYW5kIHRoZWlyIGVudW0gdmFsdWVzLiBTYW1lIHN0YWNrIGFzIG91cnMuIEtlZXAgdGhpcyBwaW5uZWRcbiAgICAgICBzbyBubyBjb25maWcgZWRpdCBvciBDYXBhY2l0b3IgdGVtcGxhdGUgZmxpcHMgaXQgc2lsZW50bHksIGFuZCByZS12ZXJpZnlcbiAgICAgICB0aGUgd3JhcHBlZCBidW5kbGUgYmVmb3JlIGFueSBzdG9yZSB1cGxvYWQuICovXG4gICAgc291cmNlbWFwOiBmYWxzZSxcbiAgICByb2xsdXBPcHRpb25zOiB7XG4gICAgICAvKiBUd28gZG9jdW1lbnRzLCBkZWxpYmVyYXRlbHkuIGBtYXJrZXRpbmcuaHRtbGAgaXMgdGhlIHB1YmxpYyBzaXRlOyBpdFxuICAgICAgICAgbXVzdCBub3QgcHVsbCB0aGUgb3BzIGFwcCdzIGJ1bmRsZSAoU3VwYWJhc2UsIGRleGllLCB0aGUgcm91dGVyLCBldmVyeVxuICAgICAgICAgbW9kdWxlKSBkb3duIHRvIGEgZmlyc3QtdGltZSB2aXNpdG9yLCBhbmQgaXRzIFRhaWx3aW5kIHN0eWxlc2hlZXQgbXVzdFxuICAgICAgICAgbm90IHJlYWNoIHRoZSBhcHAgXHUyMDE0IHNlZSBzcmMvbWFya2V0aW5nL21hcmtldGluZy5jc3MgZm9yIHdoeSB0aGF0XG4gICAgICAgICBpc29sYXRpb24gaXMgbG9hZC1iZWFyaW5nLiAqL1xuICAgICAgaW5wdXQ6IHtcbiAgICAgICAgbWFpbjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ2luZGV4Lmh0bWwnKSxcbiAgICAgICAgbWFya2V0aW5nOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnbWFya2V0aW5nLmh0bWwnKSxcbiAgICAgIH0sXG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzOiB7XG4gICAgICAgICAgJ3ZlbmRvci1yZWFjdCc6IFsncmVhY3QnLCAncmVhY3QtZG9tJywgJ3JlYWN0LXJvdXRlci1kb20nXSxcbiAgICAgICAgICAndmVuZG9yLXN1cGFiYXNlJzogWydAc3VwYWJhc2Uvc3VwYWJhc2UtanMnXSxcbiAgICAgICAgICAndmVuZG9yLWljb25zJzogWydAdGFibGVyL2ljb25zLXJlYWN0J10sXG4gICAgICAgICAgJ3ZlbmRvci1zY2FubmVyJzogWydAenhpbmcvYnJvd3NlcicsICdAenhpbmcvbGlicmFyeSddLFxuICAgICAgICAgICd2ZW5kb3ItZGV4aWUnOiBbJ2RleGllJ10sXG4gICAgICAgICAgJ3ZlbmRvci1nc2FwJzogWydnc2FwJywgJ0Bnc2FwL3JlYWN0J10sXG4gICAgICAgICAgJ3ZlbmRvci1jaGFydHMnOiBbJ3JlY2hhcnRzJ10sXG4gICAgICAgICAgJ3ZlbmRvci1iYXNlLXVpJzogWydAYmFzZS11aS9yZWFjdCddLFxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgICAnQGJhYmluLXJlbnRhbHMvZGVzaWduLXRva2Vucyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3BhY2thZ2VzL2Rlc2lnbi10b2tlbnMvc3JjL2luZGV4LnRzJyksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgLy8gTWFuYWdlZCBjaGVja291dHMgY2FuIHNoYXJlIGRlcGVuZGVuY2llczsgYWxsb3cgdGhlaXIgc2VsZi1ob3N0ZWQgZm9udHMuXG4gICAgZnM6IHsgYWxsb3c6IFtfX2Rpcm5hbWUsIGZzLnJlYWxwYXRoU3luYyhwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnbm9kZV9tb2R1bGVzJykpXSB9LFxuICAgIHBvcnQ6IHByb2Nlc3MuZW52WydQT1JUJ10gPyBOdW1iZXIocHJvY2Vzcy5lbnZbJ1BPUlQnXSkgOiAzMDAwLFxuICAgIGhvc3Q6IHRydWUsXG4gICAgYWxsb3dlZEhvc3RzOiBbXG4gICAgICAnLm5ncm9rLWZyZWUuYXBwJywgJy5uZ3Jvay1mcmVlLmRldicsICcubmdyb2suYXBwJywgJy5uZ3Jvay5pbycsXG4gICAgICAvKiBQaW5nZ3kgaGFuZHMgb3V0IGEgZGlmZmVyZW50IHN1ZmZpeCBwZXIgdHVubmVsIHR5cGUgXHUyMDE0IGEgZnJlZSB0dW5uZWxcbiAgICAgICAgIHJldHVybnMgQk9USCBgKi5mcmVlLnBpbmdneS5uZXRgIGFuZCBgKi5ydW4ucGluZ2d5LWZyZWUubGlua2AsIGFuZCBwYWlkXG4gICAgICAgICBzdWJkb21haW5zIGxhbmQgb24gYCoucGluZ2d5LmxpbmtgLiBBbGxvdyBhbGwgb2YgdGhlbTsgYSBtaXNzaW5nIHN1ZmZpeFxuICAgICAgICAgZmFpbHMgYXMgYSBiYXJlIDQwMyBcIkJsb2NrZWQgcmVxdWVzdFwiIHRoYXQgbG9va3MgbGlrZSBhIHR1bm5lbCBmYXVsdC4gKi9cbiAgICAgICcucGluZ2d5Lm5ldCcsICcucGluZ2d5LWZyZWUubGluaycsICcucGluZ2d5LmxpbmsnLCAnLnBpbmdneS5pbycsICcucGluZ2d5Lm9ubGluZScsXG4gICAgICAnLnRyeWNsb3VkZmxhcmUuY29tJyxcbiAgICBdLFxuICAgIHdhdGNoOiB7XG4gICAgICBpZ25vcmVkOiBbJyoqL3RtcC8qKicsICcqKi9fX3Jhcl8qJywgJyoqLyoucmFydGVtcCcsICcqKi8qLnJhcicsICcqKi8qLnppcCcsICcqKi8qLjd6JywgJyoqLyoudGFyKicsICcqKi8udG1wLSonLCAnKiovLmNsYXVkZS8qKicsICcqKi9hcnRpZmFjdHMvKionLCAnKiovLnN5c3RlbV9nZW5lcmF0ZWQvKionLCAnKiovLndvcmt0cmVlcy8qKiddLFxuICAgIH0sXG4gIH0sXG4gIHByZXZpZXc6IHtcbiAgICAvKiBgdml0ZSBwcmV2aWV3YCBjYXJyaWVzIGl0cyBvd24gaG9zdCBjaGVjayAoVml0ZSA+PSA1LjQuMTIpLCBzZXBhcmF0ZSBmcm9tXG4gICAgICAgYHNlcnZlci5hbGxvd2VkSG9zdHNgIGFib3ZlLiBUaGUgdHVubmVsIGhpdHMgcHJldmlldywgbm90IGRldiwgd2hlbmV2ZXIgdGhlXG4gICAgICAgb2ZmbGluZSBsYXllciBpcyB1bmRlciB0ZXN0IFx1MjAxNCB0aGUgZGV2IHNlcnZlciByZWdpc3RlcnMgbm8gc2VydmljZSB3b3JrZXIgYXRcbiAgICAgICBhbGwgKGBkZXZPcHRpb25zYCBpcyB1bnNldCksIHNvIGFpcnBsYW5lLW1vZGUgYmVoYXZpb3VyIGlzIG9ubHkgb2JzZXJ2YWJsZVxuICAgICAgIGFnYWluc3QgYSBidWlsdCBidW5kbGUuICovXG4gICAgYWxsb3dlZEhvc3RzOiBbXG4gICAgICAnLm5ncm9rLWZyZWUuYXBwJywgJy5uZ3Jvay1mcmVlLmRldicsICcubmdyb2suYXBwJywgJy5uZ3Jvay5pbycsXG4gICAgICAvKiBQaW5nZ3kgaGFuZHMgb3V0IGEgZGlmZmVyZW50IHN1ZmZpeCBwZXIgdHVubmVsIHR5cGUgXHUyMDE0IGEgZnJlZSB0dW5uZWxcbiAgICAgICAgIHJldHVybnMgQk9USCBgKi5mcmVlLnBpbmdneS5uZXRgIGFuZCBgKi5ydW4ucGluZ2d5LWZyZWUubGlua2AsIGFuZCBwYWlkXG4gICAgICAgICBzdWJkb21haW5zIGxhbmQgb24gYCoucGluZ2d5LmxpbmtgLiBBbGxvdyBhbGwgb2YgdGhlbTsgYSBtaXNzaW5nIHN1ZmZpeFxuICAgICAgICAgZmFpbHMgYXMgYSBiYXJlIDQwMyBcIkJsb2NrZWQgcmVxdWVzdFwiIHRoYXQgbG9va3MgbGlrZSBhIHR1bm5lbCBmYXVsdC4gKi9cbiAgICAgICcucGluZ2d5Lm5ldCcsICcucGluZ2d5LWZyZWUubGluaycsICcucGluZ2d5LmxpbmsnLCAnLnBpbmdneS5pbycsICcucGluZ2d5Lm9ubGluZScsXG4gICAgICAnLnRyeWNsb3VkZmxhcmUuY29tJyxcbiAgICBdLFxuICB9LFxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMlMsU0FBUyxvQkFBb0I7QUFDeFUsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBQ3hCLE9BQU8sVUFBVTtBQUNqQixPQUFPLFFBQVE7QUFDZixTQUFTLGVBQWU7QUFMeEIsSUFBTSxtQ0FBbUM7QUFPekMsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLElBQ1osUUFBUTtBQUFBLE1BQ04sY0FBYztBQUFBLE1BQ2QsZUFBZSxDQUFDLGVBQWUsY0FBYyxhQUFhO0FBQUEsTUFDMUQsVUFBVTtBQUFBLFFBQ1IsTUFBTTtBQUFBLFFBQ04sWUFBWTtBQUFBLFFBQ1osSUFBSTtBQUFBLFFBQ0osV0FBVztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsU0FB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
