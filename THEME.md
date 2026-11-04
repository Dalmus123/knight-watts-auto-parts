# Knight Watts Auto Parts - Monochrome Theme Guide

## Overview

This website uses a **monochrome grey palette** as its primary design language. The theme emphasizes visual hierarchy through different grey depths while maintaining excellent readability (WCAG AA compliant).

## Color Palette

The theme is built on a 10-level greyscale from light to dark:

| Variable | Hex | Usage |
|----------|-----|-------|
| `--grey-50` | `#F8F9FA` | Off-white - lightest backgrounds, cards on light sections |
| `--grey-100` | `#E9ECEF` | Very light grey - subtle backgrounds |
| `--grey-200` | `#DEE2E6` | Light grey - hero sections, hover states |
| `--grey-300` | `#CED4DA` | Mid-light grey - borders, interactive elements |
| `--grey-400` | `#ADB5BD` | Mid grey - muted text, secondary elements |
| `--grey-500` | `#6C757D` | Neutral grey - secondary text |
| `--grey-600` | `#495057` | Mid-dark grey - body text on light backgrounds |
| `--grey-700` | `#343A40` | Dark grey - cards, headings |
| `--grey-800` | `#212529` | Deep grey/charcoal - main dark background |
| `--grey-900` | `#0A0C0E` | Near-black - footer, darkest elements |

## Section Color Guidelines

Different sections use different grey depths for visual distinction:

- **Hero Section**: Light grey (`--grey-200` to `--grey-300` gradient)
- **Product Sections**: Mid-dark background (`--grey-800`)
- **Cards**: Dark grey (`--grey-700`)
- **Footer**: Near-black (`--grey-900`)
- **Off-white Elements**: Cards on light backgrounds (`--grey-50`)

## Semantic Variables

Use these semantic variables in your CSS (defined in `theme.css`):

### Backgrounds
- `--bg-lightest`: Off-white for cards and inputs
- `--bg-light`: Light section backgrounds
- `--bg-hero`: Hero section background
- `--bg-mid`: Mid-tone sections
- `--bg-dark`: Main dark background
- `--bg-darker`: Footer and darkest sections

### Text
- `--text-primary`: Primary text (light on dark)
- `--text-secondary`: Secondary text
- `--text-muted`: Hints and less important text
- `--text-dark`: Text on light backgrounds
- `--text-heading`: Headings

### Interactive Elements
- `--interactive-default`: Default button/link color
- `--interactive-hover`: Hover states
- `--interactive-active`: Active/pressed states

### Borders
- `--border-light`: Borders on dark backgrounds
- `--border-mid`: Mid-tone borders
- `--border-dark`: Subtle borders

## Accessibility Exceptions

Only **focus states** and **error messages** use color for accessibility:

- **Focus Ring**: Blue (`--focus-ring: #4A9EFF`) - for keyboard navigation
- **Error Messages**: Red (`--error: #EF4444`) - for critical feedback

All other states (success, warning, etc.) use grey tones.

## Implementation

### For New Pages

1. Link the theme file in your HTML:
   ```html
   <link rel="stylesheet" href="theme.css">
   ```

2. Use semantic variables in your CSS:
   ```css
   .my-component {
       background: var(--card-bg);
       color: var(--text-primary);
       border: 1px solid var(--border-light);
   }
   ```

### For Existing Pages

The main `styles.css` already imports `theme.css` and maps legacy variables to the new theme. Pages using the old variable names will automatically use the monochrome palette.

## Text Contrast

All text combinations meet **WCAG AA standards**:

- Light text (`--grey-50`) on dark backgrounds (`--grey-700` or darker) ✓
- Dark text (`--grey-800`) on light backgrounds (`--grey-200` or lighter) ✓
- Interactive elements maintain sufficient contrast in all states ✓

## Shadows

Use predefined shadow values for consistency:

- `--shadow-sm`: Subtle depth (1px)
- `--shadow-md`: Medium depth (4px)
- `--shadow-lg`: Large depth (10px)
- `--shadow-xl`: Extra large depth (20px)

## Migration Notes

The theme migration from the previous colorful design:

- **Green (`#00A86B`)** → Mid-light grey (`--grey-300`)
- **Orange (`#FF6B35`)** → Mid grey (`--grey-400`)
- **Blue accents** → Removed (except focus states)
- **Gradient overlays** → Grey gradients for depth

## Best Practices

1. **Always use CSS variables** - Never hardcode hex values
2. **Different depths for sections** - Use lighter greys for hero, darker for products, darkest for footer
3. **Maintain contrast** - Test readability before deploying
4. **Consistent shadows** - Use predefined shadow variables
5. **Preserve accessibility colors** - Don't override focus/error colors

## Files Using This Theme

- `theme.css` - Central theme definition (import this first)
- `styles.css` - Main stylesheet (imports theme.css)
- `ai-chat-widget.css` - Chat widget styles (imports theme.css)

All HTML pages automatically inherit the theme through these stylesheets.

---

**Last Updated**: November 2026  
**Theme Version**: 1.0 - Monochrome Grey
