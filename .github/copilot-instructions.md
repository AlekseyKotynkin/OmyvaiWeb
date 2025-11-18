**Repository Overview**
- **Type**: Static HTML/CSS/JS site (HTML5 UP template).
- **Entry files**: `index.html`, `generic.html`, `elements.html`.
- **Primary assets**: `assets/js/` (jQuery plugins + `main.js`), `assets/css/` (built CSS), `assets/sass/` (source SCSS), `images/`, `webfonts/`.

**High-level architecture / why things are structured this way**
- **Presentation-first**: markup lives in top-level HTML files; styles are precompiled to `assets/css/main.css` but source is in `assets/sass/`.
- **SCSS layering**: `assets/sass/libs/` (vars, mixins, helpers) -> `base/` -> `components/` -> `layout/`. Follow this order when adding styles.
- **JS behavior**: small, page-focused scripts under `assets/js/`. `main.js` configures responsive breakpoints and moves navigation between `#nav` and the mobile `#navPanel`.

**Important project-specific patterns**
- **Breakpoints parity**: breakpoints are defined in `assets/sass/libs/_breakpoints.scss` (used via `@include breakpoints(...)`) and mirrored in `assets/js/main.js` via `breakpoints({...})`. Keep these values synchronized when changing responsive behavior.
- **Nav/Panel pattern**: `#nav` DOM is moved into `#navPanel` at `<=medium` breakpoint (see `main.js`). When updating nav markup, ensure both selectors still work.
- **Parallax guardrails**: `main.js` disables parallax on IE, Edge, mobile and HiDPI — respect these checks if changing background effects.
- **Vendor assets**: `fontawesome` is used both in `assets/css` and imported in SCSS. Prefer editing SCSS and recompiling when changing icons or typography.

**Build / dev workflows (discovered from repo)**
- There is no `package.json` or automated build in repo. Typical workflows:
  - Quick preview: open `index.html` in browser or run a simple local server:
    ```powershell
    python -m http.server 8000
    ```
  - Rebuild CSS from SCSS (if you edit `.scss`): install Dart Sass and run from repo root:
    ```powershell
    sass assets/sass/main.scss assets/css/main.css --no-source-map
    ```
  - Alternative: compile entire folder:
    ```powershell
    sass --no-source-map assets/sass:assets/css
    ```

**Files to inspect when changing behavior**
- `index.html` — main markup and script ordering.
- `assets/js/main.js` — responsive logic, nav panel, parallax and scrolly setup.
- `assets/js/util.js` and `assets/js/browser.min.js` — small helpers and browser detection used by `main.js`.
- `assets/sass/` (see imports in `assets/sass/main.scss`) — modify here and recompile to `assets/css/main.css`.
- `assets/css/main.css` — built CSS; check when debugging style issues.

**License / attribution**
- Template header notes this is an HTML5 UP template under Creative Commons. Preserve attribution links in the footer unless you intentionally relicense.

**What an AI agent should do first when changing code**
- Open `index.html` and `assets/js/main.js` to understand current DOM IDs/classes (`#wrapper`, `#nav`, `#navPanel`, `#intro`, `#main`).
- If editing styles, modify SCSS under `assets/sass/` and recompile (see commands above) rather than editing `assets/css/main.css` directly.
- When changing responsive rules, update both SCSS breakpoints and the `breakpoints({ ... })` call in `assets/js/main.js`.

**If information is missing**
- There is no CI/test config or `package.json`. Ask the repo owner whether they want to add a Node-based toolchain (npm, gulp, etc.) or prefer manual SCSS compilation.

Please review этот файл и скажите, какие разделы нужно дополнить или локализовать по-другому.