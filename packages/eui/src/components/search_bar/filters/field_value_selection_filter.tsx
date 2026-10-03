/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, {
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useEuiTheme, useLatest } from '../../../services';
import { isArray, isNil } from '../../../services/predicate';
import { ExclusiveUnion } from '../../common';
import { EuiPopover, EuiPopoverTitle } from '../../popover';
import { EuiFilterButton } from '../../filter_group';
import { euiFilterGroupStyles } from '../../filter_group/filter_group.styles';
import { EuiSelectable, EuiSelectableProps } from '../../selectable';
import { EuiSelectableOptionCheckedType } from '../../../components/selectable/selectable_option';
import { EuiI18n } from '../../i18n';
import { Query } from '../query';
import { Clause, Operator, OperatorType, Value } from '../query/ast';

export interface FieldValueOptionType {
  field?: string;
  value: Value;
  name?: string;
  view?: ReactNode;
}

type OptionsLoader = () => Promise<FieldValueOptionType[]>;

type OptionsFilter = (
  name: string,
  query: string,
  options?: FieldValueOptionType[]
) => boolean;

type MultiSelect = boolean | 'and' | 'or';

export interface FieldValueSelectionFilterConfigType {
  type: 'field_value_selection';
  field?: string;
  name: string;
  /**
   * See {@link FieldValueOptionType}
   */
  options: FieldValueOptionType[] | OptionsLoader;
  filterWith?: 'prefix' | 'includes' | OptionsFilter;
  cache?: number;
  multiSelect?: MultiSelect;
  loadingMessage?: string;
  noOptionsMessage?: string;
  searchThreshold?: number;
  available?: () => boolean;
  autoClose?: boolean;
  operator?: OperatorType;
  autoSortOptions?: boolean;
}

export interface FieldValueSelectionFilterProps {
  index: number;
  config: FieldValueSelectionFilterConfigType;
  query: Query;
  onChange: (query: Query) => void;
}

const defaults = {
  config: {
    multiSelect: true,
    filterWith: 'prefix',
    searchThreshold: 10,
    autoSortOptions: true,
  },
};

interface LoadedOptions {
  unsorted: FieldValueOptionType[];
  sorted: FieldValueOptionType[];
}

const resolveChecked = (
  clause: Clause | undefined
): 'on' | 'off' | undefined => {
  if (clause) return Query.isMust(clause) ? 'on' : 'off';
};

export const FieldValueSelectionFilter: FC<FieldValueSelectionFilterProps> = (
  props
) => {
  const { query, config, onChange } = props;
  const euiThemeContext = useEuiTheme();
  const latestProps = useLatest(props);
  const selectableClassRef = useRef<EuiSelectable>(null);
  const cachedOptions = useRef<FieldValueOptionType[] | null>(null);
  const cacheTimeout = useRef<ReturnType<typeof setTimeout>>();
  const mounted = useRef(false);
  const previousQuery = useRef(query);
  const lastCheckedValue = useRef<Value>();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOptions, setLoadedOptions] = useState<LoadedOptions | null>(() =>
    isArray(config.options)
      ? { unsorted: config.options, sorted: config.options }
      : null
  );
  const [activeItemsCount, setActiveItemsCount] = useState(0);
  const autoSortOptions =
    config.autoSortOptions ?? defaults.config.autoSortOptions;
  const multiSelect = config.multiSelect ?? defaults.config.multiSelect;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(cacheTimeout.current);
    };
  }, []);

  const loadOptions = useCallback(async () => {
    setLoadedOptions(null);
    setError(null);
    const { options, cache } = latestProps.current!.config;
    let nextOptions: FieldValueOptionType[];
    try {
      if (isArray(options)) {
        nextOptions = options;
      } else {
        const cached = cachedOptions.current;
        nextOptions = cached ?? (await options());
        if (!mounted.current) return;
        // Cache expiry is measured from loading, not from reopening the popover.
        if (!cached && cache != null && cache > 0) {
          cachedOptions.current = nextOptions;
          clearTimeout(cacheTimeout.current);
          cacheTimeout.current = setTimeout(() => {
            cachedOptions.current = null;
          }, cache);
        }
      }
    } catch {
      if (mounted.current) setError('Could not load options');
      return;
    }

    if (!mounted.current) return;
    // A query may change while the options loader is pending.
    const { query, config } = latestProps.current!;
    const multiSelect = config.multiSelect ?? defaults.config.multiSelect;
    const items: Record<string, FieldValueOptionType[]> = {
      on: [],
      off: [],
      rest: [],
    };
    nextOptions.forEach((option) => {
      const field = option.field || config.field;
      if (field) {
        const clause =
          multiSelect === 'or'
            ? query.getOrFieldClause(field, option.value)
            : query.getSimpleFieldClause(field, option.value);
        items[resolveChecked(clause) ?? 'rest'].push(option);
      }
    });
    setError(null);
    setActiveItemsCount(items.on.length);
    setLoadedOptions({
      unsorted: nextOptions,
      sorted: [...items.on, ...items.off, ...items.rest],
    });
  }, [latestProps]);

  useEffect(() => {
    if (previousQuery.current !== query || query.text.length) loadOptions();
    previousQuery.current = query;
  }, [query, loadOptions]);

  useEffect(() => {
    if (!autoSortOptions || !loadedOptions || !lastCheckedValue.current) return;
    const sortedIndex = loadedOptions.sorted.findIndex(
      (option) => option.value === lastCheckedValue.current
    );
    if (sortedIndex >= 0) {
      selectableClassRef.current?.setState({ activeOptionIndex: sortedIndex });
    }
    lastCheckedValue.current = undefined;
  }, [loadedOptions, autoSortOptions]);

  const closePopover = () => setPopoverOpen(false);
  const onButtonClick = () => {
    if (!popoverOpen) {
      loadOptions();
    } else {
      setLoadedOptions(null);
      setError(null);
    }
    setPopoverOpen(!popoverOpen);
  };

  const onOptionClick = (
    field: string,
    value: Value,
    checked?: Omit<EuiSelectableOptionCheckedType, 'mixed'>
  ) => {
    const {
      config: { autoClose, operator = Operator.EQ },
    } = props;

    if (checked && autoSortOptions) {
      lastCheckedValue.current = value;
    }

    // If the consumer explicitly sets `autoClose`, always defer to that.
    // Otherwise, default to auto-closing for single selections and leaving the
    // popover open for multi-select (so users can continue selecting options)
    const shouldClosePopover = autoClose ?? !multiSelect;
    if (shouldClosePopover) {
      closePopover();
    }

    if (!multiSelect) {
      const query = checked
        ? props.query
            .removeSimpleFieldClauses(field)
            .addSimpleFieldValue(field, value, true, operator)
        : props.query.removeSimpleFieldClauses(field);

      onChange(query);
    } else if (multiSelect === 'or') {
      const query = checked
        ? props.query.addOrFieldValue(field, value, true, operator)
        : props.query.removeOrFieldValue(field, value);

      onChange(query);
    } else {
      const query = checked
        ? props.query.addSimpleFieldValue(field, value, true, operator)
        : props.query.removeSimpleFieldValue(field, value);

      onChange(query);
    }
  };

  const isActiveField = (field: string | undefined): boolean => {
    if (typeof field !== 'string') return false;
    return multiSelect === 'or'
      ? query.hasOrFieldClause(field)
      : query.hasSimpleFieldClause(field);
  };

  const options = autoSortOptions
    ? loadedOptions?.sorted
    : loadedOptions?.unsorted;

  const activeTop = isActiveField(config.field);
  const activeItem = options
    ? options.some((item) => isActiveField(item.field))
    : false;

  const active = (activeTop || activeItem) && activeItemsCount > 0;

  const button = (
    <EuiI18n
      token="euiFieldValueSelectionFilter.buttonLabelHint"
      default="Selection"
    >
      {(buttonLabelHint: string) => {
        const ariaLabel = `${config.name} ${buttonLabelHint}`;
        return (
          <EuiFilterButton
            iconType="chevronSingleDown"
            iconSide="right"
            isSelected={active}
            hasActiveFilters={active}
            numActiveFilters={active ? activeItemsCount : undefined}
            grow
            aria-label={ariaLabel}
            onClick={onButtonClick}
          >
            {config.name}
          </EuiFilterButton>
        );
      }}
    </EuiI18n>
  );

  const items = options
    ? options.map((option) => {
        const optionField = option.field || config.field;

        if (optionField == null) {
          throw new Error(
            'option.field or field should be provided in <FieldValueSelectionFilter/>'
          );
        }

        const clause =
          multiSelect === 'or'
            ? query.getOrFieldClause(optionField, option.value)
            : query.getSimpleFieldClause(optionField, option.value);

        const label = option.name || option.value.toString();

        const checked = resolveChecked(clause);
        return {
          label,
          checked,
          data: {
            view: option.view ?? label,
            value: option.value,
            optionField,
          },
        };
      })
    : [];

  const threshold = config.searchThreshold || defaults.config.searchThreshold;
  const isOverSearchThreshold = options && options.length >= threshold;

  let searchProps: ExclusiveUnion<
    { searchable: false },
    {
      searchable: true;
      searchProps: EuiSelectableProps['searchProps'];
    }
  > = {
    searchable: false,
  };

  if (isOverSearchThreshold) {
    searchProps = {
      searchable: true,
      searchProps: {
        compressed: true,
        disabled: error != null,
      },
    };
  }

  return (
    <EuiPopover
      button={button}
      isOpen={popoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downCenter"
      panelProps={{
        css: euiFilterGroupStyles(euiThemeContext).euiFilterGroup__popoverPanel,
      }}
    >
      <EuiSelectable<Partial<(typeof items)[number]['data']>>
        ref={selectableClassRef}
        singleSelection={!multiSelect}
        aria-label={config.name}
        options={items}
        renderOption={(option) => option.view}
        isLoading={isNil(options)}
        loadingMessage={config.loadingMessage}
        emptyMessage={config.noOptionsMessage}
        errorMessage={error}
        noMatchesMessage={config.noOptionsMessage}
        listProps={{
          isVirtualized: isOverSearchThreshold || false,
          autoFocus: true,
          paddingSize: 's',
        }}
        onChange={(options, event, changedOption) => {
          if (changedOption.data) {
            onOptionClick(
              changedOption.data.optionField,
              changedOption.data.value,
              changedOption.checked
            );
          }
        }}
        {...searchProps}
      >
        {(list, search) => (
          <>
            {isOverSearchThreshold && (
              <EuiPopoverTitle paddingSize="s">{search}</EuiPopoverTitle>
            )}
            {list}
          </>
        )}
      </EuiSelectable>
    </EuiPopover>
  );
};
