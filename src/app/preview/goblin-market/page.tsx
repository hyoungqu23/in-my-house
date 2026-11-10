import type { Metadata, Viewport } from "next";
import { MarketDesignPreview } from "@/modules/goblin-market/ui/design-preview";

export const metadata: Metadata = {
  title: "도깨비 야시장 · 디자인 미리보기",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#f7f3e9", colorScheme: "light" };

export default function GoblinMarketPreviewPage() {
  return <MarketDesignPreview />;
}
