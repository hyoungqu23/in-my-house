import { INN_FURNITURE, INN_GUESTS } from "../domain/content";
import type { InnFurnitureKind, InnGuestKind } from "../domain/types";
import styles from "./game.module.css";

export function InnGuestArt({ kind, night = false }: { kind: InnGuestKind; night?: boolean }) {
  const index = INN_GUESTS[kind].sprite + Number(night);
  return <span aria-hidden="true" className={styles.guestArt} style={{ backgroundPosition: `${index % 4 / 3 * 100}% ${Math.floor(index / 4) / 2 * 100}%` }} />;
}
export function InnFurnitureArt({ kind }: { kind: InnFurnitureKind }) {
  const index = INN_FURNITURE[kind].sprite;
  return <span aria-hidden="true" className={styles.furnitureArt} style={{ backgroundPosition: `${index % 3 / 2 * 100}% ${Math.floor(index / 3) * 100}%` }} />;
}
