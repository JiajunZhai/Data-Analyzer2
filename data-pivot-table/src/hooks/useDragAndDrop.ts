import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useCallback, useState } from 'react';
import type { Field } from '../types';
import { canDropToZone, type SpatialZoneId } from '../utils/fieldHelpers';

interface DragField {
  name: string;
  zoneId: SpatialZoneId;
  isCalculated: boolean;
  isMapped: boolean;
}

interface UseDragAndDropProps {
  fields: Field[];
  measures: Field[];
  dimensions: Field[];
  toggleValueField: (field: Field) => void;
  toggleRowField: (field: Field) => void;
  toggleColField: (field: Field) => void;
  reorderFields: (zoneId: SpatialZoneId, activeName: string, overName: string) => void;
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
  reorderFields,
  moveFieldToIndex,
  activateFieldAtIndex,
  transferField,
}: UseDragAndDropProps) {
  const [activeDragField, setActiveDragField] = useState<DragField | null>(null);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeData = event.active.data.current;
      const fieldName = activeData?.fieldName as string | undefined;
      const zoneId = activeData?.zoneId as SpatialZoneId | undefined;
      if (!fieldName || !zoneId) return;

      const field = fields.find((item) => item.name === fieldName);
      setActiveDragField({
        name: fieldName,
        zoneId,
        isCalculated: Boolean(field?.isCalculated),
        isMapped: Boolean(field?.isMapped),
      });
    },
    [fields]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragField(null);
      const { active, over } = event;
      const activeData = active.data.current;

      if (!over || !activeData) return;

      const overId = over.id as string;
      const activeFieldType = activeData.fieldType as 'dimension' | 'metric';
      const activeZoneId = activeData.zoneId as SpatialZoneId;
      const activeFieldName = activeData.fieldName as string;
      const overData = over.data.current;

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

      const toggleFieldForZone = (zoneId: SpatialZoneId, fieldName: string) => {
        if (zoneId === 'values') {
          const field = measures.find((f) => f.name === fieldName);
          if (field) toggleValueField(field);
          return;
        }

        const field = dimensions.find((f) => f.name === fieldName);
        if (!field) return;

        if (zoneId === 'rows') {
          toggleRowField(field);
        } else if (zoneId === 'columns') {
          toggleColField(field);
        }
      };

      if (overData?.type === 'priority-slot') {
        const targetZoneId = overData.zoneId as SpatialZoneId;
        const targetIndex = overData.slotIndex as number;
        const isActive = activeData.isActive as boolean;

        if (activeZoneId !== targetZoneId) {
          if (canDropToZone(activeFieldType, targetZoneId)) {
            transferField(activeFieldName, activeZoneId, targetZoneId, targetIndex);
          }
          return;
        }

        if (isActive) {
          moveFieldToIndex(activeZoneId, activeFieldName, targetIndex);
        } else {
          activateFieldAtIndex(activeZoneId, activeFieldName, targetIndex);
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
          toggleFieldForZone(activeZoneId, activeFieldName);
        }
        return;
      }

      if (overData?.type === 'inactive-zone') {
        const isActive = activeData.isActive as boolean;
        if (isActive) {
          toggleFieldForZone(activeZoneId, activeFieldName);
        }
        return;
      }

      if (overData?.type === 'spatial-capsule') {
        const overZoneId = overData.zoneId as SpatialZoneId;
        if (activeZoneId !== overZoneId) return;

        const isActive = activeData.isActive as boolean;
        const isOverActive = overData.isActive as boolean;

        if (isActive && isOverActive) {
          reorderFields(activeZoneId, activeFieldName, overData.fieldName);
        } else if (isActive !== isOverActive) {
          toggleFieldForZone(activeZoneId, activeFieldName);
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
    ]
  );

  return {
    activeDragField,
    setActiveDragField,
    handleDragStart,
    handleDragEnd,
  };
}
