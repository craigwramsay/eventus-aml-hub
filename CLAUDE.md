model: opus

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

eventus-aml-hub is a Next.js 16 web application using the App Router pattern. Currently contains the default starter template, ready for AML-related feature development.

## Commands

```bash
npm run dev      # Start development server at http://localhost:3000
npm run build    # Build for production
npm start        # Start production server
npm run lint     # Run ESLint
npm test         # Run tests once (vitest run)
npm run test:watch  # Run tests in watch mode
```

## Tech Stack

- **Framework**: Next.js 16.1.6 with App Router
- **React**: 19.2.3
- **Language**: TypeScript 5
- **Styling**: CSS Modules + Global CSS with dark mode support
- **Fonts**: Geist Sans and Geist Mono (via next/font)
- **Linting**: ESLint 9 with Next.js Core Web Vitals rules
- **Testing**: Vitest

## Architecture

### Directory Structure

- `src/app/` - App Router routes and pages (file-based routing)
- `src/lib/rules-engine/` - Deterministic AML assessment engine
- `public/` - Static assets served at root

### Key Patterns

- **Server Components by default** - Modern Next.js approach
- **CSS Modules** - Component-scoped styles (`*.module.css`)
- **CSS Variables** - Theming via globals.css with light/dark mode via `prefers-color-scheme`
- **Path aliases** - `@/*` maps to `./src/*`

### AML Rules Engine (`src/lib/rules-engine/`)

Pure TypeScript, deterministic assessment engine:
- `types.ts` - AssessmentInput, AssessmentOutput, RiskLevel types
- `score.ts` - Risk factor calculation (country, PEP, transaction velocity, etc.)
- `requirements.ts` - Maps risk levels to required compliance checks
- `index.ts` - `runAssessment()` entry point

Usage: `runAssessment(input, timestamp?)` returns deterministic output for identical inputs.

### Configuration

- TypeScript strict mode enabled
- Next.js config is empty (`next.config.ts`) - ready for customization
- ESLint ignores `.next/`, `out/`, `build/` directories
