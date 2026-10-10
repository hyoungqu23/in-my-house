import { INN_FURNITURE, INN_GUESTS, INN_ROOMS } from "../domain/content";
import { guestRooms } from "../domain/rules";
import type { InnBoard as Board, InnScore } from "../domain/types";
import { InnFurnitureArt, InnGuestArt } from "./art";
import styles from "./game.module.css";

export function InnBoard({ board, night, label, score, legalRooms = [], onPlace }: {
  board: Board; night: boolean; label: string; score?: InnScore;
  legalRooms?: number[]; onPlace?: (position: number) => void;
}) {
  return <div className={`${styles.house} ${night ? styles.nightHouse : ""}`} role="group" aria-label={label}>
    <div className={styles.roof}><span>{night ? "보름달이 머무는 집" : "오늘의 손님을 기다리는 집"}</span></div>
    <div className={styles.rooms}>
      {INN_ROOMS.map((room, p) => {
        const furniture = board.furniture.find(item => item.position === p);
        const names = board.guests.filter(guest => guestRooms(guest).includes(p)).map(guest => INN_GUESTS[guest.kind].name);
        const wet = score?.wetRooms.includes(p);
        return <button key={room} type="button" data-room={p} className={`${styles.room} ${wet ? styles.wet : ""} ${legalRooms.includes(p) ? styles.destination : ""}`} disabled={!onPlace || !legalRooms.includes(p)} onClick={() => onPlace?.(p)} aria-label={`${room}호${names.length ? ` · ${names.join(" · ")}` : " · 빈방"}${furniture ? ` · ${INN_FURNITURE[furniture.kind].name}` : ""}${wet ? " · 젖음" : ""}`}>
          <span className={styles.roomLabel}>{room}<span>{wet ? "젖음" : ""}</span></span>
          <span className={styles.roomFurniture}>{furniture ? <><InnFurnitureArt kind={furniture.kind} /><span>{INN_FURNITURE[furniture.kind].name}</span></> : <span>가구 없음</span>}</span>
        </button>;
      })}
      <div className={styles.figures} aria-hidden="true">
        {board.guests.filter(guest => guest.position >= 0).map(guest => <div key={guest.id} className={`${styles.figure} ${guest.kind === "cat" ? styles.ceiling : ""} ${guest.kind === "rabbit" ? styles.rabbit : ""}`} style={{ gridColumn: `${guest.position % 3 + 1} / span ${guest.kind === "rabbit" ? 2 : 1}`, gridRow: Math.floor(guest.position / 3) + 1 }}>
          <InnGuestArt kind={guest.kind} night={night} />
          {score?.guests.find(row => row.id === guest.id)?.sleeping === false && <span className={styles.awake}>못 잠</span>}
        </div>)}
      </div>
    </div>
    {board.guests.some(guest => guest.position < 0) && <p className={styles.lobbyGuests}>현관 대기석 · {board.guests.filter(guest => guest.position < 0).map(guest => INN_GUESTS[guest.kind].name).join(", ")}</p>}
  </div>;
}
