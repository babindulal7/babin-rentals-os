// vite.config.ts
import { defineConfig } from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "node:path";
import fs from "node:fs";
import { VitePWA } from "file:///C:/Users/use/Desktop/babin-rentals-os/node_modules/vite-plugin-pwa/dist/index.js";
var __vite_injected_original_dirname = "C:\\Users\\use\\Desktop\\babin-rentals-os\\.worktrees\\t1-14-desktop-performance";
var vite_config_default = defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    ...mode === "client" ? [] : [VitePWA({
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
        importScripts: ["/push-worker.js"],
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
    })]
  ],
  build: {
    // Keep each Cloudflare hostname's HTML/JS build physically separate.
    outDir: mode === "staff" ? "dist-staff" : mode === "client" ? "dist-client" : "dist",
    manifest: mode === "staff" || mode === "client",
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
      input: mode === "staff" ? { main: path.resolve(__vite_injected_original_dirname, "index.html") } : mode === "client" ? {
        marketing: path.resolve(__vite_injected_original_dirname, "marketing.html"),
        booking: path.resolve(__vite_injected_original_dirname, "booking.html")
      } : {
        main: path.resolve(__vite_injected_original_dirname, "index.html"),
        marketing: path.resolve(__vite_injected_original_dirname, "marketing.html"),
        booking: path.resolve(__vite_injected_original_dirname, "booking.html")
      },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom") || id.includes("react-router-dom") || id.includes("@remix-run") || id.includes("@base-ui")) {
              return "vendor-react";
            }
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            if (id.includes("@tabler/icons-react")) {
              return "vendor-icons";
            }
            if (id.includes("@zxing/library")) {
              return "vendor-qrcode";
            }
            if (id.includes("@zxing/browser")) {
              return "vendor-scanner";
            }
            if (id.includes("dexie")) {
              return "vendor-dexie";
            }
            if (id.includes("gsap") || id.includes("@gsap")) {
              return "vendor-gsap";
            }
            if (id.includes("recharts") || id.includes("d3-")) {
              return "vendor-charts";
            }
          }
          if (id.includes("glossary.ne.json")) {
            return "app-i18n";
          }
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
    // GHSA-p4f5-76q4-ffq7 defense-in-depth: bind to loopback (127.0.0.1) by default.
    // Explicit opt-in via VITE_HOST or --host is required for external/LAN listeners.
    host: process.env["VITE_HOST"] || "127.0.0.1",
    /* Review allowedHosts: Public dev tunnels (ngrok, Pinggy, Cloudflare) must NOT
       expose an unauthenticated dev server by default. Localhost binding alone cannot
       block a locally-installed tunnel client forwarding to loopback, so dev allowedHosts
       defaults to loopback origins. Pass VITE_ALLOWED_HOSTS to explicitly allow authorized hosts. */
    allowedHosts: process.env["VITE_ALLOWED_HOSTS"] ? process.env["VITE_ALLOWED_HOSTS"].split(",").map((h) => h.trim()) : [".localhost", "127.0.0.1"],
    watch: {
      ignored: ["**/tmp/**", "**/__rar_*", "**/*.rartemp", "**/*.rar", "**/*.zip", "**/*.7z", "**/*.tar*", "**/.tmp-*", "**/.claude/**", "**/artifacts/**", "**/.system_generated/**", "**/.worktrees/**"]
    }
  },
  preview: {
    port: process.env["PORT"] ? Number(process.env["PORT"]) : 4173,
    host: process.env["VITE_PREVIEW_HOST"] || process.env["VITE_HOST"] || "127.0.0.1",
    /* `vite preview` serves the compiled, static production bundle (dist/) for
       testing offline PWA/service worker behaviours. Restrict allowedHosts to loopback
       by default. Only allow external/tunnel hosts via explicit VITE_ALLOWED_HOSTS opt-in. */
    allowedHosts: process.env["VITE_ALLOWED_HOSTS"] ? process.env["VITE_ALLOWED_HOSTS"].split(",").map((h) => h.trim()) : [".localhost", "127.0.0.1"]
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFx1c2VcXFxcRGVza3RvcFxcXFxiYWJpbi1yZW50YWxzLW9zXFxcXC53b3JrdHJlZXNcXFxcdDEtMTQtZGVza3RvcC1wZXJmb3JtYW5jZVwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiQzpcXFxcVXNlcnNcXFxcdXNlXFxcXERlc2t0b3BcXFxcYmFiaW4tcmVudGFscy1vc1xcXFwud29ya3RyZWVzXFxcXHQxLTE0LWRlc2t0b3AtcGVyZm9ybWFuY2VcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0M6L1VzZXJzL3VzZS9EZXNrdG9wL2JhYmluLXJlbnRhbHMtb3MvLndvcmt0cmVlcy90MS0xNC1kZXNrdG9wLXBlcmZvcm1hbmNlL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSdcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCdcbmltcG9ydCB0YWlsd2luZGNzcyBmcm9tICdAdGFpbHdpbmRjc3Mvdml0ZSdcbmltcG9ydCBwYXRoIGZyb20gJ25vZGU6cGF0aCdcbmltcG9ydCBmcyBmcm9tICdub2RlOmZzJ1xuaW1wb3J0IHsgVml0ZVBXQSB9IGZyb20gJ3ZpdGUtcGx1Z2luLXB3YSdcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4gKHtcbiAgcGx1Z2luczogW1xuICAgIHJlYWN0KCksXG4gICAgdGFpbHdpbmRjc3MoKSxcbiAgICAuLi4obW9kZSA9PT0gJ2NsaWVudCcgPyBbXSA6IFtWaXRlUFdBKHtcbiAgICAgIHJlZ2lzdGVyVHlwZTogJ2F1dG9VcGRhdGUnLFxuICAgICAgaW5jbHVkZUFzc2V0czogWydmYXZpY29uLmljbycsICdyb2JvdHMudHh0JywgJ2ljb25zLyoucG5nJ10sXG4gICAgICBtYW5pZmVzdDoge1xuICAgICAgICBuYW1lOiAnQmFiaW4gUmVudGFscyBPUycsXG4gICAgICAgIHNob3J0X25hbWU6ICdCYWJpbicsXG4gICAgICAgIGlkOiAnLycsXG4gICAgICAgIHN0YXJ0X3VybDogJy8/c291cmNlPXB3YScsXG4gICAgICAgIHNjb3BlOiAnLycsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgZGlzcGxheV9vdmVycmlkZTogWyd3aW5kb3ctY29udHJvbHMtb3ZlcmxheScsICdzdGFuZGFsb25lJ10sXG4gICAgICAgIG9yaWVudGF0aW9uOiAnYW55JyxcbiAgICAgICAgLyogREVTSUdOX0RJUkVDVElPTl9TUEVDX3Y0LjIgXHUwMEE3Mi4xL1x1MDBBNzMgXHUyMDE0IHRoZSBpbnN0YWxsZWQgYXBwIG9wZW5zIExJR0hULFxuICAgICAgICAgICBzbyB0aGUgc3BsYXNoIGFuZCB3aW5kb3cgY2hyb21lIGFyZSB0aGUgY3JlYW0gY2FudmFzLCBtYXRjaGluZ1xuICAgICAgICAgICBpbmRleC5odG1sJ3MgPG1ldGEgbmFtZT1cInRoZW1lLWNvbG9yXCI+LiBUaGVzZSB0d28gbXVzdCBiZSBjaGFuZ2VkXG4gICAgICAgICAgIHRvZ2V0aGVyIHdpdGggdGhhdCBtZXRhIHRhZzogdGhleSBhcmUgd2hhdCB0aGUgT1MgcGFpbnRzIEJFRk9SRSB0aGVcbiAgICAgICAgICAgYXBwIGhhcyBydW4sIGFuZCAjMEYxNDIwIGxlZnQgdGhlIGluc3RhbGxlZCBhcHAgZmxhc2hpbmcgYSBmdWxsXG4gICAgICAgICAgIHNjcmVlbiBvZiBkYXJrIG5hdnkgaW50byBhIGNyZWFtIGFwcCBvbiBldmVyeSBjb2xkIGxhdW5jaC4gKCMwRjE0MjBcbiAgICAgICAgICAgd2FzIG5vdCBldmVuIHRoZSBkYXJrIGNhbnZhcyBcdTIwMTQgdGhhdCBpcyAjMDUwQjEyLikgKi9cbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyNGREVGREMnLFxuICAgICAgICB0aGVtZV9jb2xvcjogJyNGREVGREMnLFxuICAgICAgICBsYW5nOiAnZW4nLFxuICAgICAgICBkaXI6ICdsdHInLFxuICAgICAgICBjYXRlZ29yaWVzOiBbJ2J1c2luZXNzJywgJ3Byb2R1Y3Rpdml0eSddLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnL2ljb25zLzE5Mi5wbmcnLCBzaXplczogJzE5MngxOTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zLzUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL21hc2thYmxlLTUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ21hc2thYmxlJyB9XG4gICAgICAgIF0sXG4gICAgICAgIHNob3J0Y3V0czogW1xuICAgICAgICAgIHsgbmFtZTogJ1NjYW4nLCB1cmw6ICcvc2NhbicsIGljb25zOiBbeyBzcmM6ICcvaWNvbnMvc2Nhbi05Ni5wbmcnLCBzaXplczogJzk2eDk2JyB9XSB9LFxuICAgICAgICAgIHsgbmFtZTogJ1RvZGF5JywgdXJsOiAnL3RvZGF5JyB9LFxuICAgICAgICAgIHsgbmFtZTogJ05ldyBSZW50YWwnLCB1cmw6ICcvcmVudGFscy9uZXcnIH0sXG4gICAgICAgICAgeyBuYW1lOiAnUGFja2luZycsIHVybDogJy9vcGVyYXRpb25zL3BhY2tpbmcnIH1cbiAgICAgICAgXVxuICAgICAgfSxcbiAgICAgIHdvcmtib3g6IHtcbiAgICAgICAgLypcbiAgICAgICAgICogV29ya2JveCdzIGRlZmF1bHQgYGdsb2JQYXR0ZXJuc2AgaXMgYCoqJyArICcvKi57anMsd2FzbSxjc3MsaHRtbH1gIFx1MjAxNCBub1xuICAgICAgICAgKiBmb250IGZvcm1hdHMuIFRoYXQgc2lsZW50bHkgbGVmdCBhbGwgMzArIGAud29mZjJgL2Aud29mZmAgZmlsZXMgb3V0IG9mXG4gICAgICAgICAqIHRoZSBwcmVjYWNoZSBtYW5pZmVzdCwgaW5jbHVkaW5nIGBoaW5kLWRldmFuYWdhcmktKmAgYW5kXG4gICAgICAgICAqIGBhc2FyLWRldmFuYWdhcmktKmAsIHdoaWxlIHRoZWlyIEBmb250LWZhY2Ugc3R5bGVzaGVldHMgV0VSRSBwcmVjYWNoZWQuXG4gICAgICAgICAqIE9mZmxpbmUsIHRoZSBzaGVsbCBwYWludGVkLCB0aGUgQ1NTIGFza2VkIGZvciB0aGUgRGV2YW5hZ2FyaSBmYWNlcywgYW5kXG4gICAgICAgICAqIG5vdGhpbmcgYW5zd2VyZWQgXHUyMDE0IHNvIE5lcGFsaSBmZWxsIGJhY2sgdG8gYSBzeXN0ZW0gZmFjZSBvbiB0aGUgb25lXG4gICAgICAgICAqIGRldmljZSBjbGFzcyB0aGF0IG5lZWRzIGl0IG1vc3QuIEZvdW5kYXRpb24gXHUwMEE3My4zIHJlcXVpcmVzIERldmFuYWdhcmlcbiAgICAgICAgICogbW9udGggbmFtZXMgKGBcdTA5MzhcdTA5M0VcdTA5MDlcdTA5MjhgKSB1bmRlciB0aGUgTmVwYWxpIHRvZ2dsZSwgYW5kIHRoZSB3aG9sZSByZWFzb24gdGhlXG4gICAgICAgICAqIGZvbnRzIHdlcmUgc2VsZi1ob3N0ZWQgaW4gdGhlIGZpcnN0IHBsYWNlICg0IEF1Zykgd2FzIHRoYXQgYSBDRE5cbiAgICAgICAgICogYDxsaW5rPmAgZmFpbHMgc2lsZW50bHkgaW4gZXhhY3RseSB0aGlzIHNpdHVhdGlvbi5cbiAgICAgICAgICpcbiAgICAgICAgICogYGljb2AvYHBuZ2AvYHN2Z2Agam9pbiBpdCBzbyB0aGUgbWFuaWZlc3QgaWNvbnMgYW5kIGZhdmljb24gc3Vydml2ZSBhXG4gICAgICAgICAqIGNvbGQgb2ZmbGluZSBsYXVuY2ggdG9vLlxuICAgICAgICAgKlxuICAgICAgICAgKiBDb3N0OiB0aGUgZm91ciBzZWxmLWhvc3RlZCBmYW1pbGllcyBhcmUgfjc0MCBLQiBvZiB3b2ZmMiBpbiBgZGlzdGAsXG4gICAgICAgICAqIHdoaWNoIGlzIG5vdyBkb3dubG9hZGVkIG9uY2UgYXQgaW5zdGFsbCByYXRoZXIgdGhhbiBsYXppbHkuIFRoYXQgaXNcbiAgICAgICAgICogdGhlIGNvcnJlY3QgdHJhZGUgZm9yIGFuIGFwcCB3aG9zZSBzdGF0ZWQgcHJlbWlzZSBpcyB0aGF0IHRoZVxuICAgICAgICAgKiB3YXJlaG91c2UgaGFzIG5vIHNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyx3YXNtLGNzcyxodG1sLGljbyxwbmcsc3ZnLHdvZmYyfSddLFxuICAgICAgICBnbG9iSWdub3JlczogW1xuICAgICAgICAgICcqKi8qLndvZmYnLFxuICAgICAgICAgICcqKi8qLWN5cmlsbGljLSonLFxuICAgICAgICAgICcqKi8qLWdyZWVrLSonLFxuICAgICAgICAgICcqKi8qLXZpZXRuYW1lc2UtKicsXG4gICAgICAgICAgJyoqLyotbGF0aW4tZXh0LSonLFxuICAgICAgICBdLFxuICAgICAgICBpbXBvcnRTY3JpcHRzOiBbJy9wdXNoLXdvcmtlci5qcyddLFxuICAgICAgICBuYXZpZ2F0aW9uUHJlbG9hZDogdHJ1ZSxcbiAgICAgICAgcnVudGltZUNhY2hpbmc6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL1teL10rXFwuc3VwYWJhc2VcXC5jb1xcL3Jlc3RcXC92MVxcLyhlcXVpcG1lbnR8Y2xpZW50c3xidW5kbGVzfGNhdGVnb3JpZXN8d2FyZWhvdXNlc3xzZXR0aW5ncykvLFxuICAgICAgICAgICAgaGFuZGxlcjogJ1N0YWxlV2hpbGVSZXZhbGlkYXRlJyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnc3VwYWJhc2UtcmVmZXJlbmNlLWRhdGEnLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7XG4gICAgICAgICAgICAgICAgbWF4RW50cmllczogNTAwLFxuICAgICAgICAgICAgICAgIG1heEFnZVNlY29uZHM6IDcgKiAyNCAqIDYwICogNjAgLy8gMSB3ZWVrXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvW14vXStcXC5zdXBhYmFzZVxcLmNvXFwvcmVzdFxcL3YxXFwvKGJvb2tpbmdzfGJvb2tpbmdfaXRlbXMpLyxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdOZXR3b3JrRmlyc3QnLFxuICAgICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgICBjYWNoZU5hbWU6ICdzdXBhYmFzZS1vcGVyYXRpb25hbC1kYXRhJyxcbiAgICAgICAgICAgICAgZXhwaXJhdGlvbjoge1xuICAgICAgICAgICAgICAgIG1heEVudHJpZXM6IDEwMDAsXG4gICAgICAgICAgICAgICAgbWF4QWdlU2Vjb25kczogMjQgKiA2MCAqIDYwIC8vIDEgZGF5XG4gICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgIG5ldHdvcmtUaW1lb3V0U2Vjb25kczogM1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgXVxuICAgICAgfVxuICAgIH0pXSksXG4gIF0sXG4gIGJ1aWxkOiB7XG4gICAgLy8gS2VlcCBlYWNoIENsb3VkZmxhcmUgaG9zdG5hbWUncyBIVE1ML0pTIGJ1aWxkIHBoeXNpY2FsbHkgc2VwYXJhdGUuXG4gICAgb3V0RGlyOiBtb2RlID09PSAnc3RhZmYnID8gJ2Rpc3Qtc3RhZmYnIDogbW9kZSA9PT0gJ2NsaWVudCcgPyAnZGlzdC1jbGllbnQnIDogJ2Rpc3QnLFxuICAgIG1hbmlmZXN0OiBtb2RlID09PSAnc3RhZmYnIHx8IG1vZGUgPT09ICdjbGllbnQnLFxuICAgIC8qIEV4cGxpY2l0bHkgb2ZmLCBub3QgbWVyZWx5IGRlZmF1bHRlZC4gUmVudG1hbiBzaGlwcyBgKi5qcy5tYXBgIHdpdGhcbiAgICAgICBgc291cmNlc0NvbnRlbnRgIGluIGl0cyBwcm9kdWN0aW9uIGJ1bmRsZSwgd2hpY2ggaXMgaG93IHRoZSAzMCBBdWcgMjAyNlxuICAgICAgIGZvcmVuc2ljcyBwYWNrIHJlY29uc3RydWN0ZWQgMSw1MDAgb2YgdGhlaXIgc291cmNlIHBhdGhzLCB0aGVpciB3aG9sZVxuICAgICAgIHJvdXRlIHRyZWUsIGFuZCB0aGVpciBlbnVtIHZhbHVlcy4gU2FtZSBzdGFjayBhcyBvdXJzLiBLZWVwIHRoaXMgcGlubmVkXG4gICAgICAgc28gbm8gY29uZmlnIGVkaXQgb3IgQ2FwYWNpdG9yIHRlbXBsYXRlIGZsaXBzIGl0IHNpbGVudGx5LCBhbmQgcmUtdmVyaWZ5XG4gICAgICAgdGhlIHdyYXBwZWQgYnVuZGxlIGJlZm9yZSBhbnkgc3RvcmUgdXBsb2FkLiAqL1xuICAgIHNvdXJjZW1hcDogZmFsc2UsXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgLyogVHdvIGRvY3VtZW50cywgZGVsaWJlcmF0ZWx5LiBgbWFya2V0aW5nLmh0bWxgIGlzIHRoZSBwdWJsaWMgc2l0ZTsgaXRcbiAgICAgICAgIG11c3Qgbm90IHB1bGwgdGhlIG9wcyBhcHAncyBidW5kbGUgKFN1cGFiYXNlLCBkZXhpZSwgdGhlIHJvdXRlciwgZXZlcnlcbiAgICAgICAgIG1vZHVsZSkgZG93biB0byBhIGZpcnN0LXRpbWUgdmlzaXRvciwgYW5kIGl0cyBUYWlsd2luZCBzdHlsZXNoZWV0IG11c3RcbiAgICAgICAgIG5vdCByZWFjaCB0aGUgYXBwIFx1MjAxNCBzZWUgc3JjL21hcmtldGluZy9tYXJrZXRpbmcuY3NzIGZvciB3aHkgdGhhdFxuICAgICAgICAgaXNvbGF0aW9uIGlzIGxvYWQtYmVhcmluZy4gKi9cbiAgICAgIGlucHV0OiBtb2RlID09PSAnc3RhZmYnXG4gICAgICAgID8geyBtYWluOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnaW5kZXguaHRtbCcpIH1cbiAgICAgICAgOiBtb2RlID09PSAnY2xpZW50J1xuICAgICAgICAgID8ge1xuICAgICAgICAgICAgICBtYXJrZXRpbmc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdtYXJrZXRpbmcuaHRtbCcpLFxuICAgICAgICAgICAgICBib29raW5nOiBwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnYm9va2luZy5odG1sJyksXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiB7XG4gICAgICAgICAgICAgIG1haW46IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdpbmRleC5odG1sJyksXG4gICAgICAgICAgICAgIG1hcmtldGluZzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJ21hcmtldGluZy5odG1sJyksXG4gICAgICAgICAgICAgIGJvb2tpbmc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICdib29raW5nLmh0bWwnKSxcbiAgICAgICAgICAgIH0sXG4gICAgICBvdXRwdXQ6IHtcbiAgICAgICAgbWFudWFsQ2h1bmtzKGlkKSB7XG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdub2RlX21vZHVsZXMnKSkge1xuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWFjdCcpIHx8IGlkLmluY2x1ZGVzKCdyZWFjdC1kb20nKSB8fCBpZC5pbmNsdWRlcygncmVhY3Qtcm91dGVyLWRvbScpIHx8IGlkLmluY2x1ZGVzKCdAcmVtaXgtcnVuJykgfHwgaWQuaW5jbHVkZXMoJ0BiYXNlLXVpJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItcmVhY3QnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ0BzdXBhYmFzZScpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndmVuZG9yLXN1cGFiYXNlJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAdGFibGVyL2ljb25zLXJlYWN0JykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItaWNvbnMnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ0B6eGluZy9saWJyYXJ5JykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItcXJjb2RlJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdAenhpbmcvYnJvd3NlcicpKSB7XG4gICAgICAgICAgICAgIHJldHVybiAndmVuZG9yLXNjYW5uZXInXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2RleGllJykpIHtcbiAgICAgICAgICAgICAgcmV0dXJuICd2ZW5kb3ItZGV4aWUnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaWQuaW5jbHVkZXMoJ2dzYXAnKSB8fCBpZC5pbmNsdWRlcygnQGdzYXAnKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1nc2FwJ1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdyZWNoYXJ0cycpIHx8IGlkLmluY2x1ZGVzKCdkMy0nKSkge1xuICAgICAgICAgICAgICByZXR1cm4gJ3ZlbmRvci1jaGFydHMnXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIExlYXZlIFBERiBjb2RlIGluIHRoZSBncmFwaCBvZiB0aGUgcm91dGVzIGFuZCBhY3Rpb25zIHRoYXQgdXNlIGl0LlxuICAgICAgICAgIC8vIEEgbWFudWFsIGNodW5rIGhlcmUgY2FuIHB1bGwgaW4gc2hhcmVkIGRlcGVuZGVuY2llcyBhbmQgcHJlbG9hZCB0aGUgZ2VuZXJhdG9yIGF0IHN0YXJ0dXAuXG4gICAgICAgICAgaWYgKGlkLmluY2x1ZGVzKCdnbG9zc2FyeS5uZS5qc29uJykpIHtcbiAgICAgICAgICAgIHJldHVybiAnYXBwLWkxOG4nXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9LFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgICAnQGJhYmluLXJlbnRhbHMvZGVzaWduLXRva2Vucyc6IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuL3BhY2thZ2VzL2Rlc2lnbi10b2tlbnMvc3JjL2luZGV4LnRzJyksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgLy8gTWFuYWdlZCBjaGVja291dHMgY2FuIHNoYXJlIGRlcGVuZGVuY2llczsgYWxsb3cgdGhlaXIgc2VsZi1ob3N0ZWQgZm9udHMuXG4gICAgZnM6IHsgYWxsb3c6IFtfX2Rpcm5hbWUsIGZzLnJlYWxwYXRoU3luYyhwYXRoLnJlc29sdmUoX19kaXJuYW1lLCAnbm9kZV9tb2R1bGVzJykpXSB9LFxuICAgIHBvcnQ6IHByb2Nlc3MuZW52WydQT1JUJ10gPyBOdW1iZXIocHJvY2Vzcy5lbnZbJ1BPUlQnXSkgOiAzMDAwLFxuICAgIC8vIEdIU0EtcDRmNS03NnE0LWZmcTcgZGVmZW5zZS1pbi1kZXB0aDogYmluZCB0byBsb29wYmFjayAoMTI3LjAuMC4xKSBieSBkZWZhdWx0LlxuICAgIC8vIEV4cGxpY2l0IG9wdC1pbiB2aWEgVklURV9IT1NUIG9yIC0taG9zdCBpcyByZXF1aXJlZCBmb3IgZXh0ZXJuYWwvTEFOIGxpc3RlbmVycy5cbiAgICBob3N0OiBwcm9jZXNzLmVudlsnVklURV9IT1NUJ10gfHwgJzEyNy4wLjAuMScsXG4gICAgLyogUmV2aWV3IGFsbG93ZWRIb3N0czogUHVibGljIGRldiB0dW5uZWxzIChuZ3JvaywgUGluZ2d5LCBDbG91ZGZsYXJlKSBtdXN0IE5PVFxuICAgICAgIGV4cG9zZSBhbiB1bmF1dGhlbnRpY2F0ZWQgZGV2IHNlcnZlciBieSBkZWZhdWx0LiBMb2NhbGhvc3QgYmluZGluZyBhbG9uZSBjYW5ub3RcbiAgICAgICBibG9jayBhIGxvY2FsbHktaW5zdGFsbGVkIHR1bm5lbCBjbGllbnQgZm9yd2FyZGluZyB0byBsb29wYmFjaywgc28gZGV2IGFsbG93ZWRIb3N0c1xuICAgICAgIGRlZmF1bHRzIHRvIGxvb3BiYWNrIG9yaWdpbnMuIFBhc3MgVklURV9BTExPV0VEX0hPU1RTIHRvIGV4cGxpY2l0bHkgYWxsb3cgYXV0aG9yaXplZCBob3N0cy4gKi9cbiAgICBhbGxvd2VkSG9zdHM6IHByb2Nlc3MuZW52WydWSVRFX0FMTE9XRURfSE9TVFMnXVxuICAgICAgPyBwcm9jZXNzLmVudlsnVklURV9BTExPV0VEX0hPU1RTJ10uc3BsaXQoJywnKS5tYXAoKGgpID0+IGgudHJpbSgpKVxuICAgICAgOiBbJy5sb2NhbGhvc3QnLCAnMTI3LjAuMC4xJ10sXG4gICAgd2F0Y2g6IHtcbiAgICAgIGlnbm9yZWQ6IFsnKiovdG1wLyoqJywgJyoqL19fcmFyXyonLCAnKiovKi5yYXJ0ZW1wJywgJyoqLyoucmFyJywgJyoqLyouemlwJywgJyoqLyouN3onLCAnKiovKi50YXIqJywgJyoqLy50bXAtKicsICcqKi8uY2xhdWRlLyoqJywgJyoqL2FydGlmYWN0cy8qKicsICcqKi8uc3lzdGVtX2dlbmVyYXRlZC8qKicsICcqKi8ud29ya3RyZWVzLyoqJ10sXG4gICAgfSxcbiAgfSxcbiAgcHJldmlldzoge1xuICAgIHBvcnQ6IHByb2Nlc3MuZW52WydQT1JUJ10gPyBOdW1iZXIocHJvY2Vzcy5lbnZbJ1BPUlQnXSkgOiA0MTczLFxuICAgIGhvc3Q6IHByb2Nlc3MuZW52WydWSVRFX1BSRVZJRVdfSE9TVCddIHx8IHByb2Nlc3MuZW52WydWSVRFX0hPU1QnXSB8fCAnMTI3LjAuMC4xJyxcbiAgICAvKiBgdml0ZSBwcmV2aWV3YCBzZXJ2ZXMgdGhlIGNvbXBpbGVkLCBzdGF0aWMgcHJvZHVjdGlvbiBidW5kbGUgKGRpc3QvKSBmb3JcbiAgICAgICB0ZXN0aW5nIG9mZmxpbmUgUFdBL3NlcnZpY2Ugd29ya2VyIGJlaGF2aW91cnMuIFJlc3RyaWN0IGFsbG93ZWRIb3N0cyB0byBsb29wYmFja1xuICAgICAgIGJ5IGRlZmF1bHQuIE9ubHkgYWxsb3cgZXh0ZXJuYWwvdHVubmVsIGhvc3RzIHZpYSBleHBsaWNpdCBWSVRFX0FMTE9XRURfSE9TVFMgb3B0LWluLiAqL1xuICAgIGFsbG93ZWRIb3N0czogcHJvY2Vzcy5lbnZbJ1ZJVEVfQUxMT1dFRF9IT1NUUyddXG4gICAgICA/IHByb2Nlc3MuZW52WydWSVRFX0FMTE9XRURfSE9TVFMnXS5zcGxpdCgnLCcpLm1hcCgoaCkgPT4gaC50cmltKCkpXG4gICAgICA6IFsnLmxvY2FsaG9zdCcsICcxMjcuMC4wLjEnXSxcbiAgfSxcbn0pKVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUE4WixTQUFTLG9CQUFvQjtBQUMzYixPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFDeEIsT0FBTyxVQUFVO0FBQ2pCLE9BQU8sUUFBUTtBQUNmLFNBQVMsZUFBZTtBQUx4QixJQUFNLG1DQUFtQztBQU96QyxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLEVBQ3pDLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLEdBQUksU0FBUyxXQUFXLENBQUMsSUFBSSxDQUFDLFFBQVE7QUFBQSxNQUNwQyxjQUFjO0FBQUEsTUFDZCxlQUFlLENBQUMsZUFBZSxjQUFjLGFBQWE7QUFBQSxNQUMxRCxVQUFVO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixZQUFZO0FBQUEsUUFDWixJQUFJO0FBQUEsUUFDSixXQUFXO0FBQUEsUUFDWCxPQUFPO0FBQUEsUUFDUCxTQUFTO0FBQUEsUUFDVCxrQkFBa0IsQ0FBQywyQkFBMkIsWUFBWTtBQUFBLFFBQzFELGFBQWE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBUWIsa0JBQWtCO0FBQUEsUUFDbEIsYUFBYTtBQUFBLFFBQ2IsTUFBTTtBQUFBLFFBQ04sS0FBSztBQUFBLFFBQ0wsWUFBWSxDQUFDLFlBQVksY0FBYztBQUFBLFFBQ3ZDLE9BQU87QUFBQSxVQUNMLEVBQUUsS0FBSyxrQkFBa0IsT0FB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
