// Design system white-label del micrositio (base "Dwell").
// Estilos: import "@rep/ui-tenant/styles.css" en el host.
export * from "./brand.js";

export { WordmarkBleed } from "./components/wordmark-bleed.js";
export { AboutColumns, type AboutColumn } from "./components/about-columns.js";
export { BigNumber } from "./components/big-number.js";
export { PhotoPair, type Photo } from "./components/photo-pair.js";
export { PillButton, PillLink } from "./components/pill-button.js";
export { Steps, type Step } from "./components/steps.js";
export { MobileMenu, type MenuItem } from "./components/mobile-menu.js";
export { Footer, type FooterColumn, type FooterLink } from "./components/footer.js";
export { PropertyGrid, type Listing } from "./components/property-grid.js";
export { LeadForm, type LeadFormData } from "./components/lead-form.js";
export {
  ValuationForm,
  type ValuationFormData,
  type ValuationEstimate,
} from "./components/valuation-form.js";
export { Gallery, type GalleryItem } from "./components/gallery.js";
export { MobileNav } from "./components/mobile-nav.js";
export * from "./property-labels.js";
