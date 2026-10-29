# Platform Architecture Documentation

**Platform:** BrainDetour — Universal Curiosity, Learning, and AI Evidence Review Platform  
**Stack:** React 19, Vite, React Router 7, Vanilla CSS (Design Tokens)  
**Theme:** Soft 3D Claymorphism + Premium Pastel Editorial

---

## 1. Overview & Purpose

BrainDetour is designed to promote intellectual curiosity, structured learning tracks, and empirical evidence evaluation for presentations and research. The frontend application is structured for long-term scalability, clear separation of concerns, and ease of onboarding for new developers.

---

## 2. Directory Structure & Responsibilities

```
src/
  ├── main.jsx                     # Application entry point; mounts React to the DOM root
  ├── App.jsx                      # Top-level composition; provides global context & mounts the router
  ├── app/
  │   └── router.jsx               # Central route definitions, layout associations, and error views
  ├── assets/                      # Static bundled assets (illustrations, mascot, icons)
  ├── components/
  │   ├── layout/                  # Shared page layout elements (Navbar, Footer, AppLayout)
  │   └── ui/                      # Reusable, domain-agnostic UI primitives (Button, Input, Card)
  ├── pages/                       # Route-level view components (HomePage, ExplorePage, TopicPage, etc.)
  ├── features/                    # Feature-encapsulated components and business logic
  │   ├── discovery/               # Topic discovery, catalog browsing, and topic cards
  │   ├── learning/                # Curiosity prompts, evidence inquiries, key questions
  │   ├── presentation/            # Presentation rehearsal timer and review rubrics
  │   └── auth/                    # Authentication cards and form containers
  ├── data/
  │   └── mock/                    # Pure mock data fixtures with realistic schemas
  ├── services/
  │   └── mock/                    # Asynchronous mock service layer reading from mock data
  ├── hooks/                       # Reusable custom React hooks (useTopics, usePageTitle, useTheme)
  ├── context/                     # Global state providers (ThemeContext, ThemeProvider)
  ├── lib/                         # Shared utilities, formatting helpers, and application constants
  └── styles/
      └── index.css                # Global design system tokens, CSS reset, and typography

public/
  ├── favicon.svg                  # Browser icon
  ├── icons.svg                    # SVG sprite symbols
  └── images/                      # High-res 3D illustrations & transparent character assets
      ├── character-transparent.png # 3D girl character with brown hair & lavender sweater
      ├── hero-learning.jpg        # 3D clay student exploring illuminated book of knowledge
      └── presentation-mic.jpg     # 3D clay microphone & evidence review clipboard

docs/
  └── architecture.md              # Architecture documentation and developer guides
```

### Detailed File Responsibilities

| Directory / File | Responsibility |
| :--- | :--- |
| `src/main.jsx` | Mounts the root React DOM node, initializes strict mode, and imports global styles. |
| `src/App.jsx` | Composes top-level application providers (`ThemeProvider`) and passes `router` to `RouterProvider`. |
| `src/app/router.jsx` | Declares all route paths, dynamic parameters (`/topics/:topicId`), child routes, and the 404 fallback. |
| `src/components/layout/` | Shell elements that frame page views: `Navbar` (top navigation), `Footer` (branding/links), and `AppLayout` (main outlet container). |
| `src/components/ui/` | Generic design system building blocks (`Button`, `Input`, `Card`) without business or domain dependencies. |
| `src/pages/` | Top-level components rendered by the router. They coordinate data fetching (via hooks) and feature components. |
| `src/features/` | Modular slices of platform functionality (`discovery`, `learning`, `presentation`, `auth`). Feature components may consume `components/ui/`. |
| `src/data/mock/` | Pure JS data fixtures. Contains no React components or side-effect logic. |
| `src/services/mock/` | Simulates network latency and asynchronous retrieval (`Promise`-based). Isolates data sources from UI components. |
| `src/hooks/` | Custom hooks that encapsulate data subscriptions, side-effects, or document meta-updates (`usePageTitle`, `useTopics`, `useTheme`). |
| `src/context/` | React Context for cross-cutting application state (`ThemeContext`, `ThemeProvider`). |
| `src/lib/` | Pure helper functions (`classNames`, `formatMinutes`) and centralized constants (`NAV_LINKS`, `TOPIC_CATEGORIES`, `DESIGN_PALETTE`). |
| `src/styles/index.css` | Defines CSS Custom Properties (tokens) for the pastel-lavender palette, claymorphic shadows, typography, and radii. |

---

## 3. Coding & Import Conventions

1. **Naming Conventions:**
   - **React Components & Files:** PascalCase (e.g., `TopicCard.jsx`, `AppLayout.jsx`, `Button.jsx`).
   - **Hooks:** camelCase prefixed with `use` (e.g., `useTopics.js`, `usePageTitle.js`).
   - **Services & Utilities:** camelCase (e.g., `topicService.js`, `utils.js`).
   - **Constants:** UPPER_SNAKE_CASE (e.g., `TOPIC_CATEGORIES`, `DIFFICULTY_LEVELS`, `DESIGN_PALETTE`).

2. **Exports:**
   - Prefer **named exports** for reusable components and utilities (`export function Button(...)`, `export const router = ...`).
   - Use default export only for root components when convention calls for it (e.g., `export default App`).

3. **Separation of Concerns:**
   - **UI vs. Data Access:** Components never import raw mock data directly; they query service functions via custom hooks (or direct service calls when appropriate).
   - **No Hardcoded Magic Numbers:** Use constants from `src/lib/constants.js` for navigation links, categories, timer options, and difficulty levels.
   - **Styling Colocation:** Component-specific CSS files are placed alongside the component JSX file (e.g., `Button.jsx` imports `./Button.css`).

---

## 4. Design System (Soft 3D Claymorphism + Pastel Editorial)

All components utilize centralized CSS variables declared in `src/styles/index.css`:

- **Lavender Environment:** `--color-page-bg` (`#E8DDF5`), `--color-lavender-secondary` (`#D8C4EF`)
- **Cream & White Surfaces:** `--color-surface-cream` (`#FFF8F0`), `--color-surface-white` (`#FFFFFF`)
- **Primary Actions:** `--color-primary` (`#9270C8`), `--color-primary-deep` (`#6E4BA8`)
- **Typography:** Deep plum headings `--color-text-main` (`#463750`), muted secondary text `--color-text-secondary` (`#81758B`)
- **Soft Pink Accents:** `--color-pink-accent` (`#F3B9C8`), `--color-pink-light` (`#FCEEF2`)
- **Layered Clay Shadows:** `--shadow-clay-panel`, `--shadow-clay-card`, `--shadow-clay-button`, `--shadow-clay-input`
- **Corner Radii:** Smooth radii ranging from `--radius-sm` (12px) to `--radius-2xl` (38px) and `--radius-full` (pill shapes)

---

## 5. How to Add a New Feature

Follow this standardized workflow to add a new domain feature (e.g., "Hypothesis Tester"):

### Step 1: Define Constants & Types
Add any new shared constants to `src/lib/constants.js`.

### Step 2: Define Mock Data & Service
1. Create data fixture in `src/data/mock/hypotheses.js`.
2. Add asynchronous retrieval methods in `src/services/mock/hypothesisService.js`.

### Step 3: Create a Custom Hook
Encapsulate the state and lifecycle in `src/hooks/useHypotheses.js`.

### Step 4: Create Feature Components
Build focused UI in `src/features/hypotheses/HypothesisCard.jsx` and `HypothesisCard.css`. Use generic controls from `src/components/ui/` (`Card`, `Button`, `Input`).

### Step 5: Create or Update a Route Page
1. Create `src/pages/HypothesisPage.jsx` and consume the custom hook.
2. Register the route in `src/app/router.jsx`.
3. Add the route to `NAV_LINKS` in `src/lib/constants.js`.

---

## 6. Path to Live Backend Integration

The mock layer (`src/services/mock/`) isolates the UI from API implementation details. When a backend server is ready:
1. Create `src/services/api/` containing API clients.
2. Implement identical method signatures (`getTopics()`, `getTopicById(id)`).
3. Swap the import in custom hooks (`src/hooks/useTopics.js`) from `../services/mock/topicService` to `../services/api/topicService`.
4. UI components and pages remain completely unchanged.
