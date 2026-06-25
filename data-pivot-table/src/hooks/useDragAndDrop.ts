import type {
  CollisionDetection,
  DragEndEvent,
  DragStartEvent,
  DroppableContainer,
} from '@dnd-kit/core';
import { closestCenter, PointerSensor, pointerWithin, useSensor, useSensors } from '@dnd-kit/core';
import { useCallback, useRef, useState } from 'react';
import type { Field } from '../types';
import { canDropToZone, type SpatialZoneId } from '../utils/fieldHelpers';

interface DragField {
  name: string;
  zoneId: SpatialZoneId;
  isCalculated: boolean;
  isMapped: boolean;
}

interface SpatialDragData {
  type?: string;
  fieldName?: string;
  zoneId?: SpatialZoneId;
  isActive?: boolean;
}

const getSpatialDragData = (container?: DroppableContainer): SpatialDragData | undefined =>
  container?.data.current as SpatialDragData | undefined;

interface UseDragAndDropProps {
  fields: Field[];
  measures: Field[];
  dimensions: Field[];
  toggleValueField: (field: Field, targetIndex?: number) => void;
  toggleRowField: (field: Field, targetIndex?: number) => void;
  toggleColField: (field: Field, targetIndex?: number) => void;
  removeRowField: (fieldName: string) => void;
  removeColField: (fieldName: string) => void;
  removeValueField: (fieldName: string) => void;
  reorderFields: (
    zoneId: SpatialZoneId,
    activeName: string,
    overName: string,
    targetIndex?: number
  ) => void;
  moveFieldToIndex: (zoneId: SpatialZoneId, fieldName: string, targetIndex: number) => void;
  activateFieldAtIndex: (zoneId: SpatialZoneId, fieldName: string, targetIndex: number) => void;
  transferField: (
    fieldName: string,
    fromZone: SpatialZoneId,
    toZone: SpatialZoneId,
    targetIndex?: number
  ) => void;
}

export function useDragAndDrop({
  fields,
  measures,
  dimensions,
  toggleValueField,
  toggleRowField,
  toggleColField,
  removeRowField,
  removeColField,
  removeValueField,
  reorderFields,
  moveFieldToIndex,
  activateFieldAtIndex,
  transferField,
}: UseDragAndDropProps) {
  const [activeDragField, setActiveDragField] = useState<DragField | null>(null);
  const activeDragIdRef = useRef<string | null>(null);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  // Track pointer position during drag for left/right positioning
  const handlePointerMove = useCallback((e: PointerEvent) => {
    pointerPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // Custom collision detection with left/right half positioning
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerPos = pointerPosRef.current;
    const activeId = activeDragIdRef.current;
    if (!pointerPos || !activeId) return closestCenter(args);

    const pointerCollisions = pointerWithin(args);
    if (pointerCollisions.length === 0) return closestCenter(args);

    const containers = args.droppableContainers;

    const activeContainer = containers.find((dc) => dc.id === activeId);
    if (!activeContainer) return pointerCollisions;

    const activeData = getSpatialDragData(activeContainer);
    if (!activeData) return pointerCollisions;

    const sortableCollisions = pointerCollisions
      .filter((c) => {
        const container = containers.find((dc) => dc.id === c.id);
        return getSpatialDragData(container)?.type === 'spatial-capsule';
      })
      .map((collision) => {
        const container = containers.find((dc) => dc.id === collision.id);
        const containerData = getSpatialDragData(container);
        const rect = collision.data?.droppableRect;
        if (!rect || !container) return collision;

        const centerX = rect.left + rect.width / 2;
        const isRight = pointerPos.x >= centerX;

        // For reordering (same zone): determine insertion position
        if (
          activeData.type === 'spatial-capsule' &&
          activeData.zoneId === containerData?.zoneId &&
          activeData.isActive &&
          containerData?.isActive
        ) {
          const overSortable = containers.filter((dc) => {
            const d = getSpatialDragData(dc);
            return d?.type === 'spatial-capsule' && d.zoneId === activeData.zoneId && d.isActive;
          });
          const overIndex = overSortable.findIndex((dc) => dc.id === collision.id);
          const activeIndex = overSortable.findIndex((dc) => dc.id === activeId);

          if (overIndex >= 0 && activeIndex >= 0) {
            let adjustedIndex = overIndex;
            if (isRight && overIndex < overSortable.length - 1) {
              adjustedIndex = overIndex + 1;
            } else if (!isRight && overIndex > 0) {
              adjustedIndex = overIndex - 1;
            }
            return {
              ...collision,
              data: { ...collision.data, targetIndex: adjustedIndex },
            };
          }
        }

        // For activation: insert before/after the target
        if (
          activeData.type === 'spatial-capsule' &&
          !activeData.isActive &&
          containerData?.isActive
        ) {
          const activeSortable = containers.filter((dc) => {
            const d = getSpatialDragData(dc);
            return (
              d?.type === 'spatial-capsule' && d.zoneId === containerData?.zoneId && d.isActive
            );
          });
          const overIndex = activeSortable.findIndex((dc) => dc.id === collision.id);
          const targetIndex = isRight ? overIndex + 1 : overIndex;

          return {
            ...collision,
            data: { ...collision.data, targetIndex },
          };
        }

        return collision;
      });

    if (sortableCollisions.length > 0) {
      sortableCollisions.sort((a, b) => (a.data?.distance ?? 0) - (b.data?.distance ?? 0));
      return sortableCollisions;
    }

    return pointerCollisions;
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current;
      const fieldName = activeData?.fieldName as string | undefined;
      const zoneId = activeData?.zoneId as SpatialZoneId | undefined;
      if (!fieldName || !zoneId) return;

      activeDragIdRef.current = event.active.id as string;
      pointerPosRef.current = null;

      const field = fields.find((item) => item.name === fieldName);
      setActiveDragField({
        name: fieldName,
        zoneId,
        isCalculated: Boolean(field?.isCalculated),
        isMapped: Boolean(field?.isMapped),
      });

      document.addEventListener('pointermove', handlePointerMove);
    },
    [fields, handlePointerMove]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragField(null);
      activeDragIdRef.current = null;
      pointerPosRef.current = null;
      document.removeEventListener('pointermove', handlePointerMove);

      const { active, over } = event;
      const activeData = active.data.current;

      if (!over || !activeData) return;

      const overId = over.id as string;
      const activeFieldType = activeData.fieldType as 'dimension' | 'metric';
      const activeZoneId = activeData.zoneId as SpatialZoneId;
      const activeFieldName = activeData.fieldName as string;
      const overData = over.data.current;

      // Get target index from collision detection (set by left/right positioning)
      const targetIndex = overData?.targetIndex as number | undefined;

      const extractZoneId = (id: string): SpatialZoneId | null => {
        if (id.startsWith('values')) return 'values';
        if (id.startsWith('rows')) return 'rows';
        if (id.startsWith('columns')) return 'columns';
        if (id.includes('::')) {
          return id.split('::')[0] as SpatialZoneId;
        }
        return null;
      };

      const isCrossZone = (srcZone: SpatialZoneId, targetId: string): boolean => {
        const targetZone = extractZoneId(targetId);
        return targetZone !== null && srcZone !== targetZone;
      };

      const activateFieldForZone = (
        zoneId: SpatialZoneId,
        fieldName: string,
        insertIndex?: number
      ) => {
        if (zoneId === 'values') {
          const field = measures.find((f) => f.name === fieldName);
          if (field) toggleValueField(field, insertIndex);
          return;
        }

        const field = dimensions.find((f) => f.name === fieldName);
        if (!field) return;

        if (zoneId === 'rows') {
          toggleRowField(field, insertIndex);
        } else if (zoneId === 'columns') {
          toggleColField(field, insertIndex);
        }
      };

      const deactivateFieldForZone = (zoneId: SpatialZoneId, fieldName: string) => {
        if (zoneId === 'values') {
          removeValueField(fieldName);
          return;
        }
        if (zoneId === 'rows') {
          removeRowField(fieldName);
        } else if (zoneId === 'columns') {
          removeColField(fieldName);
        }
      };

      if (overData?.type === 'priority-slot') {
        const targetZoneId = overData.zoneId as SpatialZoneId;
        const slotIndex = overData.slotIndex as number;
        const isActive = activeData.isActive as boolean;

        if (activeZoneId !== targetZoneId) {
          if (canDropToZone(activeFieldType, targetZoneId)) {
            transferField(activeFieldName, activeZoneId, targetZoneId, slotIndex);
          }
          return;
        }

        if (isActive) {
          moveFieldToIndex(activeZoneId, activeFieldName, slotIndex);
        } else {
          activateFieldAtIndex(activeZoneId, activeFieldName, slotIndex);
        }
        return;
      }

      if (isCrossZone(activeZoneId, overId)) {
        const targetZoneId = extractZoneId(overId);
        if (targetZoneId && canDropToZone(activeFieldType, targetZoneId)) {
          transferField(activeFieldName, activeZoneId, targetZoneId);
        }
        return;
      }

      if (overData?.type === 'active-zone') {
        const isActive = activeData.isActive as boolean;
        if (!isActive) {
          activateFieldForZone(activeZoneId, activeFieldName);
        }
        return;
      }

      if (overData?.type === 'inactive-zone') {
        const isActive = activeData.isActive as boolean;
        if (isActive) {
          deactivateFieldForZone(activeZoneId, activeFieldName);
        }
        return;
      }

      if (overData?.type === 'spatial-capsule') {
        const overZoneId = overData.zoneId as SpatialZoneId;
        if (activeZoneId !== overZoneId) return;

        const isActive = activeData.isActive as boolean;
        const isOverActive = overData.isActive as boolean;

        if (isActive && isOverActive) {
          // Swap positions: two active fields exchange dimension levels
          reorderFields(activeZoneId, activeFieldName, overData.fieldName);
        } else if (!isActive && isOverActive) {
          // Activate at position (left/right of the target capsule)
          activateFieldForZone(activeZoneId, activeFieldName, targetIndex);
        } else if (isActive && !isOverActive) {
          // Deactivate
          deactivateFieldForZone(activeZoneId, activeFieldName);
        }
      }
    },
    [
      reorderFields,
      moveFieldToIndex,
      activateFieldAtIndex,
      transferField,
      measures,
      dimensions,
      toggleValueField,
      toggleRowField,
      toggleColField,
      removeRowField,
      removeColField,
      removeValueField,
      handlePointerMove,
    ]
  );

  const handleDragCancel = useCallback(() => {
    setActiveDragField(null);
    activeDragIdRef.current = null;
    pointerPosRef.current = null;
    document.removeEventListener('pointermove', handlePointerMove);
  }, [handlePointerMove]);

  return {
    activeDragField,
    setActiveDragField,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    collisionDetection,
    sensors,
  };
}
