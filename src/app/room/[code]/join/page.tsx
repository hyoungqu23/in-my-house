import Link from "next/link";
import { JoinRoomForm } from "@/modules/room/ui/join-room-form";
import { AppMark } from "@/shared/ui/icons";

export const metadata = { referrer: "no-referrer" as const };

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <main className="join-page">
      <Link href="/" className="brand-link"><AppMark /> IN MY HOUSE</Link>
      <JoinRoomForm code={code.toUpperCase()} />
      <p className="privacy-note">이 페이지는 초대 토큰을 주소 기록에서 즉시 지웁니다.</p>
    </main>
  );
}
