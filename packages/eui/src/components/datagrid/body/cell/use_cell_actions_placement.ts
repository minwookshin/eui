/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { getElementZIndex } from '../../../../services/popover';

const usePlacementEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

// Only the fallback below a cell needs to escape the grid's overflow. Keeping
// the normal placement inside the cell preserves sticky-header occlusion.
export const useCellActionsPlacement = (
  cellRef?: RefObject<HTMLDivElement>
) => {
  const [below, setBelow] = useState(false);
  const actionsRef = useRef<HTMLDivElement | null>(null);

  const update = useCallback(() => {
    const cell = cellRef?.current;
    const actions = actionsRef.current;
    if (!cell || !actions) return;
    const grid = cell.closest('.euiDataGrid');
    const viewport = cell.closest(
      '.euiDataGrid__virtualized, .euiDataGrid__customRenderBody'
    );
    const header = grid?.querySelector('.euiDataGridHeaderCell');
    if (!viewport) return;
    const rect = cell.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    const top = Math.max(
      0,
      bounds.top,
      header?.getBoundingClientRect().bottom ?? bounds.top
    );
    const needsBelow =
      rect.top >= top - 1 && rect.top - top < actions.offsetHeight;
    setBelow(needsBelow);
    if (!needsBelow || actions.dataset.placement !== 'below') return;

    const view = cell.ownerDocument.defaultView!;
    const isRTL = view.getComputedStyle(cell).direction === 'rtl';
    const focused = cell.matches(
      ':focus, .euiDataGridRowCell--open, [data-keyboard-closing]'
    );
    const hovered =
      !focused && cell.matches(':hover, [data-gridcell-actions-hover]');
    const visible =
      (focused || hovered) &&
      rect.top < bounds.bottom &&
      rect.bottom > top &&
      rect.right > bounds.left &&
      rect.left < bounds.right;
    Object.assign(actions.style, {
      insetBlockStart: `${rect.bottom - 1}px`,
      insetInlineStart: `${isRTL ? view.innerWidth - rect.right : rect.left}px`,
      minWidth: hovered ? `${rect.width / 2}px` : '',
      visibility: visible ? 'visible' : 'hidden',
      direction: isRTL ? 'rtl' : 'ltr',
      zIndex: String(getElementZIndex(cell, actions)),
    });
    // A partially scrolled column must not draw over adjacent content.
    const left = isRTL ? rect.right - actions.offsetWidth : rect.left;
    actions.style.clipPath = `inset(0 ${Math.max(
      0,
      left + actions.offsetWidth - bounds.right
    )}px 0 ${Math.max(0, bounds.left - left)}px)`;
    actions.style.setProperty(
      '--euiDataGridCellActionsColor',
      view.getComputedStyle(cell, '::after').borderTopColor
    );
    actions.dataset.actionsActive = String(visible);
    actions.dataset.actionsHover = String(hovered);
  }, [cellRef]);

  const setActionsRef = useCallback(
    (node: HTMLDivElement | null) => {
      actionsRef.current = node;
      if (node) update();
    },
    [update]
  );

  // Focus, hover, expansion and theme changes can change the cell's outline.
  usePlacementEffect(update);
  useEffect(() => {
    const cell = cellRef?.current;
    if (!cell) return;
    update();
    const view = cell.ownerDocument.defaultView!;
    let frame: number | undefined;
    const schedule = () => {
      if (frame === undefined)
        frame = view.requestAnimationFrame(() => {
          frame = undefined;
          update();
        });
    };
    view.addEventListener('scroll', schedule, true);
    view.addEventListener('resize', schedule);
    cell.ownerDocument.addEventListener('focusin', schedule);
    cell.ownerDocument.addEventListener('focusout', schedule);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(schedule);
    observer?.observe(cell);
    const viewport = cell.closest(
      '.euiDataGrid__virtualized, .euiDataGrid__customRenderBody'
    );
    if (viewport) observer?.observe(viewport);
    const grid = cell.closest('.euiDataGrid');
    const header = grid?.querySelector('.euiDataGridHeaderCell');
    if (header) observer?.observe(header);
    // Row marking and virtual row offsets can change without resizing the cell.
    const appearance = new MutationObserver(schedule);
    for (
      let element: HTMLElement | null = cell;
      element;
      element = element.parentElement
    ) {
      appearance.observe(element, {
        attributes: true,
        attributeFilter: ['class', 'style'],
      });
      if (element === grid) break;
    }
    return () => {
      view.removeEventListener('scroll', schedule, true);
      view.removeEventListener('resize', schedule);
      cell.ownerDocument.removeEventListener('focusin', schedule);
      cell.ownerDocument.removeEventListener('focusout', schedule);
      observer?.disconnect();
      appearance.disconnect();
      if (frame !== undefined) view.cancelAnimationFrame(frame);
    };
  }, [cellRef, update]);

  return { below, setActionsRef };
};
