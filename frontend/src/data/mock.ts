/** Demo data for the example store. The real app loads this from `GET /public/example`. */
import type { PieceSpec } from "../lib/render";

export type Bilingual = { en: string; es: string };

export interface Product {
  id: string;
  name: Bilingual;
  description: Bilingual;
  price: number;
  status: "ready_360" | "processing" | "failed";
  fidelity: number;
  frames: number;
  views: number;
  clicks: number;
  piece: PieceSpec;
}

export interface Store {
  slug: string;
  name: string;
  tagline: Bilingual;
  tone: "warm" | "minimal" | "rustic" | "playful";
  colors: string[];
  whatsapp: string;
  currency: string;
  products: Product[];
}

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

export const EXAMPLE_STORE: Store = {
  slug: "example",
  name: "Casa Arcilla",
  tagline: {
    en: "Small-batch pieces, shaped and finished by hand.",
    es: "Piezas en pequeñas tandas, modeladas y terminadas a mano.",
  },
  tone: "warm",
  colors: ["#c2623f", "#e9c9a6", "#6b7a4f", "#2b2622"],
  // Fictional number: replace with the artisan's own in the real app.
  whatsapp: "15550100000",
  currency: "USD",
  products: [
    {
      id: "terracotta-vase",
      name: { en: "Terracotta vase", es: "Jarrón de terracota" },
      description: {
        en: "A hand-thrown vase with a carved diamond band. Glazed by hand.",
        es: "Un jarrón torneado a mano con una banda de rombos tallados. Esmaltado a mano.",
      },
      price: 48,
      status: "ready_360",
      fidelity: 0.93,
      frames: 24,
      views: 612,
      clicks: 51,
      piece: VASE,
    },
    {
      id: "woven-basket",
      name: { en: "Woven basket", es: "Canasta tejida" },
      description: {
        en: "A tapered basket woven in a tight checker pattern.",
        es: "Una canasta cónica tejida con un patrón de damero apretado.",
      },
      price: 36,
      status: "ready_360",
      fidelity: 0.9,
      frames: 24,
      views: 431,
      clicks: 29,
      piece: BASKET,
    },
    {
      id: "wooden-bowl",
      name: { en: "Wooden bowl", es: "Bowl de madera" },
      description: {
        en: "A turned bowl that shows the natural rings of the wood.",
        es: "Un bowl torneado que deja ver los anillos naturales de la madera.",
      },
      price: 42,
      status: "ready_360",
      fidelity: 0.91,
      frames: 24,
      views: 241,
      clicks: 17,
      piece: BOWL,
    },
  ],
};

export function findStore(slug: string | undefined): Store | undefined {
  return slug === EXAMPLE_STORE.slug ? EXAMPLE_STORE : undefined;
}
