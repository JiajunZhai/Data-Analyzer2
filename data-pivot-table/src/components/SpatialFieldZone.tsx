import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { Link2 } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import type { Field, PivotField } from '../types';
import { animateFieldEntry, animateCollapse } from '../utils/animations';
import { getFieldType, getSpatialSortableId } from '../utils/fieldHelpers';
import type { SpatialZoneId } from '../utils/fieldHelpers';

// 注册 useGSAP 插件
gsap.registerPlugin(useGSAP);

interface SpatialFieldZoneProps {
  id: SpatialZoneId;
  title: string;
  hint: string;
  fields: Field[];
  activeFields: PivotField[];
  orientation: 'vertical' | 'horizontal';
  disabledFieldNames?: Set<string>;
  disabledReason?: string;
  onToggle: (field: Field) => void;
}

interface FieldCapsuleProps {
  field: Field;
  zoneId: SpatialZoneId;
  active: boolean;
  disabled: boolean;
  sortable: boolean;
  disabledReason?: string;
  onToggle?: (field: Field) => void;
}

const FieldCapsule: React.FC<FieldCapsuleProps> = ({
  field,
  zoneId,
  active,
  disabled,
  sortable,
  disabledReason,
}) => {
  const innerRef = useRef<HTMLDivElement>(null);
  const prevActiveRef = useRef(active);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: getSpatialSortableId(zoneId, field.name),
    data: {
      type: 'spatial-capsule',
      fieldType: getFieldType(field),
      zoneId,
      fieldName: field.name,
      isActive: active,
    },
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : undefined,
    boxShadow: isDragging ? '0 8px 20px rgba(0, 0, 0, 0.2)' : undefined,
    cursor: disabled ? 'not-allowed' : isDragging ? 'grabbing' : 'grab',
  };

  const stateClass = active ? 'active' : disabled ? 'locked' : 'inactive';
  const mappedClass = field.isMapped ? 'mapped' : '';
  const title = disabled ? disabledReason : active ? '拖拽排序，或拖到备选区停用' : '拖拽到插槽或已启用区启用';

  useEffect(() => {
    if (prevActiveRef.current !== active && innerRef.current) {
      animateFieldEntry(innerRef.current);
    }
    prevActiveRef.current = active;
  }, [active]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`spatial-capsule ${stateClass} ${sortable ? 'sortable' : ''} ${mappedClass}`}
      title={title}
      {...attributes}
      {...listeners}
    >
      <div ref={innerRef} className="field-capsule-inner">
        <span className="spatial-capsule-name">{field.name}</span>
        {field.isCalculated && <span className="spatial-capsule-badge">ƒx</span>}
        {field.isMapped && <span className="spatial-capsule-badge mapped-badge"><Link2 size={11} /></span>}
        {sortable && (
          <span className="spatial-capsule-handle" aria-label="拖拽排序">
            ⋮⋮
          </span>
        )}
      </div>
    </div>
  );
};

interface PrioritySlotProps {
  zoneId: SpatialZoneId;
  index: number;
  field?: Field;
  disabledReason?: string;
}

const PrioritySlot: React.FC<PrioritySlotProps> = ({
  zoneId,
  index,
  field,
  disabledReason,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: `${zoneId}-slot-${index}`,
    data: {
      type: 'priority-slot',
      zoneId,
      slotIndex: index,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`priority-slot ${field ? 'occupied' : 'empty'} ${isOver ? 'drag-over' : ''}`}
      data-slot={index + 1}
      title={field ? `优先级 ${index + 1}: ${field.name}` : `拖入优先级 ${index + 1}`}
    >
      {field ? (
        <FieldCapsule
          field={field}
          zoneId={zoneId}
          active={true}
          disabled={false}
          sortable={true}
          disabledReason={disabledReason}
        />
      ) : (
        <span className="priority-slot-num">{index + 1}</span>
      )}
    </div>
  );
};

const SpatialFieldZone: React.FC<SpatialFieldZoneProps> = ({
  id,
  title,
  hint,
  fields,
  activeFields,
  orientation,
  disabledFieldNames = new Set(),
  disabledReason,
  onToggle,
}) => {
  const [isInactiveExpanded, setIsInactiveExpanded] = useState(true);
  const containerRef = useRef<HTMLElement>(null);
  const inactiveContentRef = useRef<HTMLDivElement>(null);

  const activeNames = useMemo(() => activeFields.map(pivotField => pivotField.field.name), [activeFields]);
  const activeNameSet = useMemo(() => new Set(activeNames), [activeNames]);
  const activeItems = useMemo(
    () => activeFields.map(pivotField => pivotField.field),
    [activeFields]
  );
  const inactiveItems = useMemo(
    () => fields.filter(field => !activeNameSet.has(field.name)),
    [fields, activeNameSet]
  );

  const sortableIds = activeNames.map(fieldName => getSpatialSortableId(id, fieldName));

  // 已启用区 droppable
  const { setNodeRef: setActiveRef, isOver: isOverActive } = useDroppable({
    id: `${id}-active-zone`,
    data: {
      type: 'active-zone',
      zoneId: id,
      accepts: id === 'values' ? ['metric'] : ['dimension'],
    },
  });

  // 备选区 droppable
  const { setNodeRef: setInactiveRef, isOver: isOverInactive } = useDroppable({
    id: `${id}-inactive-zone`,
    data: {
      type: 'inactive-zone',
      zoneId: id,
    },
  });

  // 使用 useGSAP 管理动画上下文
  const { contextSafe } = useGSAP(() => {
    // 初始化动画设置
  }, { scope: containerRef });

  // 折叠切换动画 - 使用 useCallback 定义，在事件处理时调用
  const toggleInactive = useCallback(() => {
    // 使用 contextSafe 包装动画逻辑
    const animateToggle = contextSafe(() => {
      const content = containerRef.current?.querySelector('.sub-zone-content') as HTMLElement;
      if (!content) return;

      if (isInactiveExpanded) {
        animateCollapse(content, true, () => setIsInactiveExpanded(false));
      } else {
        setIsInactiveExpanded(true);
        animateCollapse(content, false);
      }
    });
    animateToggle();
  }, [isInactiveExpanded, contextSafe]);

  const activeZoneClass = `zone-active-${id}`;
  const activeDropClass = isOverActive ? 'drag-over' : '';
  const inactiveDropClass = isOverInactive ? 'drag-over' : '';
  const isHorizontal = orientation === 'horizontal';
  const usesPrioritySlots = id === 'rows' || id === 'columns';
  const slotItems = Array.from({ length: 5 }, (_, index) => activeItems[index]);

  return (
    <section ref={containerRef} className={`spatial-zone spatial-zone-${id} spatial-zone-${orientation}`}>
      <div className="spatial-zone-header">
        <span className="spatial-zone-title">{title}</span>
        <span className="spatial-zone-count">{activeFields.length}</span>
      </div>
      <div className="spatial-zone-body">
        {fields.length === 0 ? (
          <div className="spatial-zone-empty">{hint}</div>
        ) : isHorizontal ? (
          <div className="column-flow-zone">
            <div
              ref={setActiveRef}
              className={`column-flow-active ${activeDropClass}`}
            >
              <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                <div className="priority-slots-track priority-slots-columns">
                  {slotItems.map((field, index) => (
                    <PrioritySlot
                      key={`${id}-slot-${index}`}
                      zoneId={id}
                      index={index}
                      field={field}
                    />
                  ))}
                </div>
              </SortableContext>
              {activeItems.length === 0 && (
                <div className="column-flow-placeholder">拖入维度</div>
              )}
            </div>

            <div className="column-flow-divider" aria-hidden="true" />

            <div
              ref={setInactiveRef}
              className={`column-flow-inactive ${inactiveDropClass}`}
            >
              {inactiveItems.map(field => {
                const disabled = disabledFieldNames.has(field.name);
                return (
                  <FieldCapsule
                    key={field.name}
                    field={field}
                    zoneId={id}
                    active={false}
                    disabled={disabled}
                    sortable={false}
                    disabledReason={disabled ? disabledReason : undefined}
                    onToggle={onToggle}
                  />
                );
              })}
              {inactiveItems.length === 0 && (
                <div className="column-flow-placeholder">全部已启用</div>
              )}
            </div>
          </div>
        ) : (
          /* 垂直布局（值/行配置区）：显示完整结构 */
          <>
            {/* 已启用区 */}
            <div className="sub-zone">
              <div className="sub-zone-title">已启用 · {activeFields.length}</div>
              <div
                ref={setActiveRef}
                className={`sub-drag-zone ${activeZoneClass} ${usesPrioritySlots ? 'slot-drag-zone' : ''} ${activeDropClass}`}
              >
                <SortableContext items={sortableIds} strategy={rectSortingStrategy}>
                  {usesPrioritySlots ? (
                    <div className="priority-slots-track priority-slots-rows">
                      {slotItems.map((field, index) => (
                        <PrioritySlot
                          key={`${id}-slot-${index}`}
                          zoneId={id}
                          index={index}
                          field={field}
                        />
                      ))}
                    </div>
                  ) : (
                    activeItems.map(field => (
                      <FieldCapsule
                        key={field.name}
                        field={field}
                        zoneId={id}
                        active={true}
                        disabled={false}
                        sortable={true}
                        onToggle={onToggle}
                      />
                    ))
                  )}
                </SortableContext>
                {activeItems.length === 0 && (
                  <div className="zone-placeholder">{usesPrioritySlots ? '拖入插槽以启用' : '拖入字段以启用'}</div>
                )}
              </div>
            </div>

            {/* 备选区 */}
            <div className="sub-zone">
              <div className="sub-zone-header" onClick={toggleInactive}>
                <span className="sub-zone-title">备选字段 ({inactiveItems.length})</span>
                <span className="sub-zone-toggle">{isInactiveExpanded ? '▾' : '▸'}</span>
              </div>
              <div
                ref={inactiveContentRef}
                className={`sub-zone-content ${isInactiveExpanded ? '' : 'collapsed'}`}
              >
                <div
                  ref={setInactiveRef}
                  className={`sub-drag-zone zone-inactive ${inactiveDropClass}`}
                >
                  {inactiveItems.map(field => {
                    const disabled = disabledFieldNames.has(field.name);
                    return (
                      <FieldCapsule
                        key={field.name}
                        field={field}
                        zoneId={id}
                        active={false}
                        disabled={disabled}
                        sortable={false}
                        disabledReason={disabled ? disabledReason : undefined}
                        onToggle={onToggle}
                      />
                    );
                  })}
                  {inactiveItems.length === 0 && (
                    <div className="zone-placeholder">所有字段已启用</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default SpatialFieldZone;
