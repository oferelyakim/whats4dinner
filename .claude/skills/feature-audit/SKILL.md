---
name: feature-audit
description: "Analyze OurTable for functionality improvements — missing features, AI opportunities, user productivity enhancements, competitor gaps, and quick wins. Use when user says 'feature audit', 'improve features', 'what's missing', 'feature ideas', 'enhance', 'AI opportunities'."
user-invocable: true
---

# Feature Audit Skill — OurTable

Systematically analyze OurTable's features to find improvements, missing functionality, AI enhancement opportunities, and user productivity gains. Acts as a product consultant who knows the codebase.

## Usage

- `/feature-audit` — Full audit across all domains
- `/feature-audit <domain>` — Audit specific domain: food, events, household, shopping, social, home
- `/feature-audit ai` — Focus on AI-powered enhancement opportunities
- `/feature-audit competitor` — Compare against competitor apps (AnyList, Cozi, OurHome, Mealime)
- `/feature-audit quick-wins` — Only low-effort, high-impact improvements
- `/feature-audit user-journey` — Analyze complete user journeys for friction points
- `/feature-audit monetization` — Features that support the subscription model

## Implementation

### 1. Current State Inventory

Read the codebase to build a current feature map. For each domain:

```bash
# Read all pages in the domain
# Read the service file for data operations
# Read the types for data model
# Check i18n keys for feature scope
```

Build a feature matrix:

| Domain | Feature | Status | Completeness | Notes |
|--------|---------|--------|--------------|-------|
| Food | Recipes CRUD | Done | 95% | Missing bulk actions |
| Food | Recipe Import (URL) | Done | 90% | AI-powered |
| ... | ... | ... | ... | ... |

### 2. Gap Analysis — Non-AI Improvements

For each domain, evaluate:

#### Data & CRUD Gaps
- Missing fields users would expect
- Bulk operations (select multiple, bulk delete/move)
- Import/export (CSV, share between circles)
- Search & filter capabilities
- Sort options

#### User Workflow Gaps
- Multi-step tasks that could be simplified
- Repetitive actions that need shortcuts
- Cross-domain connections (e.g., recipe → shopping list → store route)
- Templates and presets for common patterns
- Undo/redo for destructive actions

#### Social & Collaboration Gaps
- Notification gaps (who needs to know what?)
- Assignment and responsibility clarity
- Shared vs. personal data boundaries
- Circle member activity visibility
- Communication within the app (comments, notes)

#### Offline & PWA Gaps
- Which features break offline?
- What data should be pre-cached?
- Background sync opportunities
- Push notification triggers

### 3. AI Enhancement Opportunities

Evaluate where AI (Claude API via Edge Functions) would add clear value:

#### Smart Suggestions
- **Shopping list**: Suggest items based on meal plan / past purchases / season
- **Meal planning**: Suggest meals based on preferences, dietary restrictions, past meals
- **Chore scheduling**: Smart rotation suggestions based on fairness + availability
- **Event planning**: Suggest items/quantities based on guest count and type

#### Natural Language Input
- **Quick add**: "Add milk and eggs to grocery list" → parsed into items + correct list
- **Recipe search**: "Something quick with chicken" → filtered recipes
- **Event creation**: "Dinner party Saturday for 8" → pre-filled event
- **Chore creation**: "Clean bathroom every Tuesday" → parsed frequency + schedule

#### Content Generation
- **Meal plan generation**: Already exists — evaluate quality and UX
- **Shopping list from meal plan**: Ingredient aggregation + dedup
- **Recipe scaling**: Adjust quantities for different serving sizes
- **Menu suggestions**: Based on dietary preferences + what's in season

#### Image & Media
- **Recipe from photo**: Already exists — evaluate accuracy
- **Receipt scanning**: Scan grocery receipt → check off shopping list items
- **Ingredient recognition**: Photo of fridge contents → recipe suggestions
- **Chore verification**: Before/after photo comparison

#### Intelligence Layer
- **Usage patterns**: "You usually shop on Wednesdays — reminder?"
- **Cost tracking**: Estimate shopping list cost based on historical data
- **Nutritional info**: Auto-calculate from recipe ingredients
- **Expiration tracking**: Suggest using ingredients before they expire

### 4. Competitor Comparison

Compare against key competitors:

| App | Strength to Learn From |
|-----|----------------------|
| **AnyList** | Shopping list UX, recipe web clipper, store sections |
| **Cozi** | Family calendar integration, shared journal |
| **OurHome** | Chore points gamification, reward system |
| **Mealime** | Meal plan → grocery list flow, dietary filters |
| **Paprika** | Recipe management, pantry tracking, meal categories |
| **Todoist** | Task management UX, natural language input, subtasks |
| **Google Keep** | Quick capture, labels, reminders, collaboration |

For each, note features OurTable is missing that would be high-value.

### 5. User Productivity Enhancements

Features that save users time on daily tasks:

#### Quick Actions & Shortcuts
- Home page quick-add widgets
- Swipe gestures (swipe to complete chore, check off item)
- Long-press context menus
- Keyboard shortcuts (for desktop users)
- Widget support (Android/iOS home screen widgets via PWA)

#### Automation
- Recurring shopping lists (auto-create weekly)
- Auto-add recipe ingredients to shopping list
- Smart reminders based on context (time, location, pattern)
- Template-based event creation
- Copy last week's meal plan

#### Data Insights
- Weekly/monthly summary (meals cooked, chores completed, events hosted)
- Shopping spending patterns (if prices tracked)
- Most cooked recipes
- Chore fairness dashboard
- Activity participation stats

### 6. Generate Report

```markdown
## Feature Audit Report — OurTable
**Date**: [date] | **Scope**: [domains audited]

### Executive Summary
[Current feature maturity, biggest gaps, top opportunities]

### Feature Completeness Matrix
| Domain | Features | Completeness | Priority Gaps |
|--------|----------|--------------|---------------|

### 🚀 Top 10 Non-AI Improvements
[Ranked by impact × effort]
| # | Feature | Domain | Effort | Impact | Description |
|---|---------|--------|--------|--------|-------------|

### 🤖 Top 10 AI-Powered Enhancements
[Ranked by user value × feasibility]
| # | Feature | Domain | AI Model | Edge Function | Description |
|---|---------|--------|----------|---------------|-------------|

### ⚡ Top 5 Quick Wins (< 2 hours each)
### 🏗️ Top 5 Medium Projects (1-2 days each)
### 🎯 Top 3 Differentiators (what makes OurTable unique)

### Competitor Gap Analysis
| Feature | AnyList | Cozi | OurHome | Mealime | OurTable | Priority |
|---------|---------|------|---------|---------|----------|----------|

### Monetization Alignment
[Which improvements support the AI subscription model]

### Recommended Roadmap
[Suggested order of implementation, grouped into sprints]
```

### 7. Save & Present
- Save report to `FEATURE_AUDIT_REPORT.md` in project root
- Present executive summary and top 5 recommendations
- Ask which improvements the user wants to implement first

## Domain Reference

### Food Domain
- Services: `recipes.ts`, `shopping-lists.ts`, `stores.ts`, `meal-plans.ts`
- Pages: FoodHubPage, RecipesPage, RecipeDetailPage, RecipeFormPage, RecipeImportPage, ListsPage, ShoppingListPage, PlanPage, StoresPage, StoreRoutePage, MealMenusPage
- AI features: recipe import (URL/photo), meal plan generation

### Events Domain
- Services: `events.ts`
- Pages: EventsPage, EventDetailPage, JoinEventPage
- Key pattern: 5-tab detail, claim/assign items

### Household Domain
- Services: `chores.ts`, `activities.ts`
- Pages: HouseholdHubPage, ChoresPage, ActivitiesPage
- Key pattern: frequency/recurrence, assignment, completions

### Social Domain
- Services: `circles.ts`, `profiles.ts`
- Pages: CirclesPage, CircleDetailPage, JoinCirclePage
- Key pattern: invite codes, member management

### Home Domain
- Services: multiple (aggregates)
- Pages: HomePage
- Key pattern: daily dashboard, NLP quick actions, reminders
