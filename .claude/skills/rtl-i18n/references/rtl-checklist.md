# RTL Verification Checklist

Run through this checklist for every component that has user-visible content.

## Layout
- [ ] Uses logical properties: `ms-`/`me-`/`ps-`/`pe-` (not `ml-`/`mr-`/`pl-`/`pr-`)
- [ ] Positioning uses `start-`/`end-` (not `left-`/`right-`)
- [ ] Borders use `border-s-`/`border-e-` (not `border-l-`/`border-r-`)
- [ ] Text alignment uses `text-start`/`text-end` (not `text-left`/`text-right`)
- [ ] Flex/grid layouts auto-reverse correctly in RTL

## Icons & Images
- [ ] Directional icons (arrows, chevrons, back) use `rtl:rotate-180`
- [ ] Non-directional icons (trash, star, heart) do NOT rotate
- [ ] Icon+text combos maintain correct order in both directions

## Text
- [ ] All strings use `t()` from `useTranslation()` — no hardcoded text
- [ ] Placeholder text is translated
- [ ] Error messages are translated
- [ ] Numbers remain LTR (use `dir="ltr"` inline if needed)
- [ ] Mixed LTR/RTL text renders correctly (e.g., English names in Hebrew context)

## Forms
- [ ] Input text direction matches content (Hebrew inputs RTL, email/URL inputs LTR)
- [ ] Labels align correctly with their inputs
- [ ] Validation messages appear on the correct side
- [ ] Dropdown arrows/indicators on correct side

## Navigation
- [ ] Back buttons point correct direction
- [ ] Swipe gestures (if any) reverse in RTL
- [ ] Tab order follows reading direction
- [ ] Breadcrumbs flow in reading direction

## Spacing & Alignment
- [ ] Asymmetric padding/margins flip correctly
- [ ] List item indentation uses logical properties
- [ ] Card layouts maintain visual balance

## Interactive Elements
- [ ] Touch targets are minimum 44x44px
- [ ] Drag handles appear on correct side
- [ ] Progress bars fill in reading direction
- [ ] Sliders/toggles work correctly

## Testing Steps
1. Switch language to Hebrew in profile settings
2. Verify layout flips correctly
3. Check all text is translated (no English leaking through)
4. Test interactive elements (buttons, forms, drag)
5. Switch back to English — verify nothing is stuck in RTL
