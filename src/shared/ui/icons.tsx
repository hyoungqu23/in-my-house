import { CircleHelp, DoorClosed, Ghost, KeyRound, MessageSquareText, Moon, ScanLine, UsersRound, Vote, Zap } from "lucide-react";

export const AppMark = ({ className = "" }: { className?: string }) => (
  <span className={`app-mark ${className}`} aria-hidden="true">
    <DoorClosed size={20} strokeWidth={2.2} />
    <span className="app-mark-light" />
  </span>
);

export { CircleHelp, DoorClosed, Ghost, KeyRound, MessageSquareText, Moon, ScanLine, UsersRound, Vote, Zap };
