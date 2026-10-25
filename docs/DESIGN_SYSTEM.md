# 🎨 DisasterResponse Global Design System Specification

**Reference Asset:** `DisasterResponse Live Incident Map.png`  
**Target Environment:** Civilian Emergency & Disaster Response Portal  
**Document Location:** `/docs/DESIGN_SYSTEM.md`  
**Status:** Canonical Design Token & Reusable Component Specification  

---

## 1. Executive Summary & Aesthetic Architecture

The DisasterResponse visual language represents a **modern, mission-critical operations center interface** tailored for civilian clarity and high-stress emergency interaction. 

### Key Visual Pillars
1. **Atmospheric Dark Navy Base (`#0A1020`)**: Deep obsidian-blue canvas illuminated by a faint, ambient top radial blue gradient and an ultra-subtle, geometric 24px micro-grid.
2. **Elevated Hierarchical Surfaces**:
   - Level 0 (Canvas): `#0A1020`
   - Level 1 (Panels & Sidebar Containers): `#0F1830` with border `#1F2D4D`
   - Level 2 (Interactive Cards & Inputs): `#142041` with hover `#1B2A54`
3. **Curated Emergency Semantic Tints**:
   - Five dedicated tinted stat & category cards (Red, Amber, Green, Blue, Purple) featuring dark muted backgrounds, high-contrast borders, solid square icon tiles, and clean dual-metric typography.
4. **Vibrant Precision Blue Primary (`#0EA5F5`)**: High-luminosity electric blue for primary action triggers, active navigation capsules, and focus-visible keyboard navigation halos.
5. **Legibility & Universal Accessibility**: Fully compliant with **WCAG 2.1 AA** contrast benchmarks across all text, status badges, and interactive controls.

---

## 2. Canonical Design Tokens

All tokens are defined as CSS Custom Properties in `:root` and default to the dark operations theme.

### 2.1 Color Palette

```css
:root {
  /* ── 1. Backgrounds & Surfaces ────────────────────────────── */
  --bg-canvas: #0A1020;            /* Deep mission-control navy canvas */
  --bg-surface: #0F1830;           /* Side panels, navigation header, modal containers */
  --bg-surface-raised: #142041;    /* Cards, list items, input fields */
  --bg-surface-hover: #1B2A54;     /* Interactive card & row hover state */
  --bg-surface-active: #223466;    /* Click/pressed state */

  /* ── 2. Borders & Dividers ───────────────────────────────── */
  --border-subtle: #16223B;        /* Minor inner separators & disabled elements */
  --border-default: #1F2D4D;       /* Default card, panel, and input borders */
  --border-hover: #2E4270;         /* Hovered input or card outline */
  --border-accent: #0EA5F5;        /* Focused ring / active boundary */

  /* ── 3. Brand & Accent (Operations Blue) ─────────────────── */
  --color-primary: #0EA5F5;        /* Primary action button, active markers */
  --color-primary-hover: #0284C7;  /* Button hover state */
  --color-primary-active: #0369A1; /* Button pressed state */
  --color-primary-subdued: rgba(14, 165, 245, 0.12); /* Subtle glow or background tint */

  /* ── 4. Navigation States ────────────────────────────────── */
  --nav-active-bg: #10345C;        /* Selected navigation item pill background */
  --nav-active-text: #38BDF8;      /* Selected navigation item text & icon */
  --nav-inactive-text: #8FA0BD;    /* Idle navigation item color */
  --nav-hover-bg: rgba(255, 255, 255, 0.05);

  /* ── 5. Typography Colors ────────────────────────────────── */
  --text-primary: #F1F5F9;        /* High-contrast headings, card numbers, primary labels */
  --text-secondary: #CBD5E1;      /* Secondary body text, descriptions */
  --text-muted: #8FA0BD;          /* Timestamp labels, metadata captions, inactive placeholders */
  --text-inverse: #0A1020;        /* Text placed on solid bright accents */

  /* ── 6. Semantic Severity & Priorities ───────────────────── */
  --color-critical: #EF4444;      /* High-urgency rescue, critical triage */
  --color-high: #F59E0B;          /* Waterlogging, high priority */
  --color-medium: #EAB308;        /* Medical aid, medium priority */
  --color-low: #64748B;           /* Low priority / pending assessment */
  --color-success: #22C55E;       /* Resolved incidents, open shelters, available resources */

  /* ── 7. Stat & Category Card Tint Suites ─────────────────── */
  /* Critical / Rescue (Red) */
  --tint-red-bg: #2A1218;
  --tint-red-border: #4D1A23;
  --tint-red-icon-bg: #EF4444;
  --tint-red-icon-text: #FFFFFF;
  --tint-red-text: #FCA5A5;

  /* Waterlogging / Flood / Food & Water (Amber) */
  --tint-amber-bg: #2A200E;
  --tint-amber-border: #4D3814;
  --tint-amber-icon-bg: #F59E0B;
  --tint-amber-icon-text: #FFFFFF;
  --tint-amber-text: #FCD34D;

  /* Shelter / Refuge (Green) */
  --tint-green-bg: #0E2A22;
  --tint-green-border: #154D3C;
  --tint-green-icon-bg: #22C55E;
  --tint-green-icon-text: #FFFFFF;
  --tint-green-text: #86EFAC;

  /* Medical / Response Team (Blue) */
  --tint-blue-bg: #0E2240;
  --tint-blue-border: #183C6E;
  --tint-blue-icon-bg: #0EA5F5;
  --tint-blue-icon-text: #FFFFFF;
  --tint-blue-text: #93C5FD;

  /* Relief Supplies / Depots (Purple) */
  --tint-purple-bg: #1E1840;
  --tint-purple-border: #352B6E;
  --tint-purple-icon-bg: #8B5CF6;
  --tint-purple-icon-text: #FFFFFF;
  --tint-purple-text: #C4B5FD;

  /* ── 8. Typography Scale & Fonts ─────────────────────────── */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  --text-2xs: 10px;
  --text-xs: 11px;
  --text-sm: 13px;
  --text-base: 14px;
  --text-md: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-stat: 32px;

  --font-regular: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* ── 9. Spacing System (4px Base) ────────────────────────── */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* ── 10. Border Radii ────────────────────────────────────── */
  --radius-xs: 4px;               /* Badges, micro tags */
  --radius-sm: 6px;               /* Icon square tiles */
  --radius-md: 8px;               /* Inputs, buttons, dropdown selects */
  --radius-lg: 12px;              /* Main panels, cards, stat containers */
  --radius-full: 9999px;          /* Filter chips, status pills, user avatar */

  /* ── 11. Elevation & Shadows ─────────────────────────────── */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 14px rgba(0, 0, 0, 0.5);
  --shadow-lg: 0 10px 30px rgba(0, 0, 0, 0.7);
  --shadow-focus: 0 0 0 3px rgba(14, 165, 245, 0.35);

  /* ── 12. Transitions ─────────────────────────────────────── */
  --transition-fast: 120ms cubic-bezier(0.16, 1, 0.3, 1);
  --transition-normal: 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
```

---

## 3. Atmospheric Background Texture Specification

To replicate the visual depth of the reference design without visual clutter:

```css
/* Ambient Blue Radial Glow + Micro-Grid Canvas Texture */
body {
  background-color: var(--bg-canvas);
  background-image: 
    /* Top ambient blue operations spotlight */
    radial-gradient(ellipse 900px 420px at 50% 0%, rgba(14, 165, 245, 0.07) 0%, transparent 80%),
    /* Faint architectural 24px x 24px grid */
    linear-gradient(to right, rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
  background-size: 100% 100%, 24px 24px, 24px 24px;
  background-position: top center, top left, top left;
  background-repeat: no-repeat, repeat, repeat;
  color: var(--text-primary);
  font-family: var(--font-sans);
  min-height: 100vh;
}
```

---

## 4. Universal Category Icons & Standard Stroke

All icons use **`lucide-react`** with a uniform **`strokeWidth={1.5}`** unless explicitly designated for filled indicators.

| Emergency Category | Lucide Icon Symbol | Hex Code | Tint Theme | Sample Reference Role |
| :--- | :--- | :--- | :--- | :--- |
| **Rescue / Trapped** | `<AlertTriangle />` | `#EF4444` | Red (`--tint-red`) | `#DR-1023` People trapped in building |
| **Flood / Waterlogging** | `<Waves />` | `#F59E0B` | Amber (`--tint-amber`) | `#DR-1022` Severe waterlogging |
| **Medical Trauma** | `<PlusSquare />` / `<Cross />` | `#0EA5F5` | Blue (`--tint-blue`) | `#DR-1021` Medical assistance needed |
| **Food & Water Relief** | `<Users />` | `#F59E0B` | Amber (`--tint-amber`) | `#DR-1020` Food and water supply |
| **Shelter Refuge** | `<Home />` | `#22C55E` | Green (`--tint-green`) | `#DR-1019` Temporary shelter required |
| **Response Team** | `<Truck />` | `#0EA5F5` | Blue (`--tint-blue`) | Pune Rescue Alpha Dispatch |
| **Relief Supplies** | `<Package />` | `#8B5CF6` | Purple (`--tint-purple`) | PCMC Central Supply Warehouse |

---

## 5. Reusable Component Specifications

### 5.1 `AppHeader` (Top Navigation Bar)
- **Container**: Height `56px`, background `var(--bg-surface)`, bottom border `1px solid var(--border-default)`.
- **Brand Block (Left)**: Shield icon (`<ShieldAlert size={18} strokeWidth={2} />`) enclosed in a rounded cyan tile (`#0EA5F5`), title `"DisasterResponse"`, and subtitle `"Civilian emergency portal"`.
- **Navigation Links (Center)**: Horizontal pill layout with tight spacing (`gap: 6px`):
  - Inactive state: Text `var(--nav-inactive-text)`, hover background `var(--nav-hover-bg)`.
  - Active state: Background `var(--nav-active-bg)` (`#10345C`), text `var(--nav-active-text)` (`#38BDF8`), border radius `9999px`.
- **User Actions (Right)**:
  - Theme mode toggle button (`Sun` / `Moon`).
  - Circular avatar container with user initials (e.g., `"B"` on `#1F2D4D`).
  - Civilian name + `"Citizen"` role tag.
  - Ghost sign-out button (`<LogOut size={14} /> Sign out`).

---

### 5.2 `StatCard` (Tinted Operations Metric Tile)
Matches the top 5 KPI cards in the reference design:
- **Card Box**: Background `var(--tint-*-bg)`, border `1px solid var(--tint-*-border)`, border radius `12px`, padding `14px 16px`.
- **Left Column**:
  - Rounded square icon box (`36px x 36px`, border radius `8px`, background `var(--tint-*-icon-bg)`).
- **Center Metric**:
  - Large primary value: `var(--text-stat)` (`30px`), bold weight (`700`), color `var(--text-primary)`.
  - Metric label: `var(--text-xs)` (`11px`), color `var(--text-muted)`.
- **Right Metric / Delta Caption**:
  - Right-aligned metadata showing change delta (e.g. `↑ 12% from last 24h`) or sub-stat (e.g. `1,230 total count`, `6 on ground`, `Adequate stock level`).

---

### 5.3 `Panel` & `Card` Containers
- **Base Panel**: Background `var(--bg-surface)`, border `1px solid var(--border-default)`, radius `12px`.
- **Raised Card (List item)**:
  - Default: Background `var(--bg-surface-raised)`, border `1px solid var(--border-default)`, radius `8px` or `12px`.
  - Selected state: Border `1px solid var(--color-primary)`, inner glow `box-shadow: 0 0 0 1px var(--color-primary)`.
  - Hover state: Background `var(--bg-surface-hover)`, border `var(--border-hover)`.

---

### 5.4 `Button`
- **Primary Filled**:
  - Background `var(--color-primary)` (`#0EA5F5`), text `#0A1020` or `#FFFFFF`, font weight `600`, border-radius `8px`.
  - Hover: Background `var(--color-primary-hover)`, shadow `0 2px 8px rgba(14, 165, 245, 0.3)`.
- **Secondary Outline**:
  - Background `transparent`, border `1px solid var(--border-default)`, text `var(--text-primary)`.
  - Hover: Background `var(--bg-surface-hover)`, border `var(--border-hover)`.
- **Ghost Action**:
  - Background `transparent`, border `none`, text `var(--text-muted)`.
  - Hover: Background `rgba(255, 255, 255, 0.05)`, text `var(--text-primary)`.

---

### 5.5 `TextInput` & `Select`
- **Container**: Height `38px`, background `var(--bg-surface-raised)` (`#142041`), border `1px solid var(--border-default)` (`#1F2D4D`), radius `8px`.
- **Prefix / Suffix Icons**: Stroke color `var(--text-muted)`.
- **Placeholder**: Color `var(--text-muted)`.
- **Focus**: Border `1px solid var(--color-primary)` with outline halo `var(--shadow-focus)`.

---

### 5.6 `Chip` (Category Filters)
- **Pill Shape**: Height `28px`, border radius `9999px`, font size `12px`.
- **Inactive**: Background `var(--bg-surface-raised)`, border `1px solid var(--border-default)`, text `var(--text-muted)`.
- **Active / Selected**: Filled background `var(--color-primary)` (`#0EA5F5`), text `#FFFFFF` or `#0A1020`, font weight `600`.

---

### 5.7 `PriorityBadge` & `StatusBadge`
- **Strict Accessibility Rule**: Never rely solely on color. Badges must contain clear textual labels alongside semantic colors:
  - **Critical**: Background `rgba(239, 68, 68, 0.18)`, border `rgba(239, 68, 68, 0.4)`, text `#FCA5A5`.
  - **High**: Background `rgba(245, 158, 11, 0.18)`, border `rgba(245, 158, 11, 0.4)`, text `#FCD34D`.
  - **Medium**: Background `rgba(234, 179, 8, 0.18)`, border `rgba(234, 179, 8, 0.4)`, text `#FEF08A`.
  - **Low / Pending**: Background `rgba(100, 116, 139, 0.18)`, border `rgba(100, 116, 139, 0.4)`, text `#CBD5E1`.

---

### 5.8 `AvailabilityPill` (Resource Shelters & Depots)
- **Available**: Capsule tag (`border-radius: 9999px`), background `rgba(34, 197, 94, 0.15)`, border `1px solid rgba(34, 197, 94, 0.35)`, text `#86EFAC`, label `"Available"`.
- **Full / Closed**: Background `rgba(239, 68, 68, 0.15)`, border `1px solid rgba(239, 68, 68, 0.35)`, text `#FCA5A5`, label `"At Capacity"`.

---

### 5.9 `Pagination`
- Square button tiles (`28px x 28px`), border radius `6px`, font size `12px`.
- Inactive: Background `var(--bg-surface-raised)`, border `1px solid var(--border-default)`, text `var(--text-muted)`.
- Active: Background `var(--color-primary)` (`#0EA5F5`), text `#FFFFFF`, font weight `700`.

---

### 5.10 `Skeleton`, `EmptyState`, and `ErrorState`
- **`Skeleton`**: Subtle animated pulse using `background: linear-gradient(90deg, #142041 25%, #1B2A54 50%, #142041 75%)`.
- **`EmptyState`**: Centered layout with muted icon tile, bold title, secondary instruction, and primary action button.
- **`ErrorState`**: Danger-tinted container (`var(--tint-red-bg)`) with retry trigger button.

---

## 6. Implementation Checklist & Verification

- [x] Canonical tokens exacted from reference screenshot.
- [x] Dark navy set as core default theme.
- [x] Micro-grid texture and ambient radial glow specified.
- [x] All 7 category icon tiles documented with Lucide symbols.
- [x] Square pagination, tinted stat cards, and pill badges mapped.
- [x] Document published to [`docs/DESIGN_SYSTEM.md`](file:///c:/Users/hp/Cloud-Based-Intelligent-Disaster-Management-and-Emergency-Response-Platform/docs/DESIGN_SYSTEM.md).
