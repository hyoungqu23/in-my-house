import { DoorClosed, Ghost, KeyRound, Moon, ScanLine, UsersRound, Zap } from "lucide-react";

export const AppMark = ({ className = "" }: { className?: string }) => (
  <span className={`app-mark ${className}`} aria-hidden="true">
    <DoorClosed size={20} strokeWidth={2.2} />
    <span className="app-mark-light" />
  </span>
);

export { DoorClosed, Ghost, KeyRound, Moon, ScanLine, UsersRound, Zap };
