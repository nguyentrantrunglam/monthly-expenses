"use client";

import { useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MusicQueueItem } from "@/hooks/useFamilyMusic";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GripVertical, Trash2 } from "lucide-react";

type Props = {
  queue: MusicQueueItem[];
  currentId: string | null | undefined;
  actionBusy: boolean;
  onSelect: (itemId: string) => void;
  onRemove: (itemId: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
};

function SortableRow({
  item,
  index,
  isCurrent,
  actionBusy,
  onSelect,
  onRemove,
}: {
  item: MusicQueueItem;
  index: number;
  isCurrent: boolean;
  actionBusy: boolean;
  onSelect: (itemId: string) => void;
  onRemove: (itemId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li ref={setNodeRef} style={style} className={cn(isDragging && "z-10")}>
      <div className="flex items-stretch gap-0.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className={cn(
            "flex shrink-0 cursor-grab touch-none items-center rounded-md px-0.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground active:cursor-grabbing",
            actionBusy && "pointer-events-none opacity-50",
          )}
          aria-label="Kéo để đổi thứ tự"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={actionBusy}
          onClick={() => void onSelect(item.id)}
          className={cn(
            "min-w-0 flex-1 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            actionBusy && "cursor-not-allowed opacity-60",
          )}
          aria-current={isCurrent ? "true" : undefined}
          aria-label={`Phát: ${item.title}`}
        >
          <Card
            size="sm"
            className={cn(
              "flex flex-row items-center gap-2 overflow-visible p-2 transition-colors hover:bg-muted/50",
              isCurrent && "z-1 ring-2 ring-primary/60",
            )}
          >
            <div className="relative h-11 w-18 shrink-0 self-center overflow-hidden rounded-md bg-muted">
              {item.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnailUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
              {isCurrent && (
                <span className="absolute bottom-0.5 left-0.5 rounded bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                  Đang phát
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden">
              <p className="line-clamp-2 text-xs font-medium leading-snug">
                {index + 1}. {item.title}
              </p>
              <p className="line-clamp-1 text-[11px] text-muted-foreground">
                {item.addedByName}
              </p>
            </div>
          </Card>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0 self-center text-muted-foreground hover:text-destructive"
          disabled={actionBusy}
          aria-label={`Xóa ${item.title}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void onRemove(item.id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

export function FamilyMusicPlaylist({
  queue,
  currentId,
  actionBusy,
  onSelect,
  onRemove,
  onReorder,
}: Props) {
  const ids = useMemo(() => queue.map((q) => q.id), [queue]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = queue.findIndex((q) => q.id === active.id);
    const newIndex = queue.findIndex((q) => q.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    void onReorder(oldIndex, newIndex);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex max-h-[min(65vh,28rem)] flex-col gap-1.5 overflow-y-auto px-0.5 py-px pr-1 lg:max-h-[calc(100vh-8rem)]">
          {queue.map((item, index) => (
            <SortableRow
              key={item.id}
              item={item}
              index={index}
              isCurrent={item.id === currentId}
              actionBusy={actionBusy}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
