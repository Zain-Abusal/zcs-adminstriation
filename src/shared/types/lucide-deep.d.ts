// Type support for deep per-icon lucide imports (see src/lib/icons.ts).
// lucide-react ships one module per icon under dist/esm/icons/*.js but only
// provides barrel types, so we declare the wildcard shape here.
declare module "lucide-react/dist/esm/icons/*" {
  import type { LucideIcon } from "lucide-react";
  const icon: LucideIcon;
  export default icon;
}
