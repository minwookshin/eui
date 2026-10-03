/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react';
import { render } from '../../../test/rtl';
import { Query } from '../query';
import {
  FieldValueSelectionFilter,
  FieldValueSelectionFilterProps,
  FieldValueOptionType,
} from './field_value_selection_filter';

const options = [{ value: 'feature' }, { value: 'bug' }];
const makeProps = (
  loader: () => Promise<FieldValueOptionType[]>
): FieldValueSelectionFilterProps => ({
  index: 0,
  query: Query.parse(''),
  onChange: jest.fn(),
  config: {
    type: 'field_value_selection',
    field: 'tag',
    name: 'Tag',
    options: loader,
  },
});

function deferred() {
  let resolve!: (options: FieldValueOptionType[]) => void;
  let reject!: () => void;
  const promise = new Promise<FieldValueOptionType[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('FieldValueSelectionFilter async lifecycle', () => {
  it('keeps empty-query loading lazy in Strict Mode', () => {
    const loader = jest.fn().mockResolvedValue(options);
    render(
      <React.StrictMode>
        <FieldValueSelectionFilter {...makeProps(loader)} />
      </React.StrictMode>
    );
    expect(loader).not.toHaveBeenCalled();
  });

  it('loads lazily and allows retrying after an error', async () => {
    const pending = deferred();
    const loader = jest
      .fn()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValue(options);
    const { getByRole, findByText, findByRole } = render(
      <FieldValueSelectionFilter {...makeProps(loader)} />
    );
    expect(loader).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Tag Selection' }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    await act(async () => pending.reject());
    expect(await findByText('Could not load options')).toBeInTheDocument();
    fireEvent.click(getByRole('button', { name: 'Tag Selection' }));
    fireEvent.click(getByRole('button', { name: 'Tag Selection' }));
    expect(await findByRole('option', { name: 'bug' })).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('uses the current query when pending requests resolve out of order', async () => {
    const first = deferred();
    const second = deferred();
    const loader = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const props = makeProps(loader);
    const { rerender, getByRole, findAllByRole } = render(
      <FieldValueSelectionFilter {...props} />
    );
    fireEvent.click(getByRole('button', { name: 'Tag Selection' }));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    rerender(
      <FieldValueSelectionFilter {...props} query={Query.parse('tag:bug')} />
    );
    await act(async () => second.resolve(options));
    await act(async () => first.resolve(options));
    const items = await findAllByRole('option');
    expect(items[0]).toHaveTextContent('bug');
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
  });

  it('does not reload when only the config object identity changes', async () => {
    const loader = jest.fn().mockResolvedValue(options);
    const props = { ...makeProps(loader), query: Query.parse('tag:bug') };
    const { rerender } = render(<FieldValueSelectionFilter {...props} />);
    await act(async () => {});
    rerender(
      <FieldValueSelectionFilter {...props} config={{ ...props.config }} />
    );
    expect(loader).toHaveBeenCalledTimes(1);
  });

  describe('cache cleanup', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      act(() => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    });

    it('reuses cached options until the original expiry', async () => {
      const loader = jest.fn().mockResolvedValue(options);
      const props = makeProps(loader);
      props.config.cache = 1000;
      const { getByRole } = render(<FieldValueSelectionFilter {...props} />);
      const toggle = async () => {
        await act(async () => {
          fireEvent.click(getByRole('button', { name: 'Tag Selection' }));
          jest.advanceTimersByTime(20);
        });
      };
      await toggle();
      expect(loader).toHaveBeenCalledTimes(1);
      await toggle();
      act(() => jest.advanceTimersByTime(500));
      await toggle();
      expect(loader).toHaveBeenCalledTimes(1);
      await toggle();
      act(() => jest.advanceTimersByTime(500));
      await toggle();
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('does not start a cache timer after unmounting during a request', async () => {
      const pending = deferred();
      const props = makeProps(() => pending.promise);
      props.config.cache = 1000;
      props.query = Query.parse('tag:bug');
      const { unmount } = render(<FieldValueSelectionFilter {...props} />);
      unmount();
      const count = jest.getTimerCount();
      await act(async () => pending.resolve(options));
      expect(jest.getTimerCount()).toBe(count);
    });
  });
});
