import { DisplayClient } from "@/modules/room/ui/display-client";

export const metadata = { referrer: "no-referrer" as const };

export default async function DisplayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <DisplayClient code={code.toUpperCase()} />;
}
