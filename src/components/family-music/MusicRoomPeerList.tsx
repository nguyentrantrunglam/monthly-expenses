"use client";

import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { MusicRoomPeer } from "@/hooks/useMusicRoomPresence";
import { cn } from "@/lib/utils";

type Props = {
  peers: MusicRoomPeer[];
  selfUid: string;
  className?: string;
};

export function MusicRoomPeerList({ peers, selfUid, className }: Props) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Users className="h-4 w-4 shrink-0" aria-hidden />
        Trong phòng ({peers.length})
      </div>
      {peers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có ai (hoặc đang kết nối…)</p>
      ) : (
        <ul className="space-y-1.5">
          {peers.map((p) => {
            const isSelf = p.uid === selfUid;
            return (
              <li
                key={p.uid}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span
                  className={cn(
                    "min-w-0 truncate",
                    isSelf ? "font-medium text-foreground" : "text-foreground/90",
                  )}
                >
                  {p.displayName}
                  {isSelf ? " (bạn)" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
