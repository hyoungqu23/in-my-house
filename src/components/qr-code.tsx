"use client";

import Image from "next/image";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrCode({ value, label }: { value: string; label: string }) {
  const [source, setSource] = useState<string>();
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, {
      width: 320,
      margin: 2,
      color: { dark: "#090B12", light: "#F4F1E8" },
      errorCorrectionLevel: "M",
    }).then((url) => active && setSource(url));
    return () => { active = false; };
  }, [value]);

  return (
    <div className="qr-wrap" aria-label={label}>
      {source ? (
        <Image unoptimized src={source} width={160} height={160} alt={label} />
      ) : (
        <div className="qr-skeleton" aria-label="QR 코드 생성 중" />
      )}
    </div>
  );
}
