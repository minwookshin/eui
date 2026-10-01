/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useRef } from 'react';
import { fireEvent, waitFor } from '@testing-library/react';
import { render } from '../../../../test/rtl';

import { EuiDataGridColumnCellAction } from '../../data_grid_types';
import {
  EuiDataGridCellActions,
  EuiDataGridCellPopoverActions,
} from './data_grid_cell_actions';

const MockAction: EuiDataGridColumnCellAction = ({ Component }) => (
  <Component iconType="star" data-test-subj="mockCellAction" />
);

describe('EuiDataGridCellActions', () => {
  const requiredProps = {
    onExpandClick: jest.fn(),
    popoverAnchorRef: () => {},
    rowIndex: 0,
    colIndex: 0,
    cellHeightType: 'default',
  };

  it('moves actions below an obstructing header and back above under the sticky header', async () => {
    let cellTop = 130;
    const rect = (top: number, height: number) => ({
      top,
      bottom: top + height,
      left: 20,
      right: 320,
      width: 300,
      height,
      x: 20,
      y: top,
      toJSON: () => ({}),
    });
    const bounds = jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('euiDataGridHeaderCell')
          ? rect(100, 30)
          : this.classList.contains('euiDataGridRowCell')
          ? rect(cellTop, 36)
          : rect(100, 300);
      });
    const height = jest
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockReturnValue(22);
    const getStyle = window.getComputedStyle;
    const styles = jest
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element) => getStyle(element));
    function Grid() {
      const cellRef = useRef<HTMLDivElement>(null);
      return (
        <div className="euiDataGrid">
          <div className="euiDataGrid__virtualized">
            <div className="euiDataGridHeaderCell" />
            <div ref={cellRef} className="euiDataGridRowCell" tabIndex={0}>
              <EuiDataGridCellActions {...requiredProps} cellRef={cellRef} />
            </div>
          </div>
        </div>
      );
    }
    try {
      const { container, getByTestSubject, unmount } = render(<Grid />);
      const cell = container.querySelector<HTMLElement>('.euiDataGridRowCell')!;
      const wrapper = () =>
        getByTestSubject('euiDataGridCellExpandButton').closest(
          '.euiDataGridRowCell__actionsWrapper'
        )!;
      await waitFor(() =>
        expect(wrapper()).toHaveAttribute('data-placement', 'below')
      );
      expect(cell.contains(wrapper())).toBe(false);
      expect(wrapper()).toHaveStyle({ insetBlockStart: '165px' });
      cellTop = 125;
      fireEvent.scroll(container.querySelector('.euiDataGrid__virtualized')!);
      await waitFor(() =>
        expect(wrapper()).not.toHaveAttribute('data-placement')
      );
      expect(cell.contains(wrapper())).toBe(true);
      cellTop = 170;
      fireEvent.scroll(window);
      await waitFor(() =>
        expect(wrapper()).not.toHaveAttribute('data-placement')
      );
      cellTop = 130;
      fireEvent.resize(window);
      await waitFor(() =>
        expect(wrapper()).toHaveAttribute('data-placement', 'below')
      );
      unmount();
      expect(
        document.querySelector('.euiDataGridRowCell__actionsWrapper')
      ).toBeNull();
    } finally {
      bounds.mockRestore();
      height.mockRestore();
      styles.mockRestore();
    }
  });

  it('renders an expand button', () => {
    const { getByTestSubject } = render(
      <EuiDataGridCellActions {...requiredProps} />
    );

    expect(getByTestSubject('euiDataGridCellExpandButton'))
      .toMatchInlineSnapshot(`
      <button
        aria-hidden="true"
        class="euiButtonIcon euiDataGridRowCell__actionButtonIcon euiDataGridRowCell__expandCell emotion-euiButtonIcon-xs-empty-text-euiDataGridRowCell__actionButtonIcon"
        data-test-subj="euiDataGridCellExpandButton"
        tabindex="-1"
        type="button"
      >
        <span
          aria-hidden="true"
          class="euiButtonIcon__icon"
          color="inherit"
          data-euiicon-type="maximize"
        />
      </button>
    `);
  });

  it('renders cell actions as `EuiButtonIcon`s', () => {
    const { getByTestSubject } = render(
      <EuiDataGridCellActions
        {...requiredProps}
        column={{ id: 'someId', cellActions: [MockAction] }}
      />
    );

    expect(getByTestSubject('mockCellAction')).toMatchInlineSnapshot(`
      <button
        aria-hidden="true"
        class="euiButtonIcon euiDataGridRowCell__actionButtonIcon emotion-euiButtonIcon-xs-empty-text-euiDataGridRowCell__actionButtonIcon"
        data-test-subj="mockCellAction"
        tabindex="-1"
        type="button"
      >
        <span
          aria-hidden="true"
          class="euiButtonIcon__icon"
          color="inherit"
          data-euiicon-type="star"
        />
      </button>
    `);
  });

  it('renders both cell actions and expand button', () => {
    const { getByTestSubject } = render(
      <EuiDataGridCellActions
        {...requiredProps}
        column={{ id: 'someId', cellActions: [MockAction] }}
      />
    );

    expect(getByTestSubject('euiDataGridCellExpandButton')).toBeInTheDocument();
    expect(getByTestSubject('mockCellAction')).toBeInTheDocument();
  });

  describe('visible cell actions limit', () => {
    it('by default, does not render more than the first two primary cell actions', () => {
      const { getAllByTestSubject } = render(
        <EuiDataGridCellActions
          {...requiredProps}
          column={{
            id: 'someId',
            cellActions: [MockAction, MockAction, MockAction],
          }}
        />
      );

      expect(getAllByTestSubject('mockCellAction')).toHaveLength(2);
    });

    it('allows configuring the default number of visible cell actions', () => {
      const { getAllByTestSubject } = render(
        <EuiDataGridCellActions
          {...requiredProps}
          column={{
            id: 'someId',
            cellActions: [MockAction, MockAction, MockAction, MockAction],
            visibleCellActions: 3,
          }}
        />
      );

      expect(getAllByTestSubject('mockCellAction')).toHaveLength(3);
    });
  });
});

describe('EuiDataGridCellPopoverActions', () => {
  it('renders column cell actions as `EuiButtonEmpty`s', () => {
    const { getByTestSubject } = render(
      <EuiDataGridCellPopoverActions
        colIndex={0}
        rowIndex={0}
        column={{ id: 'someId', cellActions: [MockAction] }}
      />
    );

    expect(getByTestSubject('mockCellAction')).toMatchInlineSnapshot(`
      <button
        class="euiButtonEmpty emotion-euiButtonDisplay-euiButtonEmpty-s-empty-primary"
        data-test-subj="mockCellAction"
        type="button"
      >
        <span
          class="euiButtonEmpty__content emotion-euiButtonDisplayContent"
        >
          <span
            color="inherit"
            data-euiicon-type="star"
          />
          <span
            class="eui-textTruncate euiButtonEmpty__text css-1ryezsz-s"
          />
        </span>
      </button>
    `);
  });

  it('renders primary actions in their own footer, and all remaining secondary actions in a column footer', () => {
    const { container } = render(
      <EuiDataGridCellPopoverActions
        colIndex={0}
        rowIndex={0}
        column={{
          id: 'someId',
          cellActions: [MockAction, MockAction, MockAction],
        }}
      />
    );

    expect(container.querySelectorAll('.euiPopoverFooter')).toHaveLength(2);
  });

  it('uses visibleCellActions to configure the number of primary vs. secondary actions', () => {
    const { container } = render(
      <EuiDataGridCellPopoverActions
        colIndex={0}
        rowIndex={0}
        column={{
          id: 'someId',
          cellActions: [MockAction, MockAction, MockAction, MockAction],
          visibleCellActions: 3,
        }}
      />
    );

    const footers = container.querySelectorAll('.euiPopoverFooter');
    expect(footers[0].querySelectorAll('button')).toHaveLength(3);
    expect(footers[1].querySelectorAll('button')).toHaveLength(1);
  });

  it('does not render anything if the column has no cell actions', () => {
    const { container } = render(
      <EuiDataGridCellPopoverActions
        colIndex={0}
        rowIndex={0}
        column={{ id: 'noActions' }}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});
