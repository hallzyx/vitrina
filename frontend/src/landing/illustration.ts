/**
 * Illustrations for the landing page only: procedural pieces (drawn by `lib/render.ts` and the three.js
 * hero) and the sample copy shown in the feature cards. None of this is product data; real stores and
 * the example store always come from the API.
 */
import type { PieceSpec } from "../lib/render";

export const VASE: PieceSpec = {
  id: "vase",
  shape: "vase",
  pattern: "bands",
  base: [196, 108, 76],
  accent: [244, 226, 200],
  glossy: true,
};

export const BASKET: PieceSpec = {
  id: "basket",
  shape: "basket",
  pattern: "weave",
  base: [214, 178, 122],
  accent: [150, 112, 66],
  glossy: false,
};

export const BOWL: PieceSpec = {
  id: "bowl",
  shape: "bowl",
  pattern: "grain",
  base: [176, 122, 76],
  accent: [96, 60, 34],
  glossy: false,
};

type Bilingual = { en: string; es: string };

/** A fictional workshop used to illustrate the feature cards. */
export const ILLUSTRATION = {
  storeName: "Casa Arcilla",
  initials: "CA",
  currency: "USD",
  colors: ["#c2623f", "#e9c9a6", "#6b7a4f", "#2b2622"],
  order: {
    piece: VASE,
    name: { en: "Terracotta vase", es: "Jarrón de terracota" } as Bilingual,
    price: 48,
  },
  listing: {
    piece: BASKET,
    name: { en: "Woven basket", es: "Canasta tejida" } as Bilingual,
    description: {
      en: "A tapered basket woven in a tight checker pattern.",
      es: "Una canasta cónica tejida con un patrón de damero apretado.",
    } as Bilingual,
  },
  /** Fallback cards for the proof section when the example store cannot be loaded. */
  pieces: [
    { piece: VASE, name: { en: "Vase", es: "Jarrón" } as Bilingual },
    { piece: BASKET, name: { en: "Basket", es: "Canasta" } as Bilingual },
    { piece: BOWL, name: { en: "Bowl", es: "Cuenco" } as Bilingual },
  ],
};
