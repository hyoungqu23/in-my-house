import type { Metadata, Viewport } from "next";
import { ForestArtPreview } from "@/modules/connected-forest/ui/art-preview";

export const metadata: Metadata = {
  title: "이어지는 숲길 · 일러스트 미리보기",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f9f5e9", colorScheme: "light" };

export default function ConnectedForestPreviewPage() {
  return <ForestArtPreview />;
}
