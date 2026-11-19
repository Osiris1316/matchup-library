# How the page is built

The page is moving, one page at a time, from one big stylesheet and screens that reach into shared state toward small reusable pieces with their own styles. This file says where things go and the rules each layer follows, so new work lands in the right place.

## Layers

```
src/
  app/        the shell: routes, addresses, layout, page head, menu, sheet host
  pages/      one folder per page; a page reads the store and the address
  kit/        reusable pieces that only draw what they're given
  components/ app-aware widgets still reading the store (moving to kit/ or pages/ over time)
  sheets/     the pop-up sheets that edit records
  store.ts    the library in memory, drafts, sheets, toasts, this browser's preferences
  actions.ts  what buttons do: open sheets, turn drafts into saves
  versus.ts   the same for branches, answers and the Versus pairing
  styles/     tokens.css, base.css, legacy.css
```

The rules (`@matchup-library/core`) stay outside the page: the page asks `L` (the Library) what something means and never works it out itself.

## Rules

**Every page has an address.** Routes live in `app/router.tsx`, and every address is built by `app/paths.ts`, never by hand. What a page is showing belongs in its address when someone would want to come back to it or share it: the civ, the tab, the Versus pairing. Old hash addresses (`#civ-rus`) still open, through `legacyPath`. From code that isn't a component, move with `go()` from `app/navigation.ts`.

**Kit pieces only draw.** A component in `kit/` takes everything it shows as props. It never imports the store, the actions or the rules, so it can be used on any page and tested alone. The page works out what a thing means (documented, tested, picked) and hands the kit the look (`outline="dashed"`, `picked`).

**Each piece owns its styles.** A kit piece has a `.module.css` beside it; its class names can't collide with any other. Parents don't style a child's insides: if a page needs a variant, the piece gets a prop for it. A few rules in `legacy.css` still reach into kit pieces through their `data-*` hooks; they're marked as bridges and go when their page moves.

**Values come from tokens.** Colors, space, type sizes, corners and layers are variables in `styles/tokens.css`. `--space-N` is N times 2px. The breakpoints (wide from 1100px, phone to 640px) are there as a note and in `kit/breakpoints.ts` for code, since a media query can't read a variable.

**Pages subscribe to the store.** Each page calls `useStore()` so it redraws when the library changes. State that only one page uses lives in the address or in that page.

**legacy.css only shrinks.** When a page is rebuilt, its rules move into modules beside it and leave `legacy.css`.

**The page head is the shell's.** Every page uses `app/PageHead.tsx`: the menu button, then the title (or a control standing in for it, as the civ picker does, with the title kept for screen readers), the page's tools, and an aside. It measures its own height into `--page-head-height`, so anything that sticks under it lines up on any page and at any width.

## The kit so far

| Piece | What it draws |
| --- | --- |
| `kit/pills/Pill.tsx` | The element pill (tile colored by type, name by intent), the mini pill, a row of them, and the separators. `components/Pill.tsx` works out an element's look and draws these. |
| `kit/play-card/PlayCard.tsx` | A play as a card: name, badge, steps, a warning note, a plain detail line (such as your answer); solid, dashed or faint outline; picked, marked and dimmed states; an `anchor` for lines. Used by a civ's stages and Versus. |
| `kit/motion.ts` | Slides things to their new places when a change moves them (the browser's view transitions): `animate()` for a store change, `go(..., { animate: true })` for an address change, and `vtName()` for naming what moves. Skipped when the system asks for less motion. |
| `kit/lines/` | Lines between cards: `geometry.ts` (pure, tested), `useMeasured` (measures after layout, on resize and when the host changes size; wide screens only) and `LineLayer` (draws the paths and labels). |

## A page built this way

`pages/civs/stages/` is the first page rebuilt on these rules: `CivStages.tsx` lays it out, `StagesRail.tsx` and `StagesKey.tsx` are its parts, `view.ts` works out what it shows, `order.ts` sorts and folds its columns (pure, tested in `test/order.test.ts`), and `CivStages.module.css` holds all of its styles. The narrowing itself is in the rules (`packages/core/src/routes.ts`), with its own tests. Use it as the pattern for the next page.

## Tests

`pnpm test` runs the rules tests in `packages/core` (including routes and narrowing) and the page's own in `packages/web/test`: the addresses (including old hash ones), the line geometry, and the civ page's order and folding.
